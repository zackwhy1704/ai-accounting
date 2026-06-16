from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func, or_
from sqlalchemy.orm import selectinload
from uuid import UUID
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import require_write
from app.core.pagination import PaginationParams, paginated_result, apply_sort
from app.models.models import (
    DebitNote, DebitNoteLineItem,
    SalesPayment, PaymentAllocation, Invoice, Contact,
)
from .gl_helpers import post_gl, revert_gl
from app.services.gl_posting import post_debit_note_gl
from app.schemas.schemas import (
    DebitNoteCreate, DebitNoteUpdate, DebitNoteResponse,
    SalesPaymentCreate,
)
from app.core.sequences import next_sequence_number
from app.core.line_items import calculate_line_items
from app.core.audit import log_audit

router = APIRouter(tags=["Sales"])


# ═══════════════════════════════════════════════
# DEBIT NOTES
# ═══════════════════════════════════════════════
@router.get("/debit-notes")
async def list_debit_notes(
    status: str | None = None,
    contact_id: UUID | None = None,
    p: PaginationParams = Depends(),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = current_user["org_id"]
    base = select(DebitNote).where(DebitNote.organization_id == org_id)
    if status:
        base = base.where(DebitNote.status == status)
    if contact_id:
        base = base.where(DebitNote.contact_id == contact_id)
    if p.search:
        like = f"%{p.search}%"
        contact_match = select(Contact.id).where(
            Contact.organization_id == org_id, Contact.name.ilike(like)
        )
        base = base.where(or_(
            DebitNote.debit_note_number.ilike(like),
            DebitNote.contact_id.in_(contact_match),
        ))
    if p.date_from:
        base = base.where(DebitNote.issue_date >= p.date_from)
    if p.date_to:
        base = base.where(DebitNote.issue_date <= p.date_to)

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    query = apply_sort(base, DebitNote, p).options(selectinload(DebitNote.line_items)).offset(p.offset).limit(p.limit)
    items = (await db.execute(query)).scalars().all()
    items = [DebitNoteResponse.model_validate(i) for i in items]
    return paginated_result(items, total, p)


@router.get("/debit-notes/{dn_id}", response_model=DebitNoteResponse)
async def get_debit_note(dn_id: UUID, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DebitNote).options(selectinload(DebitNote.line_items)).where(DebitNote.id == dn_id, DebitNote.organization_id == current_user["org_id"])
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Debit note not found")
    return obj


@router.post("/debit-notes", response_model=DebitNoteResponse, status_code=201)
async def create_debit_note(data: DebitNoteCreate, current_user: dict = Depends(require_write()), db: AsyncSession = Depends(get_db)):
    org_id = current_user["org_id"]
    if data.debit_note_number:
        existing = (await db.execute(select(DebitNote.id).where(DebitNote.organization_id == org_id, DebitNote.debit_note_number == data.debit_note_number))).first()
        if existing:
            raise HTTPException(status_code=400, detail="Debit note number already in use")
        dn_number = data.debit_note_number
    else:
        dn_number = await next_sequence_number(db, DebitNote, DebitNote.debit_note_number, org_id, "DN")
    _line_dicts = [{"quantity": getattr(i, "quantity", 1), "unit_price": getattr(i, "unit_price", 0), "discount": getattr(i, "discount", 0) or 0, "discount_mode": getattr(i, "discount_mode", "percent") or "percent", "tax_rate": getattr(i, "tax_rate", 0) or 0} for i in data.line_items]
    subtotal, tax_amount, discount_total, _ = calculate_line_items(_line_dicts)

    obj = DebitNote(
        organization_id=org_id, contact_id=data.contact_id, invoice_id=data.invoice_id,
        debit_note_number=dn_number, issue_date=data.issue_date,
        reference=data.reference, subtotal=subtotal, discount_amount=discount_total,
        tax_amount=tax_amount, total=subtotal + tax_amount,
        currency=data.currency, notes=data.notes,
        billing_address_line1=data.billing_address_line1,
        billing_address_line2=data.billing_address_line2,
        billing_city=data.billing_city,
        billing_state=data.billing_state,
        billing_postcode=data.billing_postcode,
        billing_country=data.billing_country,
        shipping_address_line1=data.shipping_address_line1,
        shipping_address_line2=data.shipping_address_line2,
        shipping_city=data.shipping_city,
        shipping_state=data.shipping_state,
        shipping_postcode=data.shipping_postcode,
        shipping_country=data.shipping_country,
    )
    db.add(obj)
    await db.flush()

    for i, item in enumerate(data.line_items):
        disc_mode = getattr(item, 'discount_mode', 'percent') or 'percent'
        line_total = item.quantity * item.unit_price
        disc_val = min(item.discount, line_total) if disc_mode == 'amount' else line_total * item.discount / 100
        db.add(DebitNoteLineItem(
            debit_note_id=obj.id, description=item.description, quantity=item.quantity,
            unit_price=item.unit_price, tax_rate=item.tax_rate, tax_code_id=item.tax_code_id,
            discount=item.discount, discount_mode=disc_mode,
            amount=line_total - disc_val, account_id=item.account_id, sort_order=i,
        ))

    # GL via shared service (org defaults -> hardcoded fallback, one balanced txn)
    await post_debit_note_gl(
        db, org_id,
        issue_date=data.issue_date,
        number=obj.debit_note_number,
        dn_id=obj.id,
        subtotal=float(subtotal),
        tax_amount=float(tax_amount),
        total=float(subtotal + tax_amount),
    )

    await db.commit()
    result2 = await db.execute(
        select(DebitNote).options(selectinload(DebitNote.line_items)).where(DebitNote.id == obj.id)
    )
    return result2.scalar_one()


@router.patch("/debit-notes/{dn_id}", response_model=DebitNoteResponse)
async def update_debit_note(dn_id: UUID, data: DebitNoteUpdate, current_user: dict = Depends(require_write()), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DebitNote)
        .options(selectinload(DebitNote.line_items))
        .where(DebitNote.id == dn_id, DebitNote.organization_id == current_user["org_id"])
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Debit note not found")
    if obj.status == "void":
        raise HTTPException(status_code=400, detail="Voided debit notes cannot be edited")

    update_data = data.model_dump(exclude_unset=True)

    if "line_items" in update_data:
        line_items_data = update_data.pop("line_items")
        await db.execute(delete(DebitNoteLineItem).where(DebitNoteLineItem.debit_note_id == obj.id))
        subtotal, tax_amount, discount_total, total = calculate_line_items(line_items_data)
        for i, item in enumerate(line_items_data):
            db.add(DebitNoteLineItem(
                debit_note_id=obj.id,
                description=item.get("description", ""),
                quantity=item.get("quantity", 1),
                unit_price=item.get("unit_price", 0),
                tax_rate=item.get("tax_rate", 0),
                tax_code_id=item.get("tax_code_id"),
                discount=item.get("discount", 0),
                discount_mode=item.get("discount_mode", "percent"),
                amount=item.get("amount", 0),
                account_id=item.get("account_id"),
                sort_order=i,
            ))
        obj.subtotal = subtotal
        obj.discount_amount = discount_total
        obj.tax_amount = tax_amount
        obj.total = total

    new_num = update_data.get("debit_note_number")
    if new_num and new_num != obj.debit_note_number:
        existing = (await db.execute(select(DebitNote.id).where(DebitNote.organization_id == obj.organization_id, DebitNote.debit_note_number == new_num, DebitNote.id != obj.id))).first()
        if existing:
            raise HTTPException(status_code=400, detail="Debit note number already in use")

    for key, value in update_data.items():
        setattr(obj, key, value)

    await db.commit()
    result2 = await db.execute(
        select(DebitNote).options(selectinload(DebitNote.line_items)).where(DebitNote.id == obj.id)
    )
    return result2.scalar_one()


@router.patch("/debit-notes/{dn_id}/status")
async def update_debit_note_status(dn_id: UUID, status: str, current_user: dict = Depends(require_write()), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DebitNote).where(DebitNote.id == dn_id, DebitNote.organization_id == current_user["org_id"]))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Debit note not found")
    valid = {"draft", "issued", "applied", "void"}
    if status not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid)}")
    if status == "void" and obj.status == "applied":
        raise HTTPException(status_code=400, detail="This debit note has a payment applied. Void the payment first before voiding the debit note.")
    obj.status = status
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "status_change", "debit_note", dn_id)
    return {"id": str(dn_id), "status": status}


@router.delete("/debit-notes/{dn_id}", status_code=204)
async def delete_debit_note(dn_id: UUID, current_user: dict = Depends(require_write()), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DebitNote).where(DebitNote.id == dn_id, DebitNote.organization_id == current_user["org_id"]))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Debit note not found")
    if obj.status == "applied":
        raise HTTPException(status_code=400, detail="This debit note has a payment applied. Void the payment first, then void the debit note before deleting.")
    if obj.status not in ("draft", "void", "issued"):
        raise HTTPException(status_code=400, detail="Only draft, issued, or void debit notes can be deleted.")
    await db.delete(obj)
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "delete", "debit_note", dn_id)


@router.post("/debit-notes/{dn_id}/pay", status_code=201)
async def pay_debit_note(
    dn_id: UUID,
    data: SalesPaymentCreate,
    current_user: dict = Depends(require_write()),
    db: AsyncSession = Depends(get_db),
):
    """Create a sales payment for a debit note and mark it as applied."""
    org_id = current_user["org_id"]
    result = await db.execute(
        select(DebitNote).where(DebitNote.id == dn_id, DebitNote.organization_id == org_id)
    )
    dn = result.scalar_one_or_none()
    if not dn:
        raise HTTPException(status_code=404, detail="Debit note not found")
    if dn.status == "void":
        raise HTTPException(status_code=400, detail="Cannot pay a voided debit note")

    payment_number = await next_sequence_number(db, SalesPayment, SalesPayment.payment_number, org_id, "PAY")

    payment = SalesPayment(
        organization_id=org_id,
        contact_id=data.contact_id,
        payment_number=payment_number,
        payment_date=data.payment_date,
        payment_method=data.payment_method,
        reference=data.reference,
        amount=data.amount,
        bank_account_id=data.bank_account_id,
        currency=data.currency,
        notes=data.notes,
        status="completed",
    )
    db.add(payment)
    await db.flush()

    # Allocate payment to the debit note itself
    db.add(PaymentAllocation(
        payment_id=payment.id,
        debit_note_id=dn_id,
        amount=data.amount,
    ))
    dn.amount_paid = float(dn.amount_paid or 0) + float(data.amount)
    dn_total = float(dn.total or 0)
    if float(dn.amount_paid) >= dn_total:
        dn.status = "applied"
    elif float(dn.amount_paid) > 0:
        dn.status = "partially paid"
    else:
        dn.status = "issued"

    # Also allocate to any explicitly listed invoices
    for alloc in data.allocations:
        if alloc.invoice_id:
            db.add(PaymentAllocation(
                payment_id=payment.id,
                invoice_id=alloc.invoice_id,
                amount=alloc.amount,
            ))
            inv_result = await db.execute(select(Invoice).where(Invoice.id == alloc.invoice_id))
            inv = inv_result.scalar_one_or_none()
            if inv:
                inv.amount_paid = float(inv.amount_paid or 0) + float(alloc.amount)
                inv_total = float(inv.total or 0)
                if float(inv.amount_paid) >= inv_total:
                    inv.status = "paid"
                elif float(inv.amount_paid) > 0:
                    inv.status = "partially paid"
                else:
                    inv.status = "outstanding"

    await db.commit()
    return {"id": str(payment.id), "payment_number": payment_number, "status": "completed"}


def _build_events(events: list[dict]) -> dict:
    events.sort(key=lambda e: (e.get("ts") or ""))
    running = 0.0
    for ev in events:
        running += ev.get("delta", 0.0)
        ev["balance"] = round(running, 2)
    return {"total": round(running, 2), "events": events}


@router.get("/debit-notes/{dn_id}/activity")
async def debit_note_activity(dn_id: UUID, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    org_id = current_user["org_id"]
    result = await db.execute(select(DebitNote).where(DebitNote.id == dn_id, DebitNote.organization_id == org_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Debit note not found")
    events: list[dict] = [{
        "ts": obj.issue_date.isoformat() if obj.issue_date else None,
        "type": "issued", "ref": obj.debit_note_number, "ref_id": str(obj.id),
        "delta": float(obj.total or 0), "note": obj.notes or "", "status": obj.status,
    }]
    pay_result = await db.execute(
        select(SalesPayment, PaymentAllocation)
        .join(PaymentAllocation, PaymentAllocation.payment_id == SalesPayment.id)
        .where(PaymentAllocation.debit_note_id == dn_id)
    )
    for pmt, alloc in pay_result.all():
        events.append({
            "ts": pmt.payment_date.isoformat() if pmt.payment_date else None,
            "type": "payment", "ref": pmt.payment_number, "ref_id": str(pmt.id),
            "delta": -float(alloc.amount or 0), "note": pmt.notes or "", "status": pmt.status,
        })
    return _build_events(events)
