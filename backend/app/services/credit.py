"""
Customer credit control: credit_hold blocks new sales documents outright;
credit_limit blocks a new document when (outstanding AR + new total) exceeds it.
Contacts without a limit are never blocked.
"""
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Contact, Invoice

_OPEN_STATUSES = ("outstanding", "partially_paid", "overdue", "sent", "viewed")


async def outstanding_ar(db: AsyncSession, org_id, contact_id) -> float:
    """Unpaid balance across the contact's open invoices."""
    total = (await db.execute(
        select(func.coalesce(func.sum(Invoice.total - Invoice.amount_paid), 0)).where(
            Invoice.organization_id == org_id,
            Invoice.contact_id == contact_id,
            Invoice.status.in_(_OPEN_STATUSES),
        )
    )).scalar() or 0
    return round(float(total), 2)


async def assert_within_credit(db: AsyncSession, org_id, contact_id, new_amount: float) -> None:
    """Raise 400 when the contact is on credit hold or the new document would
    push their outstanding balance past the credit limit."""
    if not contact_id:
        return
    contact = (await db.execute(
        select(Contact).where(Contact.id == contact_id, Contact.organization_id == org_id)
    )).scalar_one_or_none()
    if contact is None:
        return  # caller's own 404 handles unknown contacts
    if contact.credit_hold:
        raise HTTPException(
            status_code=400,
            detail=f"{contact.name} is on credit hold — new sales documents are blocked.",
        )
    if contact.credit_limit is None:
        return
    limit = float(contact.credit_limit)
    balance = await outstanding_ar(db, org_id, contact_id)
    if balance + float(new_amount or 0) > limit + 0.005:
        raise HTTPException(
            status_code=400,
            detail=(f"Credit limit exceeded for {contact.name}: outstanding {balance:.2f} "
                    f"+ this document {float(new_amount):.2f} is over the limit of {limit:.2f}."),
        )
