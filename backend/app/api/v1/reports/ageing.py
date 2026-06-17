"""Ageing reports: AR aging, AP aging, contact statement."""
from datetime import datetime, timezone
from uuid import UUID
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user
from ._util import parse_date
from app.models.models import (
    Invoice, Bill, Contact, CreditNote, SalesPayment, PaymentAllocation, SalesRefund,
)

router = APIRouter()


@router.get("/ar-aging")
async def ar_aging_report(
    as_of_date: str = Query(None, description="YYYY-MM-DD, defaults to today"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Accounts Receivable aging: Current, 1-30, 31-60, 61-90, 90+ days."""
    org_id = current_user["org_id"]
    as_of = parse_date(as_of_date, "as_of_date") if as_of_date else datetime.now(timezone.utc)

    result = await db.execute(
        select(Invoice, Contact)
        .join(Contact, Invoice.contact_id == Contact.id, isouter=True)
        .where(
            Invoice.organization_id == org_id,
            Invoice.status.in_(["outstanding", "partially_paid"]),
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
    contact_id: UUID = Query(None, description="Drill down into one supplier's individual bills"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Accounts Payable aging: Current, 1-30, 31-60, 61-90, 90+ days.

    When contact_id is supplied, returns the individual outstanding bills for that
    supplier (drill-down) alongside the bucketed totals.
    """
    org_id = current_user["org_id"]
    as_of = parse_date(as_of_date, "as_of_date") if as_of_date else datetime.now(timezone.utc)

    q = (
        select(Bill, Contact)
        .join(Contact, Bill.contact_id == Contact.id, isouter=True)
        .where(
            Bill.organization_id == org_id,
            Bill.status.in_(["outstanding", "partially_paid"]),
            (Bill.total - Bill.amount_paid) > 0,
        )
    )
    if contact_id:
        q = q.where(Bill.contact_id == contact_id)
    result = await db.execute(q)
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
        "contact_id": str(contact_id) if contact_id else None,
        "buckets": buckets,
        "summary": summary,
        "grand_total": sum(v["total"] for v in summary.values()),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/contact-statement")
async def contact_statement(
    contact_id: UUID = Query(..., description="Contact to produce a statement for"),
    start_date: str = Query(..., description="YYYY-MM-DD"),
    end_date: str = Query(..., description="YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Per-contact statement: invoices, payments, credit notes and refunds in a
    date range with a running balance (Xero-style statement to email customers)."""
    org_id = current_user["org_id"]
    start = parse_date(start_date, "start_date")
    end = parse_date(end_date, "end_date", end_of_day=True)

    contact = (await db.execute(
        select(Contact).where(Contact.id == contact_id, Contact.organization_id == org_id)
    )).scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    lines: list[dict] = []

    # Invoices (increase what the customer owes)
    invs = (await db.execute(
        select(Invoice).where(
            Invoice.organization_id == org_id,
            Invoice.contact_id == contact_id,
            Invoice.issue_date >= start, Invoice.issue_date <= end,
            Invoice.status != "void",
        )
    )).scalars().all()
    for inv in invs:
        lines.append({
            "ts": inv.issue_date.isoformat() if inv.issue_date else None,
            "type": "invoice", "ref": inv.invoice_number,
            "description": "Invoice", "amount": float(inv.total or 0),
        })

    # Payments allocated to this contact's invoices (reduce balance)
    pays = (await db.execute(
        select(SalesPayment, PaymentAllocation)
        .join(PaymentAllocation, PaymentAllocation.payment_id == SalesPayment.id)
        .join(Invoice, Invoice.id == PaymentAllocation.invoice_id)
        .where(
            SalesPayment.organization_id == org_id,
            Invoice.contact_id == contact_id,
            SalesPayment.payment_date >= start, SalesPayment.payment_date <= end,
        )
    )).all()
    for pay, alloc in pays:
        lines.append({
            "ts": pay.payment_date.isoformat() if pay.payment_date else None,
            "type": "payment", "ref": pay.payment_number,
            "description": "Payment received", "amount": -float(alloc.amount or 0),
        })

    # Credit notes for this contact (reduce balance)
    cns = (await db.execute(
        select(CreditNote).where(
            CreditNote.organization_id == org_id,
            CreditNote.contact_id == contact_id,
            CreditNote.issue_date >= start, CreditNote.issue_date <= end,
            CreditNote.status != "void",
        )
    )).scalars().all()
    for cn in cns:
        lines.append({
            "ts": cn.issue_date.isoformat() if cn.issue_date else None,
            "type": "credit_note", "ref": cn.credit_note_number,
            "description": "Credit note", "amount": -float(cn.total or 0),
        })

    # Refunds tied to this contact's credit notes (increase balance back)
    if cns:
        cn_ids = [c.id for c in cns]
        refs = (await db.execute(
            select(SalesRefund).where(SalesRefund.credit_note_id.in_(cn_ids))
        )).scalars().all()
        for r in refs:
            lines.append({
                "ts": r.refund_date.isoformat() if r.refund_date else None,
                "type": "refund", "ref": r.refund_number,
                "description": "Refund", "amount": float(r.amount or 0),
            })

    lines.sort(key=lambda x: x["ts"] or "")
    running = 0.0
    for ln in lines:
        running = round(running + ln["amount"], 2)
        ln["balance"] = running

    return {
        "report_type": "contact_statement",
        "contact_id": str(contact_id),
        "contact_name": contact.name,
        "start_date": start_date,
        "end_date": end_date,
        "currency": "MYR",
        "lines": lines,
        "closing_balance": running,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
