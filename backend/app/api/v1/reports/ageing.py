"""Ageing reports: AR aging and AP aging."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import Invoice, Bill, Contact

router = APIRouter()


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
            Bill.status.in_(["outstanding", "partially_paid"]),
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
