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
from app.models.models import Invoice, Bill, Contact, Account, JournalEntry, Transaction

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
        "currency": "MYR",
        "lines": lines,
        "totals": {"debit": total_dr, "credit": total_cr},
        "is_balanced": abs(total_dr - total_cr) < 0.01,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
