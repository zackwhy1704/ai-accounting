"""
Financial Reports API.
Generates: P&L, Balance Sheet, AR Aging, AP Aging, Trial Balance, Cash Flow Summary.
"""
from datetime import datetime, date, timezone, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from uuid import UUID

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import (
    Invoice, Bill, Contact, Account, JournalEntry, Transaction,
    InvoiceLineItem, BillLineItem, Product, StockAdjustment,
)

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/profit-loss")
async def profit_loss_report(
    start_date: str = Query(..., description="YYYY-MM-DD"),
    end_date: str = Query(..., description="YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Profit & Loss statement for a date range."""
    org_id = current_user["org_id"]
    start = datetime.fromisoformat(start_date).replace(tzinfo=timezone.utc)
    end = datetime.fromisoformat(end_date).replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)

    # Revenue: paid/partial invoices in period
    inv_result = await db.execute(
        select(func.sum(Invoice.total), func.count(Invoice.id))
        .where(
            Invoice.organization_id == org_id,
            Invoice.issue_date >= start,
            Invoice.issue_date <= end,
            Invoice.status.in_(["paid", "partial", "sent", "overdue"]),
        )
    )
    inv_row = inv_result.one()
    total_revenue = float(inv_row[0] or 0)
    invoice_count = int(inv_row[1] or 0)

    # Expenses: bills in period
    bill_result = await db.execute(
        select(func.sum(Bill.total), func.count(Bill.id))
        .where(
            Bill.organization_id == org_id,
            Bill.bill_date >= start,
            Bill.bill_date <= end,
            Bill.status.in_(["paid", "partial", "pending"]),
        )
    )
    bill_row = bill_result.one()
    total_expenses = float(bill_row[0] or 0)
    bill_count = int(bill_row[1] or 0)

    net_income = total_revenue - total_expenses

    return {
        "report_type": "profit_loss",
        "start_date": start_date,
        "end_date": end_date,
        "currency": "MYR",
        "sections": {
            "revenue": {
                "total": total_revenue,
                "invoice_count": invoice_count,
            },
            "expenses": {
                "total": total_expenses,
                "bill_count": bill_count,
            },
        },
        "net_income": net_income,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/ar-aging")
async def ar_aging_report(
    as_of_date: str = Query(None, description="YYYY-MM-DD, defaults to today"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Accounts Receivable aging: Current, 1-30, 31-60, 61-90, 90+ days."""
    org_id = current_user["org_id"]
    as_of = datetime.fromisoformat(as_of_date).replace(tzinfo=timezone.utc) if as_of_date else datetime.now(timezone.utc)

    result = await db.execute(
        select(Invoice, Contact)
        .join(Contact, Invoice.contact_id == Contact.id, isouter=True)
        .where(
            Invoice.organization_id == org_id,
            Invoice.status.in_(["sent", "partial", "overdue"]),
            (Invoice.total - Invoice.amount_paid) > 0,
        )
    )
    rows = result.all()

    buckets = {"current": [], "1_30": [], "31_60": [], "61_90": [], "over_90": []}

    for inv, contact in rows:
        if not inv.due_date:
            days_overdue = 0
        else:
            due = inv.due_date if inv.due_date.tzinfo else inv.due_date.replace(tzinfo=timezone.utc)
            days_overdue = (as_of - due).days

        amount = float(float(inv.total or 0) - float(inv.amount_paid or 0) or 0)
        entry = {
            "invoice_number": inv.invoice_number,
            "contact_name": contact.name if contact else "Unknown",
            "amount_due": amount,
            "due_date": inv.due_date.isoformat() if inv.due_date else None,
            "days_overdue": max(0, days_overdue),
        }

        if days_overdue <= 0:
            buckets["current"].append(entry)
        elif days_overdue <= 30:
            buckets["1_30"].append(entry)
        elif days_overdue <= 60:
            buckets["31_60"].append(entry)
        elif days_overdue <= 90:
            buckets["61_90"].append(entry)
        else:
            buckets["over_90"].append(entry)

    summary = {
        bucket: {"count": len(items), "total": sum(i["amount_due"] for i in items)}
        for bucket, items in buckets.items()
    }

    return {
        "report_type": "ar_aging",
        "as_of_date": as_of.strftime("%Y-%m-%d"),
        "currency": "MYR",
        "buckets": buckets,
        "summary": summary,
        "grand_total": sum(v["total"] for v in summary.values()),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/ap-aging")
async def ap_aging_report(
    as_of_date: str = Query(None, description="YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Accounts Payable aging: Current, 1-30, 31-60, 61-90, 90+ days."""
    org_id = current_user["org_id"]
    as_of = datetime.fromisoformat(as_of_date).replace(tzinfo=timezone.utc) if as_of_date else datetime.now(timezone.utc)

    result = await db.execute(
        select(Bill, Contact)
        .join(Contact, Bill.contact_id == Contact.id, isouter=True)
        .where(
            Bill.organization_id == org_id,
            Bill.status.in_(["pending", "partial", "overdue"]),
            (Bill.total - Bill.amount_paid) > 0,
        )
    )
    rows = result.all()

    buckets = {"current": [], "1_30": [], "31_60": [], "61_90": [], "over_90": []}

    for bill, contact in rows:
        if not bill.due_date:
            days_overdue = 0
        else:
            due = bill.due_date if bill.due_date.tzinfo else bill.due_date.replace(tzinfo=timezone.utc)
            days_overdue = (as_of - due).days

        amount = float(float(bill.total or 0) - float(bill.amount_paid or 0) or 0)
        entry = {
            "bill_number": bill.bill_number,
            "contact_name": contact.name if contact else "Unknown",
            "amount_due": amount,
            "due_date": bill.due_date.isoformat() if bill.due_date else None,
            "days_overdue": max(0, days_overdue),
        }

        if days_overdue <= 0:
            buckets["current"].append(entry)
        elif days_overdue <= 30:
            buckets["1_30"].append(entry)
        elif days_overdue <= 60:
            buckets["31_60"].append(entry)
        elif days_overdue <= 90:
            buckets["61_90"].append(entry)
        else:
            buckets["over_90"].append(entry)

    summary = {
        bucket: {"count": len(items), "total": sum(i["amount_due"] for i in items)}
        for bucket, items in buckets.items()
    }

    return {
        "report_type": "ap_aging",
        "as_of_date": as_of.strftime("%Y-%m-%d"),
        "currency": "MYR",
        "buckets": buckets,
        "summary": summary,
        "grand_total": sum(v["total"] for v in summary.values()),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/trial-balance")
async def trial_balance_report(
    as_of_date: str = Query(None, description="YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Trial balance as of a given date — sum of journal entry debits/credits by account."""
    org_id = current_user["org_id"]
    as_of = datetime.fromisoformat(as_of_date).replace(hour=23, minute=59, second=59, tzinfo=timezone.utc) if as_of_date else datetime.now(timezone.utc)

    result = await db.execute(
        select(
            Account.code,
            Account.name,
            Account.type,
            func.sum(JournalEntry.debit).label("total_debit"),
            func.sum(JournalEntry.credit).label("total_credit"),
        )
        .join(JournalEntry, JournalEntry.account_id == Account.id)
        .join(Transaction, JournalEntry.transaction_id == Transaction.id)
        .where(
            Account.organization_id == org_id,
            Transaction.date <= as_of,
            Transaction.is_posted == True,
        )
        .group_by(Account.id, Account.code, Account.name, Account.type)
        .order_by(Account.code)
    )
    rows = result.all()

    lines = []
    total_dr = 0.0
    total_cr = 0.0
    for row in rows:
        dr = float(row.total_debit or 0)
        cr = float(row.total_credit or 0)
        total_dr += dr
        total_cr += cr
        lines.append({
            "code": row.code,
            "name": row.name,
            "type": row.type,
            "debit": dr,
            "credit": cr,
            "balance": dr - cr,
        })

    return {
        "report_type": "trial_balance",
        "as_of_date": as_of.strftime("%Y-%m-%d"),
        "as_at": as_of.strftime("%Y-%m-%d"),
        "currency": "MYR",
        "lines": lines,
        "totals": {"debit": total_dr, "credit": total_cr},
        "is_balanced": abs(total_dr - total_cr) < 0.01,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/general-ledger")
async def general_ledger_report(
    from_date: str = Query(None, description="YYYY-MM-DD"),
    to_date: str = Query(None, description="YYYY-MM-DD"),
    account: str = Query(None, description="Account code or name filter"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """General Ledger — all journal entries grouped by account."""
    org_id = current_user["org_id"]
    now = datetime.now(timezone.utc)
    start = datetime.fromisoformat(from_date).replace(tzinfo=timezone.utc) if from_date else datetime(now.year, 1, 1, tzinfo=timezone.utc)
    end = datetime.fromisoformat(to_date).replace(hour=23, minute=59, second=59, tzinfo=timezone.utc) if to_date else now

    # Get all accounts
    acct_q = select(Account).where(Account.organization_id == org_id).order_by(Account.code)
    if account:
        acct_q = acct_q.where(
            Account.code.ilike(f"%{account}%") | Account.name.ilike(f"%{account}%")
        )
    acct_result = await db.execute(acct_q)
    accounts = acct_result.scalars().all()

    ledger_accounts = []
    for acct in accounts:
        # Opening balance: sum of all entries before start date
        opening_q = await db.execute(
            select(
                func.coalesce(func.sum(JournalEntry.debit), 0).label("dr"),
                func.coalesce(func.sum(JournalEntry.credit), 0).label("cr"),
            )
            .join(Transaction, JournalEntry.transaction_id == Transaction.id)
            .where(
                JournalEntry.account_id == acct.id,
                Transaction.date < start,
                Transaction.is_posted == True,
            )
        )
        opening_row = opening_q.one()
        opening_balance = float(opening_row.dr) - float(opening_row.cr)

        # Entries in period
        entries_q = await db.execute(
            select(
                Transaction.date,
                Transaction.description,
                Transaction.reference,
                JournalEntry.debit,
                JournalEntry.credit,
            )
            .join(Transaction, JournalEntry.transaction_id == Transaction.id)
            .where(
                JournalEntry.account_id == acct.id,
                Transaction.date >= start,
                Transaction.date <= end,
                Transaction.is_posted == True,
            )
            .order_by(Transaction.date)
        )
        entry_rows = entries_q.all()

        if not entry_rows and abs(opening_balance) < 0.01:
            continue  # Skip accounts with no activity

        entries = []
        running = opening_balance
        for row in entry_rows:
            dr = float(row.debit or 0)
            cr = float(row.credit or 0)
            running += dr - cr
            entries.append({
                "date": row.date.strftime("%Y-%m-%d") if row.date else None,
                "description": row.description or "",
                "reference": row.reference,
                "debit": dr,
                "credit": cr,
                "balance": running,
            })

        ledger_accounts.append({
            "account_code": acct.code,
            "account_name": acct.name,
            "account_type": acct.type,
            "opening_balance": opening_balance,
            "closing_balance": running if entries else opening_balance,
            "entries": entries,
        })

    return {
        "report_type": "general_ledger",
        "from_date": start.strftime("%Y-%m-%d"),
        "to_date": end.strftime("%Y-%m-%d"),
        "currency": "MYR",
        "accounts": ledger_accounts,
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
    start = datetime.fromisoformat(from_date).replace(tzinfo=timezone.utc)
    end = datetime.fromisoformat(to_date).replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)

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
            Invoice.status.in_(["paid", "partial", "sent", "overdue"]),
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
            Bill.bill_date >= start,
            Bill.bill_date <= end,
            Bill.status.in_(["paid", "partial", "pending"]),
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
    end_dt = datetime.fromisoformat(to_date)
    due_month = end_dt.month + 1
    due_year = end_dt.year
    if due_month > 12:
        due_month = 1
        due_year += 1
    import calendar
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


@router.get("/balance-sheet")
async def balance_sheet_report(
    as_of_date: str = Query(None, description="YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Balance Sheet as of a given date."""
    org_id = current_user["org_id"]
    as_of = datetime.fromisoformat(as_of_date).replace(hour=23, minute=59, second=59, tzinfo=timezone.utc) if as_of_date else datetime.now(timezone.utc)

    result = await db.execute(
        select(
            Account.type,
            func.sum(JournalEntry.debit).label("total_debit"),
            func.sum(JournalEntry.credit).label("total_credit"),
        )
        .join(JournalEntry, JournalEntry.account_id == Account.id)
        .join(Transaction, JournalEntry.transaction_id == Transaction.id)
        .where(
            Account.organization_id == org_id,
            Transaction.date <= as_of,
            Transaction.is_posted == True,
        )
        .group_by(Account.type)
    )
    rows = result.all()

    sections = {}
    for row in rows:
        dr = float(row.total_debit or 0)
        cr = float(row.total_credit or 0)
        t = row.type.lower() if row.type else "other"
        if t in ("asset", "assets"):
            sections.setdefault("assets", 0)
            sections["assets"] += dr - cr
        elif t in ("liability", "liabilities"):
            sections.setdefault("liabilities", 0)
            sections["liabilities"] += cr - dr
        elif t in ("equity",):
            sections.setdefault("equity", 0)
            sections["equity"] += cr - dr
        elif t in ("revenue", "income"):
            sections.setdefault("equity", 0)
            sections["equity"] += cr - dr  # Retained earnings
        elif t in ("expense", "expenses"):
            sections.setdefault("equity", 0)
            sections["equity"] -= dr - cr  # Reduces retained earnings

    total_assets = sections.get("assets", 0)
    total_liabilities = sections.get("liabilities", 0)
    total_equity = sections.get("equity", 0)

    return {
        "report_type": "balance_sheet",
        "as_of_date": as_of.strftime("%Y-%m-%d"),
        "currency": "MYR",
        "assets": total_assets,
        "liabilities": total_liabilities,
        "equity": total_equity,
        "liabilities_and_equity": total_liabilities + total_equity,
        "is_balanced": abs(total_assets - (total_liabilities + total_equity)) < 0.01,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/cash-flow")
async def cash_flow_report(
    start_date: str = Query(..., description="YYYY-MM-DD"),
    end_date: str = Query(..., description="YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Cash Flow Statement summary."""
    org_id = current_user["org_id"]
    start = datetime.fromisoformat(start_date).replace(tzinfo=timezone.utc)
    end = datetime.fromisoformat(end_date).replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)

    # Cash/bank accounts — movements during period
    cash_accounts = await db.execute(
        select(Account.id).where(
            Account.organization_id == org_id,
            Account.type.in_(["bank", "cash", "asset"]),
            Account.name.ilike("%cash%") | Account.name.ilike("%bank%"),
        )
    )
    cash_ids = [row[0] for row in cash_accounts.all()]

    if cash_ids:
        # Opening cash
        open_q = await db.execute(
            select(
                func.coalesce(func.sum(JournalEntry.debit), 0),
                func.coalesce(func.sum(JournalEntry.credit), 0),
            )
            .join(Transaction, JournalEntry.transaction_id == Transaction.id)
            .where(
                JournalEntry.account_id.in_(cash_ids),
                Transaction.date < start,
                Transaction.is_posted == True,
            )
        )
        orow = open_q.one()
        opening_cash = float(orow[0]) - float(orow[1])

        # Period movements
        period_q = await db.execute(
            select(
                func.coalesce(func.sum(JournalEntry.debit), 0),
                func.coalesce(func.sum(JournalEntry.credit), 0),
            )
            .join(Transaction, JournalEntry.transaction_id == Transaction.id)
            .where(
                JournalEntry.account_id.in_(cash_ids),
                Transaction.date >= start,
                Transaction.date <= end,
                Transaction.is_posted == True,
            )
        )
        prow = period_q.one()
        cash_in = float(prow[0])
        cash_out = float(prow[1])
    else:
        opening_cash = 0
        cash_in = 0
        cash_out = 0

    net_change = cash_in - cash_out
    closing_cash = opening_cash + net_change

    return {
        "report_type": "cash_flow",
        "start_date": start_date,
        "end_date": end_date,
        "currency": "MYR",
        "opening_cash": opening_cash,
        "cash_inflows": cash_in,
        "cash_outflows": cash_out,
        "net_change": net_change,
        "closing_cash": closing_cash,
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
    start = datetime.fromisoformat(start_date).replace(tzinfo=timezone.utc)
    end = datetime.fromisoformat(end_date).replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)

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
    start = datetime.fromisoformat(start_date).replace(tzinfo=timezone.utc)
    end = datetime.fromisoformat(end_date).replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)

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
            Bill.bill_date >= start,
            Bill.bill_date <= end,
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
    start = datetime.fromisoformat(start_date).replace(tzinfo=timezone.utc)
    end = datetime.fromisoformat(end_date).replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)

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


@router.get("/transaction-list")
async def transaction_list_report(
    start_date: str = Query(..., description="YYYY-MM-DD"),
    end_date: str = Query(..., description="YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Transaction list with journal entries for a date range."""
    org_id = current_user["org_id"]
    start = datetime.fromisoformat(start_date).replace(tzinfo=timezone.utc)
    end = datetime.fromisoformat(end_date).replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)

    result = await db.execute(
        select(Transaction)
        .where(
            Transaction.organization_id == org_id,
            Transaction.date >= start,
            Transaction.date <= end,
            Transaction.is_posted == True,
        )
        .order_by(Transaction.date)
    )
    transactions = result.scalars().all()

    total_debit = 0.0
    total_credit = 0.0
    tx_list = []

    for txn in transactions:
        entries_result = await db.execute(
            select(JournalEntry, Account)
            .join(Account, JournalEntry.account_id == Account.id, isouter=True)
            .where(JournalEntry.transaction_id == txn.id)
            .order_by(Account.code)
        )
        entry_rows = entries_result.all()

        entries = []
        for je, acct in entry_rows:
            dr = float(je.debit or 0)
            cr = float(je.credit or 0)
            total_debit += dr
            total_credit += cr
            entries.append({
                "account_code": acct.code if acct else None,
                "account_name": acct.name if acct else "Unknown",
                "debit": dr,
                "credit": cr,
            })

        tx_list.append({
            "date": txn.date.strftime("%Y-%m-%d") if txn.date else None,
            "description": txn.description or "",
            "reference": txn.reference,
            "source": txn.source,
            "entries": entries,
        })

    return {
        "start_date": start_date,
        "end_date": end_date,
        "transactions": tx_list,
        "total_debit": total_debit,
        "total_credit": total_credit,
    }


@router.get("/debtor-ledger")
async def debtor_ledger_report(
    start_date: str = Query(..., description="YYYY-MM-DD"),
    end_date: str = Query(..., description="YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Debtor ledger — invoices grouped by customer."""
    org_id = current_user["org_id"]
    start = datetime.fromisoformat(start_date).replace(tzinfo=timezone.utc)
    end = datetime.fromisoformat(end_date).replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)

    result = await db.execute(
        select(Invoice, Contact)
        .join(Contact, Invoice.contact_id == Contact.id, isouter=True)
        .where(
            Invoice.organization_id == org_id,
            Invoice.issue_date >= start,
            Invoice.issue_date <= end,
        )
        .order_by(Contact.name, Invoice.issue_date)
    )
    rows = result.all()

    from collections import defaultdict
    grouped = defaultdict(list)
    for inv, contact in rows:
        name = contact.name if contact else "Unknown"
        grouped[name].append(inv)

    grand_total_invoiced = 0.0
    grand_total_paid = 0.0
    grand_total_balance = 0.0
    customers = []

    for customer_name, invoices in grouped.items():
        inv_list = []
        total_invoiced = 0.0
        total_paid = 0.0
        total_balance = 0.0
        for inv in invoices:
            t = float(inv.total or 0)
            p = float(inv.amount_paid or 0)
            b = t - p
            total_invoiced += t
            total_paid += p
            total_balance += b
            inv_list.append({
                "invoice_number": inv.invoice_number,
                "date": inv.issue_date.strftime("%Y-%m-%d") if inv.issue_date else None,
                "due_date": inv.due_date.strftime("%Y-%m-%d") if inv.due_date else None,
                "total": t,
                "paid": p,
                "balance": b,
                "status": inv.status,
            })
        grand_total_invoiced += total_invoiced
        grand_total_paid += total_paid
        grand_total_balance += total_balance
        customers.append({
            "customer_name": customer_name,
            "invoices": inv_list,
            "total_invoiced": total_invoiced,
            "total_paid": total_paid,
            "total_balance": total_balance,
        })

    return {
        "start_date": start_date,
        "end_date": end_date,
        "customers": customers,
        "grand_total_invoiced": grand_total_invoiced,
        "grand_total_paid": grand_total_paid,
        "grand_total_balance": grand_total_balance,
    }


@router.get("/creditor-ledger")
async def creditor_ledger_report(
    start_date: str = Query(..., description="YYYY-MM-DD"),
    end_date: str = Query(..., description="YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Creditor ledger — bills grouped by vendor."""
    org_id = current_user["org_id"]
    start = datetime.fromisoformat(start_date).replace(tzinfo=timezone.utc)
    end = datetime.fromisoformat(end_date).replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)

    result = await db.execute(
        select(Bill, Contact)
        .join(Contact, Bill.contact_id == Contact.id, isouter=True)
        .where(
            Bill.organization_id == org_id,
            Bill.bill_date >= start,
            Bill.bill_date <= end,
        )
        .order_by(Contact.name, Bill.bill_date)
    )
    rows = result.all()

    from collections import defaultdict
    grouped = defaultdict(list)
    for bill, contact in rows:
        name = contact.name if contact else "Unknown"
        grouped[name].append(bill)

    grand_total_invoiced = 0.0
    grand_total_paid = 0.0
    grand_total_balance = 0.0
    vendors = []

    for vendor_name, bills in grouped.items():
        bill_list = []
        total_invoiced = 0.0
        total_paid = 0.0
        total_balance = 0.0
        for bill in bills:
            t = float(bill.total or 0)
            p = float(bill.amount_paid or 0)
            b = t - p
            total_invoiced += t
            total_paid += p
            total_balance += b
            bill_list.append({
                "bill_number": bill.bill_number,
                "date": bill.bill_date.strftime("%Y-%m-%d") if bill.bill_date else None,
                "due_date": bill.due_date.strftime("%Y-%m-%d") if bill.due_date else None,
                "total": t,
                "paid": p,
                "balance": b,
                "status": bill.status,
            })
        grand_total_invoiced += total_invoiced
        grand_total_paid += total_paid
        grand_total_balance += total_balance
        vendors.append({
            "vendor_name": vendor_name,
            "bills": bill_list,
            "total_invoiced": total_invoiced,
            "total_paid": total_paid,
            "total_balance": total_balance,
        })

    return {
        "start_date": start_date,
        "end_date": end_date,
        "vendors": vendors,
        "grand_total_invoiced": grand_total_invoiced,
        "grand_total_paid": grand_total_paid,
        "grand_total_balance": grand_total_balance,
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
    start = datetime.fromisoformat(start_date).replace(tzinfo=timezone.utc)
    end = datetime.fromisoformat(end_date).replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)

    result = await db.execute(
        select(InvoiceLineItem, Invoice, Contact)
        .join(Invoice, InvoiceLineItem.invoice_id == Invoice.id)
        .join(Contact, Invoice.contact_id == Contact.id, isouter=True)
        .where(
            Invoice.organization_id == org_id,
            Invoice.issue_date >= start,
            Invoice.issue_date <= end,
            InvoiceLineItem.tax_rate > 0,
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
    start = datetime.fromisoformat(start_date).replace(tzinfo=timezone.utc)
    end = datetime.fromisoformat(end_date).replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)

    result = await db.execute(
        select(BillLineItem, Bill, Contact)
        .join(Bill, BillLineItem.bill_id == Bill.id)
        .join(Contact, Bill.contact_id == Contact.id, isouter=True)
        .where(
            Bill.organization_id == org_id,
            Bill.bill_date >= start,
            Bill.bill_date <= end,
            BillLineItem.tax_rate > 0,
        )
        .order_by(Bill.bill_date)
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
            "date": bill.bill_date.strftime("%Y-%m-%d") if bill.bill_date else None,
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


@router.get("/stock-values")
async def stock_values_report(
    as_of_date: str = Query(None, description="YYYY-MM-DD (unused, values are current)"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Stock valuation — current inventory value by product."""
    org_id = current_user["org_id"]

    result = await db.execute(
        select(Product)
        .where(
            Product.organization_id == org_id,
            Product.track_inventory == True,
        )
        .order_by(Product.code)
    )
    products = result.scalars().all()

    total_value = 0.0
    items = []

    for p in products:
        qty = float(p.qty_on_hand or 0)
        cost = float(p.cost_price or 0)
        value = qty * cost
        total_value += value
        items.append({
            "code": p.code,
            "name": p.name,
            "product_type": p.product_type,
            "unit": p.unit,
            "qty_on_hand": qty,
            "cost_price": cost,
            "total_value": value,
        })

    return {
        "items": items,
        "total_value": total_value,
    }


@router.get("/inventory-summary")
async def inventory_summary_report(
    start_date: str = Query(..., description="YYYY-MM-DD"),
    end_date: str = Query(..., description="YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Inventory summary — movements per tracked product in period."""
    org_id = current_user["org_id"]
    start = datetime.fromisoformat(start_date).replace(tzinfo=timezone.utc)
    end = datetime.fromisoformat(end_date).replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)

    # Get all tracked products
    prod_result = await db.execute(
        select(Product)
        .where(
            Product.organization_id == org_id,
            Product.track_inventory == True,
        )
        .order_by(Product.code)
    )
    products = prod_result.scalars().all()
    product_map = {str(p.id): p for p in products}

    # Get confirmed stock adjustments in period
    adj_result = await db.execute(
        select(StockAdjustment)
        .where(
            StockAdjustment.organization_id == org_id,
            StockAdjustment.status == "confirmed",
            StockAdjustment.adjustment_date >= start,
            StockAdjustment.adjustment_date <= end,
        )
    )
    adjustments = adj_result.scalars().all()

    # Aggregate adjustment quantities per product
    from collections import defaultdict
    adj_in = defaultdict(float)
    adj_out = defaultdict(float)

    for adj in adjustments:
        for line in (adj.lines or []):
            pid = str(line.get("product_id", ""))
            qty = float(line.get("qty", 0))
            if qty > 0:
                adj_in[pid] += qty
            elif qty < 0:
                adj_out[pid] += abs(qty)

    items = []
    for p in products:
        pid = str(p.id)
        closing_qty = float(p.qty_on_hand or 0)
        in_qty = adj_in.get(pid, 0.0)
        out_qty = adj_out.get(pid, 0.0)
        net_adj = in_qty - out_qty
        opening_qty = closing_qty - net_adj
        items.append({
            "code": p.code,
            "name": p.name,
            "opening_qty": opening_qty,
            "adjustments_in": in_qty,
            "adjustments_out": out_qty,
            "closing_qty": closing_qty,
        })

    return {
        "start_date": start_date,
        "end_date": end_date,
        "items": items,
    }
