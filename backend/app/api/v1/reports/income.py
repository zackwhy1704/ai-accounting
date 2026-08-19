"""Income-related reports: P&L, invoice summary, bill summary, payment summary, SST reports."""
import calendar
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.core.security import get_current_user
from ._util import parse_date, account_nature, PL_NATURES, NATURE_REVENUE, NATURE_COST_OF_SALES, NATURE_EXPENSE, NATURE_OTHER_INCOME, NATURE_OTHER_EXPENSE
from app.models.models import (
    Invoice, Bill, Contact,
    InvoiceLineItem, BillLineItem,
    Account, JournalEntry, Transaction,
)

router = APIRouter()


@router.get("/future-documents-count")
async def future_documents_count(
    after: str = Query(..., description="YYYY-MM-DD — count invoices/bills dated after this"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """How many invoices/bills fall outside a report's date range because
    they're dated after it — lets report pages show 'N future-dated
    documents not shown' instead of leaving the user wondering where a
    correctly-recorded but future-dated document went."""
    org_id = current_user["org_id"]
    cutoff = parse_date(after, "after", end_of_day=True)
    excluded = ("draft", "void", "cancelled")

    inv_count = (await db.execute(
        select(func.count()).select_from(Invoice).where(
            Invoice.organization_id == org_id,
            Invoice.issue_date > cutoff,
            Invoice.status.notin_(excluded),
        )
    )).scalar() or 0
    bill_count = (await db.execute(
        select(func.count()).select_from(Bill).where(
            Bill.organization_id == org_id,
            Bill.issue_date > cutoff,
            Bill.status.notin_(excluded),
        )
    )).scalar() or 0

    return {"after": after, "invoices": inv_count, "bills": bill_count, "total": inv_count + bill_count}


@router.get("/profit-loss")
async def profit_loss_report(
    start_date: str = Query(..., description="YYYY-MM-DD"),
    end_date: str = Query(..., description="YYYY-MM-DD"),
    include_budget: bool = Query(False, description="Add budget + variance columns from the fiscal-year budget"),
    project_id: str | None = Query(None, description="Filter to one project dimension"),
    department_id: str | None = Query(None, description="Filter to one department dimension"),
    compare: str | None = Query(None, description="previous_period | previous_year — adds comparative columns"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Accrual-based Profit & Loss for a date range, computed from the GENERAL LEDGER.

    Sums posted JournalEntry rows grouped by account over the period:
      - Revenue accounts (type revenue/income): net CREDIT balance (credit - debit)
      - Expense accounts (type expense/cogs):   net DEBIT balance (debit - credit)

    This is the correct accounting approach: it captures manual journals, credit/
    debit notes, and any non-invoice revenue, and never double-counts — unlike the
    previous version which summed Invoice.total / Bill.total from the subledger.
    """
    org_id = current_user["org_id"]
    start = parse_date(start_date, "start_date")
    end = parse_date(end_date, "end_date", end_of_day=True)

    pl_query = (
        select(
            Account.id, Account.code, Account.name, Account.type,
            func.coalesce(func.sum(JournalEntry.debit), 0).label("debit"),
            func.coalesce(func.sum(JournalEntry.credit), 0).label("credit"),
        )
        .join(JournalEntry, JournalEntry.account_id == Account.id)
        .join(Transaction, JournalEntry.transaction_id == Transaction.id)
        .where(
            Account.organization_id == org_id,
            Transaction.date >= start,
            Transaction.date <= end,
            Transaction.is_posted == True,
        )
    )
    # Dimension filters: the journal-entry value (manual-journal lines) overrides
    # the transaction value (document header); match on the effective dimension.
    if project_id:
        pl_query = pl_query.where(
            func.coalesce(JournalEntry.project_id, Transaction.project_id) == project_id
        )
    if department_id:
        pl_query = pl_query.where(
            func.coalesce(JournalEntry.department_id, Transaction.department_id) == department_id
        )
    result = await db.execute(
        pl_query.group_by(Account.id, Account.code, Account.name, Account.type).order_by(Account.code)
    )
    rows = result.all()

    # Comparative window: the immediately-preceding period of the same length,
    # or the same dates one year earlier. Same dimension filters apply.
    comparative_by_account: dict = {}
    comp_range = None
    if compare in ("previous_period", "previous_year"):
        if compare == "previous_year":
            from dateutil.relativedelta import relativedelta
            cstart, cend = start - relativedelta(years=1), end - relativedelta(years=1)
        else:
            span = end - start
            cend = start
            cstart = start - span
        comp_range = (cstart, cend)
        comp_query = (
            select(
                Account.id, Account.type,
                func.coalesce(func.sum(JournalEntry.debit), 0).label("debit"),
                func.coalesce(func.sum(JournalEntry.credit), 0).label("credit"),
            )
            .join(JournalEntry, JournalEntry.account_id == Account.id)
            .join(Transaction, JournalEntry.transaction_id == Transaction.id)
            .where(
                Account.organization_id == org_id,
                Transaction.date >= cstart,
                Transaction.date <= cend,
                Transaction.is_posted == True,
            )
        )
        if project_id:
            comp_query = comp_query.where(
                func.coalesce(JournalEntry.project_id, Transaction.project_id) == project_id
            )
        if department_id:
            comp_query = comp_query.where(
                func.coalesce(JournalEntry.department_id, Transaction.department_id) == department_id
            )
        comp_query = comp_query.add_columns(Account.code)
        for r in (await db.execute(comp_query.group_by(Account.id, Account.type, Account.code))).all():
            nature = account_nature(r.type, r.code)
            if nature in (NATURE_REVENUE, NATURE_OTHER_INCOME):
                comparative_by_account[r.id] = float(r.credit or 0) - float(r.debit or 0)
            elif nature in (NATURE_COST_OF_SALES, NATURE_EXPENSE, NATURE_OTHER_EXPENSE):
                comparative_by_account[r.id] = float(r.debit or 0) - float(r.credit or 0)

    # Optional budget overlay: sum monthly buckets for the calendar months the
    # report period covers (single-fiscal-year periods only, keyed by start year).
    budget_by_account: dict = {}
    if include_budget:
        from app.api.v1.budgets import budget_amount_for_period
        from app.models.models import BudgetLine
        budget_rows = (await db.execute(
            select(BudgetLine).where(
                BudgetLine.organization_id == org_id,
                BudgetLine.fiscal_year == start.year,
            )
        )).scalars().all()
        end_month = end.month if end.year == start.year else 12
        budget_by_account = {
            b.account_id: budget_amount_for_period(b.amounts, start.month, end_month)
            for b in budget_rows
        }

    # Five P&L buckets per the Malaysian statement flow:
    # (4) Revenue - (5) Cost of Sales = Gross Profit
    #   - (6) Expenses + (8) Other Income - (9) Other Expenses = Net Profit
    INCOME_SIDE = (NATURE_REVENUE, NATURE_OTHER_INCOME)
    buckets: dict = {n: {"lines": [], "total": 0.0, "budget": 0.0} for n in PL_NATURES}

    def _bucket_line(nature: str, acct_id, code, name, amount: float) -> None:
        bucket = buckets[nature]
        line = {"code": code, "name": name, "amount": amount}
        if include_budget:
            b = budget_by_account.pop(acct_id, 0.0)
            line["budget"] = b
            line["variance"] = round(amount - b, 2)
            bucket["budget"] += b
        if comp_range:
            c = comparative_by_account.pop(acct_id, 0.0)
            line["comparative"] = round(c, 2)
            line["change"] = round(amount - c, 2)
        bucket["lines"].append(line)
        bucket["total"] += amount

    for row in rows:
        nature = account_nature(row.type, row.code)
        if nature not in PL_NATURES:
            continue
        dr = float(row.debit or 0)
        cr = float(row.credit or 0)
        amount = (cr - dr) if nature in INCOME_SIDE else (dr - cr)
        if abs(amount) < 0.005 and row.id not in budget_by_account and row.id not in comparative_by_account:
            continue
        _bucket_line(nature, row.id, row.code, row.name, amount)

    # Accounts with activity only in the comparison period still belong on the report
    if comp_range and comparative_by_account:
        leftover_comp = (await db.execute(
            select(Account).where(Account.id.in_(comparative_by_account.keys()))
        )).scalars().all()
        for acct in leftover_comp:
            c = comparative_by_account.get(acct.id, 0.0)
            nature = account_nature(acct.type, acct.code)
            if abs(c) < 0.005 or nature not in PL_NATURES:
                continue
            buckets[nature]["lines"].append({"code": acct.code, "name": acct.name, "amount": 0.0,
                                             "comparative": round(c, 2), "change": round(-c, 2)})

    # Budgeted P&L accounts with no actuals in the period still belong on the report
    if include_budget and budget_by_account:
        leftover = (await db.execute(
            select(Account).where(Account.id.in_(budget_by_account.keys()))
        )).scalars().all()
        for acct in leftover:
            b = budget_by_account.get(acct.id, 0.0)
            nature = account_nature(acct.type, acct.code)
            if b == 0 or nature not in PL_NATURES:
                continue
            buckets[nature]["lines"].append({"code": acct.code, "name": acct.name, "amount": 0.0,
                                             "budget": b, "variance": round(-b, 2)})
            buckets[nature]["budget"] += b

    for bucket in buckets.values():
        bucket["total"] = round(bucket["total"], 2)
        bucket["lines"].sort(key=lambda l: l.get("code") or "")

    total_revenue = buckets[NATURE_REVENUE]["total"]
    total_cos = buckets[NATURE_COST_OF_SALES]["total"]
    total_exp = buckets[NATURE_EXPENSE]["total"]
    total_oi = buckets[NATURE_OTHER_INCOME]["total"]
    total_oe = buckets[NATURE_OTHER_EXPENSE]["total"]
    gross_profit = round(total_revenue - total_cos, 2)
    net_income = round(gross_profit - total_exp + total_oi - total_oe, 2)
    # Legacy aggregate (old two-section shape): everything cost-side in one number
    total_expenses = round(total_cos + total_exp + total_oe - total_oi, 2)
    budget_revenue = round(buckets[NATURE_REVENUE]["budget"] + buckets[NATURE_OTHER_INCOME]["budget"], 2)
    budget_expenses = round(buckets[NATURE_COST_OF_SALES]["budget"] + buckets[NATURE_EXPENSE]["budget"]
                            + buckets[NATURE_OTHER_EXPENSE]["budget"], 2)

    return {
        "report_type": "profit_loss",
        "start_date": start_date,
        "end_date": end_date,
        "currency": "MYR",
        "basis": "accrual_gl",  # signals GL-based computation to clients
        "sections": {
            "revenue": {
                "total": total_revenue,
                "invoice_count": len(buckets[NATURE_REVENUE]["lines"]),  # legacy key
                "lines": buckets[NATURE_REVENUE]["lines"],
            },
            "cost_of_sales": {
                "total": total_cos,
                "lines": buckets[NATURE_COST_OF_SALES]["lines"],
            },
            "expenses": {
                "total": total_exp,
                "bill_count": len(buckets[NATURE_EXPENSE]["lines"]),      # legacy key
                "lines": buckets[NATURE_EXPENSE]["lines"],
            },
            "other_income": {
                "total": total_oi,
                "lines": buckets[NATURE_OTHER_INCOME]["lines"],
            },
            "other_expense": {
                "total": total_oe,
                "lines": buckets[NATURE_OTHER_EXPENSE]["lines"],
            },
        },
        "gross_profit": gross_profit,
        "net_income": net_income,
        **({"budget": {
            "revenue_total": round(budget_revenue, 2),
            "expense_total": round(budget_expenses, 2),
            "net_income": round(budget_revenue - budget_expenses, 2),
            "net_variance": round(net_income - (budget_revenue - budget_expenses), 2),
        }} if include_budget else {}),
        **({"comparative": {
            "start_date": comp_range[0].strftime("%Y-%m-%d"),
            "end_date": comp_range[1].strftime("%Y-%m-%d"),
            "revenue_total": round(sum(l.get("comparative", 0.0) for l in revenue_lines), 2),
            "expense_total": round(sum(l.get("comparative", 0.0) for l in expense_lines), 2),
            "net_income": round(
                sum(l.get("comparative", 0.0) for l in revenue_lines)
                - sum(l.get("comparative", 0.0) for l in expense_lines), 2),
        }} if comp_range else {}),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/invoice-summary")
async def invoice_summary_report(
    start_date: str = Query(...),
    end_date: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Invoice Summary — aggregated invoices by status and customer."""
    org_id = current_user["org_id"]
    start = parse_date(start_date, "start_date")
    end = parse_date(end_date, "end_date", end_of_day=True)

    result = await db.execute(
        select(
            Contact.name,
            Invoice.status,
            func.count(Invoice.id).label("count"),
            func.sum(Invoice.total).label("total"),
            func.sum(Invoice.amount_paid).label("paid"),
        )
        .join(Contact, Invoice.contact_id == Contact.id, isouter=True)
        .where(
            Invoice.organization_id == org_id,
            Invoice.issue_date >= start,
            Invoice.issue_date <= end,
        )
        .group_by(Contact.name, Invoice.status)
        .order_by(Contact.name)
    )
    rows = result.all()

    items = []
    for row in rows:
        items.append({
            "customer_name": row.name or "Unknown",
            "status": row.status,
            "count": int(row.count),
            "total": float(row.total or 0),
            "amount_paid": float(row.paid or 0),
            "balance": float(row.total or 0) - float(row.paid or 0),
        })

    return {
        "report_type": "invoice_summary",
        "start_date": start_date,
        "end_date": end_date,
        "items": items,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/bill-summary")
async def bill_summary_report(
    start_date: str = Query(...),
    end_date: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Bill Summary — aggregated bills by status and vendor."""
    org_id = current_user["org_id"]
    start = parse_date(start_date, "start_date")
    end = parse_date(end_date, "end_date", end_of_day=True)

    result = await db.execute(
        select(
            Contact.name,
            Bill.status,
            func.count(Bill.id).label("count"),
            func.sum(Bill.total).label("total"),
            func.sum(Bill.amount_paid).label("paid"),
        )
        .join(Contact, Bill.contact_id == Contact.id, isouter=True)
        .where(
            Bill.organization_id == org_id,
            Bill.issue_date >= start,
            Bill.issue_date <= end,
        )
        .group_by(Contact.name, Bill.status)
        .order_by(Contact.name)
    )
    rows = result.all()

    items = []
    for row in rows:
        items.append({
            "vendor_name": row.name or "Unknown",
            "status": row.status,
            "count": int(row.count),
            "total": float(row.total or 0),
            "amount_paid": float(row.paid or 0),
            "balance": float(row.total or 0) - float(row.paid or 0),
        })

    return {
        "report_type": "bill_summary",
        "start_date": start_date,
        "end_date": end_date,
        "items": items,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/payment-summary")
async def payment_summary_report(
    start_date: str = Query(...),
    end_date: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Payment Summary — sales payments received in period."""
    org_id = current_user["org_id"]
    start = parse_date(start_date, "start_date")
    end = parse_date(end_date, "end_date", end_of_day=True)

    # Payments are invoices that have been paid
    result = await db.execute(
        select(
            Contact.name,
            func.count(Invoice.id).label("count"),
            func.sum(Invoice.amount_paid).label("total_paid"),
        )
        .join(Contact, Invoice.contact_id == Contact.id, isouter=True)
        .where(
            Invoice.organization_id == org_id,
            Invoice.issue_date >= start,
            Invoice.issue_date <= end,
            Invoice.amount_paid > 0,
        )
        .group_by(Contact.name)
        .order_by(Contact.name)
    )
    rows = result.all()

    items = []
    for row in rows:
        items.append({
            "customer_name": row.name or "Unknown",
            "invoice_count": int(row.count),
            "total_paid": float(row.total_paid or 0),
        })

    return {
        "report_type": "payment_summary",
        "start_date": start_date,
        "end_date": end_date,
        "items": items,
        "total": sum(i["total_paid"] for i in items),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/sst-02")
async def sst02_report(
    from_date: str = Query(..., description="YYYY-MM-DD"),
    to_date: str = Query(..., description="YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """SST-02 Malaysia Sales & Service Tax return summary."""
    org_id = current_user["org_id"]
    start = parse_date(from_date, "from_date")
    end = parse_date(to_date, "to_date", end_of_day=True)

    # Output tax from invoices (SST on sales)
    inv_result = await db.execute(
        select(
            func.coalesce(func.sum(Invoice.total), 0).label("taxable"),
            func.coalesce(func.sum(Invoice.tax_amount), 0).label("tax"),
        )
        .where(
            Invoice.organization_id == org_id,
            Invoice.issue_date >= start,
            Invoice.issue_date <= end,
            # Every finalized (GL-posted) invoice owes output tax regardless of
            # payment — include 'sent'/'viewed'/'overdue', exclude only drafts and
            # voided/cancelled. (Filtering by the unpaid-only set under-reported
            # output tax on issued-but-unpaid invoices.)
            Invoice.status.notin_(["draft", "void", "cancelled"]),
        )
    )
    inv_row = inv_result.one()
    sales_taxable = float(inv_row.taxable)
    sales_tax = float(inv_row.tax)

    # Input tax from bills (SST on purchases)
    bill_result = await db.execute(
        select(
            func.coalesce(func.sum(Bill.total), 0).label("taxable"),
            func.coalesce(func.sum(Bill.tax_amount), 0).label("tax"),
        )
        .where(
            Bill.organization_id == org_id,
            Bill.issue_date >= start,
            Bill.issue_date <= end,
            # Same as the sales side: a finalized bill posts input tax at
            # 'approved'/'outstanding'. Include all GL-posted statuses, exclude
            # only drafts/received-not-approved and voids. (The unpaid-only set
            # dropped 'approved' bills from SST input tax.)
            Bill.status.notin_(["draft", "received", "void", "cancelled"]),
        )
    )
    bill_row = bill_result.one()
    purchase_tax = float(bill_row.tax)

    # Build taxable items — SST 6% and Service Tax 6%
    taxable_items = []
    if sales_taxable > 0 or sales_tax > 0:
        taxable_items.append({
            "rate": "6%",
            "description": "Sales Tax / Service Tax",
            "taxable_amount": sales_taxable,
            "tax_amount": sales_tax,
        })

    net_tax = sales_tax - purchase_tax

    # Due date: last day of month following the quarter end
    end_dt = parse_date(to_date, "to_date")
    due_month = end_dt.month + 1
    due_year = end_dt.year
    if due_month > 12:
        due_month = 1
        due_year += 1
    due_day = calendar.monthrange(due_year, due_month)[1]
    due_date = f"{due_year}-{due_month:02d}-{due_day:02d}"

    return {
        "report_type": "sst_02",
        "registration_no": None,
        "period_from": from_date,
        "period_to": to_date,
        "due_date": due_date,
        "type_of_return": "Service Tax",
        "taxable_items": taxable_items,
        "total_taxable_amount": sales_taxable,
        "total_tax_payable": sales_tax,
        "total_input_tax": purchase_tax,
        "net_tax_payable": net_tax,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/sst-sales-detail")
async def sst_sales_detail_report(
    start_date: str = Query(..., description="YYYY-MM-DD"),
    end_date: str = Query(..., description="YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """SST Sales Detail — taxable invoice line items."""
    org_id = current_user["org_id"]
    start = parse_date(start_date, "start_date")
    end = parse_date(end_date, "end_date", end_of_day=True)

    result = await db.execute(
        select(InvoiceLineItem, Invoice, Contact)
        .join(Invoice, InvoiceLineItem.invoice_id == Invoice.id)
        .join(Contact, Invoice.contact_id == Contact.id, isouter=True)
        .where(
            Invoice.organization_id == org_id,
            Invoice.issue_date >= start,
            Invoice.issue_date <= end,
            InvoiceLineItem.tax_rate > 0,
            # Match the SST-02 summary: finalized invoices only (no drafts/voids).
            Invoice.status.notin_(["draft", "void", "cancelled"]),
        )
        .order_by(Invoice.issue_date)
    )
    rows = result.all()

    total_taxable = 0.0
    total_tax = 0.0
    items = []

    for line, inv, contact in rows:
        qty = float(line.quantity or 0)
        price = float(line.unit_price or 0)
        taxable_amount = float(line.amount or 0)
        tax_rate = float(line.tax_rate or 0)
        tax_amount = taxable_amount * tax_rate / 100
        total_taxable += taxable_amount
        total_tax += tax_amount
        items.append({
            "invoice_number": inv.invoice_number,
            "date": inv.issue_date.strftime("%Y-%m-%d") if inv.issue_date else None,
            "customer_name": contact.name if contact else "Unknown",
            "description": line.description or "",
            "quantity": qty,
            "unit_price": price,
            "taxable_amount": taxable_amount,
            "tax_rate": tax_rate,
            "tax_amount": tax_amount,
        })

    return {
        "start_date": start_date,
        "end_date": end_date,
        "items": items,
        "total_taxable": total_taxable,
        "total_tax": total_tax,
    }


@router.get("/sst-purchase-detail")
async def sst_purchase_detail_report(
    start_date: str = Query(..., description="YYYY-MM-DD"),
    end_date: str = Query(..., description="YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """SST Purchase Detail — taxable bill line items."""
    org_id = current_user["org_id"]
    start = parse_date(start_date, "start_date")
    end = parse_date(end_date, "end_date", end_of_day=True)

    result = await db.execute(
        select(BillLineItem, Bill, Contact)
        .join(Bill, BillLineItem.bill_id == Bill.id)
        .join(Contact, Bill.contact_id == Contact.id, isouter=True)
        .where(
            Bill.organization_id == org_id,
            Bill.issue_date >= start,
            Bill.issue_date <= end,
            BillLineItem.tax_rate > 0,
            # Match the SST-02 summary: finalized bills only.
            Bill.status.notin_(["draft", "received", "void", "cancelled"]),
        )
        .order_by(Bill.issue_date)
    )
    rows = result.all()

    total_taxable = 0.0
    total_tax = 0.0
    items = []

    for line, bill, contact in rows:
        qty = float(line.quantity or 0)
        price = float(line.unit_price or 0)
        taxable_amount = float(line.amount or 0)
        tax_rate = float(line.tax_rate or 0)
        tax_amount = taxable_amount * tax_rate / 100
        total_taxable += taxable_amount
        total_tax += tax_amount
        items.append({
            "bill_number": bill.bill_number,
            "date": bill.issue_date.strftime("%Y-%m-%d") if bill.issue_date else None,
            "vendor_name": contact.name if contact else "Unknown",
            "description": line.description or "",
            "quantity": qty,
            "unit_price": price,
            "taxable_amount": taxable_amount,
            "tax_rate": tax_rate,
            "tax_amount": tax_amount,
        })

    return {
        "start_date": start_date,
        "end_date": end_date,
        "items": items,
        "total_taxable": total_taxable,
        "total_tax": total_tax,
    }
