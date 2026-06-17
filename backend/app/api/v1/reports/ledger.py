"""Ledger reports: general ledger, transaction list, debtor ledger, creditor ledger."""
from collections import defaultdict
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from uuid import UUID

from app.core.database import get_db
from app.core.security import get_current_user
from ._util import parse_date
from app.models.models import (
    Invoice, Bill, Contact, Account, JournalEntry, Transaction,
)

router = APIRouter()


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
    start = parse_date(from_date, "from_date") if from_date else datetime(now.year, 1, 1, tzinfo=timezone.utc)
    end = parse_date(to_date, "to_date", end_of_day=True) if to_date else now

    # Get all accounts (optionally filtered)
    acct_q = select(Account).where(Account.organization_id == org_id).order_by(Account.code)
    if account:
        acct_q = acct_q.where(
            Account.code.ilike(f"%{account}%") | Account.name.ilike(f"%{account}%")
        )
    accounts = (await db.execute(acct_q)).scalars().all()
    acct_ids = [a.id for a in accounts]
    if not acct_ids:
        return {
            "report_type": "general_ledger",
            "from_date": start.strftime("%Y-%m-%d"), "to_date": end.strftime("%Y-%m-%d"),
            "currency": "MYR", "accounts": [], "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    # ONE query: opening balances for ALL accounts before `start`, grouped by account.
    # Org-scoped via Account join (CODE-2: pin organization_id explicitly).
    opening_rows = (await db.execute(
        select(
            JournalEntry.account_id,
            func.coalesce(func.sum(JournalEntry.debit), 0).label("dr"),
            func.coalesce(func.sum(JournalEntry.credit), 0).label("cr"),
        )
        .join(Transaction, JournalEntry.transaction_id == Transaction.id)
        .join(Account, Account.id == JournalEntry.account_id)
        .where(
            Account.organization_id == org_id,
            Transaction.organization_id == org_id,
            JournalEntry.account_id.in_(acct_ids),
            Transaction.date < start,
            Transaction.is_posted == True,
        )
        .group_by(JournalEntry.account_id)
    )).all()
    opening_by_acct = {r.account_id: float(r.dr) - float(r.cr) for r in opening_rows}

    # ONE query: all period entries for these accounts, ordered by account then date.
    entry_rows = (await db.execute(
        select(
            JournalEntry.account_id,
            Transaction.date,
            Transaction.description,
            Transaction.reference,
            JournalEntry.debit,
            JournalEntry.credit,
        )
        .join(Transaction, JournalEntry.transaction_id == Transaction.id)
        .join(Account, Account.id == JournalEntry.account_id)
        .where(
            Account.organization_id == org_id,
            Transaction.organization_id == org_id,
            JournalEntry.account_id.in_(acct_ids),
            Transaction.date >= start,
            Transaction.date <= end,
            Transaction.is_posted == True,
        )
        .order_by(JournalEntry.account_id, Transaction.date)
    )).all()
    entries_by_acct: dict = defaultdict(list)
    for r in entry_rows:
        entries_by_acct[r.account_id].append(r)

    # Assemble per-account in Python from the two result sets (2 queries total).
    ledger_accounts = []
    for acct in accounts:
        opening_balance = opening_by_acct.get(acct.id, 0.0)
        rows = entries_by_acct.get(acct.id, [])
        if not rows and abs(opening_balance) < 0.01:
            continue  # Skip accounts with no activity

        entries = []
        running = opening_balance
        for row in rows:
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


@router.get("/transaction-list")
async def transaction_list_report(
    start_date: str = Query(..., description="YYYY-MM-DD"),
    end_date: str = Query(..., description="YYYY-MM-DD"),
    account_id: UUID | None = Query(None, description="Filter to transactions touching this account"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Transaction list with journal entries for a date range."""
    org_id = current_user["org_id"]
    start = parse_date(start_date, "start_date")
    end = parse_date(end_date, "end_date", end_of_day=True)

    txn_query = (
        select(Transaction)
        .where(
            Transaction.organization_id == org_id,
            Transaction.date >= start,
            Transaction.date <= end,
            Transaction.is_posted == True,
        )
        .order_by(Transaction.date)
    )
    if account_id:
        matching_txn_ids = (
            select(JournalEntry.transaction_id)
            .where(JournalEntry.account_id == account_id)
            .scalar_subquery()
        )
        txn_query = txn_query.where(Transaction.id.in_(matching_txn_ids))

    result = await db.execute(txn_query)
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
    start = parse_date(start_date, "start_date")
    end = parse_date(end_date, "end_date", end_of_day=True)

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
    start = parse_date(start_date, "start_date")
    end = parse_date(end_date, "end_date", end_of_day=True)

    result = await db.execute(
        select(Bill, Contact)
        .join(Contact, Bill.contact_id == Contact.id, isouter=True)
        .where(
            Bill.organization_id == org_id,
            Bill.issue_date >= start,
            Bill.issue_date <= end,
        )
        .order_by(Contact.name, Bill.issue_date)
    )
    rows = result.all()

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
                "date": bill.issue_date.strftime("%Y-%m-%d") if bill.issue_date else None,
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
