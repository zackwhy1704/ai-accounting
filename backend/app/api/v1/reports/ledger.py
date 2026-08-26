"""Ledger reports: general ledger, transaction list, debtor ledger, creditor ledger."""
from collections import defaultdict
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from uuid import UUID

from app.core.database import get_db
from app.core.security import get_current_user
from ._util import parse_date, account_nature, CREDIT_NATURES
from app.models.models import (
    Invoice, Bill, Contact, Account, JournalEntry, Transaction,
    CreditNote, SalesPayment, SalesRefund,
    PurchaseCreditNote, PurchasePayment, PurchaseRefund,
)

router = APIRouter()


@router.get("/general-ledger")
async def general_ledger_report(
    from_date: str = Query(None, description="YYYY-MM-DD"),
    to_date: str = Query(None, description="YYYY-MM-DD"),
    account: str = Query(None, description="Account code or name filter"),
    include_zero: bool = Query(False, description="Include active accounts with no activity in the period"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """General Ledger — all journal entries grouped by account."""
    org_id = current_user["org_id"]
    now = datetime.now(timezone.utc)
    start = parse_date(from_date, "from_date") if from_date else datetime(now.year, 1, 1, tzinfo=timezone.utc)
    end = parse_date(to_date, "to_date", end_of_day=True) if to_date else now

    # Get all accounts (optionally filtered). Restrict to postable "account" rows
    # (not header/subheader) so include_zero doesn't surface non-posting rows.
    acct_q = select(Account).where(
        Account.organization_id == org_id,
        Account.account_role == "account",
    ).order_by(Account.code)
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
            Transaction.source,
            Transaction.source_id,
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
        # Balances follow the account's natural side: debit-nature accounts
        # (assets, expenses) run dr-cr; credit-nature accounts (liabilities,
        # equity, revenue) run cr-dr so a normal AP balance reads POSITIVE.
        nature = account_nature(acct.type, acct.code)
        credit_natured = nature in CREDIT_NATURES
        opening_balance = round((-1.0 if credit_natured else 1.0) * opening_by_acct.get(acct.id, 0.0), 2)
        rows = entries_by_acct.get(acct.id, [])
        if not include_zero and not rows and abs(opening_balance) < 0.01:
            continue  # Skip accounts with no activity

        entries = []
        running = opening_balance
        for row in rows:
            dr = float(row.debit or 0)
            cr = float(row.credit or 0)
            running += (cr - dr) if credit_natured else (dr - cr)
            entries.append({
                "date": row.date.strftime("%Y-%m-%d") if row.date else None,
                "description": row.description or "",
                "reference": row.reference,
                "source": row.source,
                "source_id": str(row.source_id) if row.source_id else None,
                "debit": dr,
                "credit": cr,
                "balance": round(running, 2),
            })

        ledger_accounts.append({
            "code": acct.code,
            "name": acct.name,
            "account_type": acct.type,
            "nature": nature,
            "balance_side": "credit" if credit_natured else "debit",
            "opening_balance": opening_balance,
            "closing_balance": round(running if entries else opening_balance, 2),
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

    # ONE query for all journal entries across all matched transactions, instead
    # of a per-transaction query in the loop (was an N+1 — thousands of round-trips
    # for a busy date range). Group in Python by transaction_id.
    txn_ids = [t.id for t in transactions]
    entries_by_txn: dict = defaultdict(list)
    if txn_ids:
        je_rows = (await db.execute(
            select(JournalEntry, Account)
            .join(Account, JournalEntry.account_id == Account.id, isouter=True)
            .where(JournalEntry.transaction_id.in_(txn_ids))
            .order_by(Account.code)
        )).all()
        for je, acct in je_rows:
            dr = float(je.debit or 0)
            cr = float(je.credit or 0)
            total_debit += dr
            total_credit += cr
            entries_by_txn[je.transaction_id].append({
                "account_code": acct.code if acct else None,
                "account_name": acct.name if acct else "Unknown",
                "debit": dr,
                "credit": cr,
            })

    for txn in transactions:
        tx_list.append({
            "date": txn.date.strftime("%Y-%m-%d") if txn.date else None,
            "description": txn.description or "",
            "reference": txn.reference,
            "source": txn.source,
            "entries": entries_by_txn.get(txn.id, []),
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
    """Debtor ledger — a running Debit/Credit/Balance ledger per customer.
    Invoices raise the balance (Debit); payments and credit notes reduce it
    (Credit); refunds raise it back (Debit)."""
    org_id = current_user["org_id"]
    start = parse_date(start_date, "start_date")
    end = parse_date(end_date, "end_date", end_of_day=True)
    excluded = ("draft", "void", "cancelled")

    inv_rows = (await db.execute(
        select(Invoice, Contact)
        .join(Contact, Invoice.contact_id == Contact.id, isouter=True)
        .where(
            Invoice.organization_id == org_id,
            Invoice.issue_date >= start, Invoice.issue_date <= end,
            Invoice.status.notin_(excluded),
        )
    )).all()
    cn_rows = (await db.execute(
        select(CreditNote, Contact)
        .join(Contact, CreditNote.contact_id == Contact.id, isouter=True)
        .where(
            CreditNote.organization_id == org_id,
            CreditNote.issue_date >= start, CreditNote.issue_date <= end,
            CreditNote.status.in_(("issued", "applied")),
        )
    )).all()
    pay_rows = (await db.execute(
        select(SalesPayment, Contact)
        .join(Contact, SalesPayment.contact_id == Contact.id, isouter=True)
        .where(
            SalesPayment.organization_id == org_id,
            SalesPayment.payment_date >= start, SalesPayment.payment_date <= end,
            SalesPayment.status == "completed",
        )
    )).all()
    ref_rows = (await db.execute(
        select(SalesRefund, Contact)
        .join(Contact, SalesRefund.contact_id == Contact.id, isouter=True)
        .where(
            SalesRefund.organization_id == org_id,
            SalesRefund.refund_date >= start, SalesRefund.refund_date <= end,
            SalesRefund.status == "completed",
        )
    )).all()

    grouped: dict = defaultdict(list)
    for inv, contact in inv_rows:
        name = contact.name if contact else "Unknown"
        grouped[name].append({
            "date": inv.issue_date, "ref": inv.invoice_number, "type": "Invoice",
            "doc_id": str(inv.id), "doc_route": "invoice",
            "debit": float(inv.total or 0), "credit": 0.0,
        })
    for cn, contact in cn_rows:
        name = contact.name if contact else "Unknown"
        grouped[name].append({
            "date": cn.issue_date, "ref": cn.credit_note_number, "type": "Credit Note",
            "doc_id": str(cn.id), "doc_route": "credit_note",
            "debit": 0.0, "credit": float(cn.total or 0),
        })
    for pay, contact in pay_rows:
        name = contact.name if contact else "Unknown"
        grouped[name].append({
            "date": pay.payment_date, "ref": pay.payment_number, "type": "Payment",
            "doc_id": str(pay.id), "doc_route": "sales_payment",
            "debit": 0.0, "credit": float(pay.amount or 0),
        })
    for ref, contact in ref_rows:
        name = contact.name if contact else "Unknown"
        grouped[name].append({
            "date": ref.refund_date, "ref": ref.refund_number, "type": "Refund",
            "doc_id": str(ref.id), "doc_route": "sales_refund",
            "debit": float(ref.amount or 0), "credit": 0.0,
        })

    grand_total_debit = 0.0
    grand_total_credit = 0.0
    customers = []
    for customer_name, entries in grouped.items():
        entries.sort(key=lambda e: (e["date"] or start))
        running = 0.0
        lines = []
        total_debit = 0.0
        total_credit = 0.0
        for e in entries:
            running += e["debit"] - e["credit"]
            total_debit += e["debit"]
            total_credit += e["credit"]
            lines.append({
                "date": e["date"].strftime("%Y-%m-%d") if e["date"] else None,
                "reference": e["ref"], "type": e["type"],
                "doc_id": e.get("doc_id"), "doc_route": e.get("doc_route"),
                "debit": round(e["debit"], 2), "credit": round(e["credit"], 2),
                "balance": round(running, 2),
            })
        grand_total_debit += total_debit
        grand_total_credit += total_credit
        customers.append({
            "customer_name": customer_name,
            "lines": lines,
            "total_debit": round(total_debit, 2),
            "total_credit": round(total_credit, 2),
            "balance": round(running, 2),
        })

    return {
        "start_date": start_date,
        "end_date": end_date,
        "customers": customers,
        "grand_total_debit": round(grand_total_debit, 2),
        "grand_total_credit": round(grand_total_credit, 2),
        "grand_total_balance": round(grand_total_debit - grand_total_credit, 2),
    }


@router.get("/creditor-ledger")
async def creditor_ledger_report(
    start_date: str = Query(..., description="YYYY-MM-DD"),
    end_date: str = Query(..., description="YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Creditor ledger — a running Debit/Credit/Balance ledger per vendor.
    Bills raise the balance owed (Debit); payments and purchase credit notes
    reduce it (Credit); refunds raise it back (Debit)."""
    org_id = current_user["org_id"]
    start = parse_date(start_date, "start_date")
    end = parse_date(end_date, "end_date", end_of_day=True)
    excluded = ("draft", "void", "cancelled")

    bill_rows = (await db.execute(
        select(Bill, Contact)
        .join(Contact, Bill.contact_id == Contact.id, isouter=True)
        .where(
            Bill.organization_id == org_id,
            Bill.issue_date >= start, Bill.issue_date <= end,
            Bill.status.notin_(excluded),
        )
    )).all()
    pcn_rows = (await db.execute(
        select(PurchaseCreditNote, Contact)
        .join(Contact, PurchaseCreditNote.contact_id == Contact.id, isouter=True)
        .where(
            PurchaseCreditNote.organization_id == org_id,
            PurchaseCreditNote.issue_date >= start, PurchaseCreditNote.issue_date <= end,
            PurchaseCreditNote.status.in_(("issued", "applied")),
        )
    )).all()
    pay_rows = (await db.execute(
        select(PurchasePayment, Contact)
        .join(Contact, PurchasePayment.contact_id == Contact.id, isouter=True)
        .where(
            PurchasePayment.organization_id == org_id,
            PurchasePayment.payment_date >= start, PurchasePayment.payment_date <= end,
            PurchasePayment.status == "completed",
        )
    )).all()
    ref_rows = (await db.execute(
        select(PurchaseRefund, Contact)
        .join(Contact, PurchaseRefund.contact_id == Contact.id, isouter=True)
        .where(
            PurchaseRefund.organization_id == org_id,
            PurchaseRefund.refund_date >= start, PurchaseRefund.refund_date <= end,
            PurchaseRefund.status == "completed",
        )
    )).all()

    grouped: dict = defaultdict(list)
    for bill, contact in bill_rows:
        name = contact.name if contact else "Unknown"
        grouped[name].append({
            "date": bill.issue_date, "ref": bill.bill_number, "type": "Bill",
            "doc_id": str(bill.id), "doc_route": "bill",
            "debit": 0.0, "credit": float(bill.total or 0),
        })
    for pcn, contact in pcn_rows:
        name = contact.name if contact else "Unknown"
        grouped[name].append({
            "date": pcn.issue_date, "ref": pcn.pcn_number, "type": "Credit Note",
            "doc_id": str(pcn.id), "doc_route": "purchase_credit_note",
            "debit": float(pcn.total or 0), "credit": 0.0,
        })
    for pay, contact in pay_rows:
        name = contact.name if contact else "Unknown"
        grouped[name].append({
            "date": pay.payment_date, "ref": pay.payment_no, "type": "Payment",
            "doc_id": str(pay.id), "doc_route": "purchase_payment",
            "debit": float(pay.amount or 0), "credit": 0.0,
        })
    for ref, contact in ref_rows:
        name = contact.name if contact else "Unknown"
        grouped[name].append({
            "date": ref.refund_date, "ref": ref.refund_no, "type": "Refund",
            "doc_id": str(ref.id), "doc_route": "purchase_refund",
            "debit": 0.0, "credit": float(ref.amount or 0),
        })

    grand_total_debit = 0.0
    grand_total_credit = 0.0
    vendors = []
    for vendor_name, entries in grouped.items():
        entries.sort(key=lambda e: (e["date"] or start))
        running = 0.0
        lines = []
        total_debit = 0.0
        total_credit = 0.0
        for e in entries:
            # AP is credit-natured: bills credit the ledger (+), payments debit it (-)
            running += e["credit"] - e["debit"]
            total_debit += e["debit"]
            total_credit += e["credit"]
            lines.append({
                "date": e["date"].strftime("%Y-%m-%d") if e["date"] else None,
                "reference": e["ref"], "type": e["type"],
                "doc_id": e.get("doc_id"), "doc_route": e.get("doc_route"),
                "debit": round(e["debit"], 2), "credit": round(e["credit"], 2),
                "balance": round(running, 2),
            })
        grand_total_debit += total_debit
        grand_total_credit += total_credit
        vendors.append({
            "vendor_name": vendor_name,
            "lines": lines,
            "total_debit": round(total_debit, 2),
            "total_credit": round(total_credit, 2),
            "balance": round(running, 2),
        })

    return {
        "start_date": start_date,
        "end_date": end_date,
        "vendors": vendors,
        "grand_total_debit": round(grand_total_debit, 2),
        "grand_total_credit": round(grand_total_credit, 2),
        "grand_total_balance": round(grand_total_credit - grand_total_debit, 2),
    }
