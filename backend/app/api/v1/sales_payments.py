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
    DebitNote, SalesPayment, PaymentAllocation, Invoice, Contact,
)
from .gl_helpers import post_gl, post_gl_by_id, revert_gl
from app.core.org_defaults import get_default_accounts
from app.services.gl_posting import post_sales_payment_gl
from app.core.audit import log_audit
from app.schemas.schemas import (
    SalesPaymentCreate, SalesPaymentUpdate, SalesPaymentResponse,
)
from app.core.sequences import next_sequence_number

router = APIRouter(tags=["Sales"])


# ═══════════════════════════════════════════════
# SALES PAYMENTS
# ═══════════════════════════════════════════════
@router.get("/sales-payments")
async def list_sales_payments(
    status: str | None = None,
    contact_id: UUID | None = None,
    p: PaginationParams = Depends(),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = current_user["org_id"]
    base = select(SalesPayment).where(SalesPayment.organization_id == org_id)
    if status:
        base = base.where(SalesPayment.status == status)
    if contact_id:
        base = base.where(SalesPayment.contact_id == contact_id)
    if p.search:
        like = f"%{p.search}%"
        contact_match = select(Contact.id).where(
            Contact.organization_id == org_id, Contact.name.ilike(like)
        )
        base = base.where(or_(
            SalesPayment.payment_number.ilike(like),
            SalesPayment.contact_id.in_(contact_match),
        ))
    if p.date_from:
        base = base.where(SalesPayment.payment_date >= p.date_from)
    if p.date_to:
        base = base.where(SalesPayment.payment_date <= p.date_to)

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    query = apply_sort(base, SalesPayment, p).offset(p.offset).limit(p.limit)
    items = (await db.execute(query)).scalars().all()
    items = [SalesPaymentResponse.model_validate(i) for i in items]
    return paginated_result(items, total, p)


@router.get("/sales-payments/{sp_id}", response_model=SalesPaymentResponse)
async def get_sales_payment(sp_id: UUID, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SalesPayment).where(SalesPayment.id == sp_id, SalesPayment.organization_id == current_user["org_id"])
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Sales payment not found")
    return obj


@router.post("/sales-payments", response_model=SalesPaymentResponse, status_code=201)
async def create_sales_payment(data: SalesPaymentCreate, current_user: dict = Depends(require_write()), db: AsyncSession = Depends(get_db)):
    org_id = current_user["org_id"]
    if data.payment_number:
        existing = (await db.execute(select(SalesPayment.id).where(SalesPayment.organization_id == org_id, SalesPayment.payment_number == data.payment_number))).first()
        if existing:
            raise HTTPException(status_code=400, detail="Payment number already in use")
        pmt_number = data.payment_number
    else:
        pmt_number = await next_sequence_number(db, SalesPayment, SalesPayment.payment_number, org_id, "PMT")

    # Derive amount from allocations so payment total always equals sum of allocated amounts
    effective_amount = round(sum(float(a.amount) for a in data.allocations), 2) if data.allocations else float(data.amount)

    obj = SalesPayment(
        organization_id=org_id, contact_id=data.contact_id,
        payment_number=pmt_number, payment_date=data.payment_date,
        payment_method=data.payment_method, reference=data.reference,
        amount=effective_amount, bank_account_id=data.bank_account_id,
        currency=data.currency, notes=data.notes, status="completed",
    )
    db.add(obj)
    await db.flush()

    # Allocate to invoices/debit notes and update balances
    for alloc in data.allocations:
        db.add(PaymentAllocation(
            payment_id=obj.id,
            invoice_id=alloc.invoice_id,
            debit_note_id=alloc.debit_note_id,
            amount=alloc.amount,
        ))
        if alloc.invoice_id:
            inv_result = await db.execute(select(Invoice).where(Invoice.id == alloc.invoice_id))
            inv = inv_result.scalar_one_or_none()
            if inv:
                inv.amount_paid = float(inv.amount_paid or 0) + float(alloc.amount)
                inv.mark_paid()
        if alloc.debit_note_id:
            dn_result = await db.execute(select(DebitNote).where(DebitNote.id == alloc.debit_note_id))
            dn = dn_result.scalar_one_or_none()
            if dn:
                dn.amount_paid = float(dn.amount_paid or 0) + float(alloc.amount)
                dn_total = float(dn.total or 0)
                dn.status = "applied" if float(dn.amount_paid) >= dn_total else "issued"

    # GL: Dr Cash/Bank / Cr AR via shared service
    await post_sales_payment_gl(
        db, org_id,
        payment_date=data.payment_date,
        number=obj.payment_number,
        payment_id=obj.id,
        amount=effective_amount,
    )

    await db.commit()
    await log_audit(db, org_id, current_user["sub"], "create", "sales_payment", obj.id)
    await db.refresh(obj)
    return obj


@router.patch("/sales-payments/{sp_id}", response_model=SalesPaymentResponse)
async def update_sales_payment(sp_id: UUID, data: SalesPaymentUpdate, current_user: dict = Depends(require_write()), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SalesPayment)
        .options(selectinload(SalesPayment.allocations))
        .where(SalesPayment.id == sp_id, SalesPayment.organization_id == current_user["org_id"])
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Sales payment not found")
    if obj.status in ("void",):
        raise HTTPException(status_code=400, detail="Voided payments cannot be edited")

    update_data = data.model_dump(exclude_unset=True)

    if "allocations" in update_data:
        allocs_data = update_data.pop("allocations")
        # Revert old allocations on invoices/debit notes
        for existing_alloc in obj.allocations:
            if existing_alloc.invoice_id:
                inv_result = await db.execute(select(Invoice).where(Invoice.id == existing_alloc.invoice_id))
                inv = inv_result.scalar_one_or_none()
                if inv:
                    inv.amount_paid = max(0.0, float(inv.amount_paid or 0) - float(existing_alloc.amount))
                    inv.mark_paid()
            if existing_alloc.debit_note_id:
                dn_result = await db.execute(select(DebitNote).where(DebitNote.id == existing_alloc.debit_note_id))
                dn = dn_result.scalar_one_or_none()
                if dn:
                    dn.amount_paid = max(0.0, float(dn.amount_paid or 0) - float(existing_alloc.amount))
                    dn_total = float(dn.total or 0)
                    dn.status = "applied" if float(dn.amount_paid) >= dn_total else "issued"
        await db.execute(delete(PaymentAllocation).where(PaymentAllocation.payment_id == obj.id))
        for alloc in allocs_data:
            db.add(PaymentAllocation(
                payment_id=obj.id,
                invoice_id=alloc.get("invoice_id"),
                debit_note_id=alloc.get("debit_note_id"),
                amount=alloc["amount"],
            ))
            if alloc.get("invoice_id"):
                inv_result = await db.execute(select(Invoice).where(Invoice.id == alloc["invoice_id"]))
                inv = inv_result.scalar_one_or_none()
                if inv:
                    inv.amount_paid = float(inv.amount_paid or 0) + float(alloc["amount"])
                    inv.mark_paid()
            if alloc.get("debit_note_id"):
                dn_result = await db.execute(select(DebitNote).where(DebitNote.id == alloc["debit_note_id"]))
                dn = dn_result.scalar_one_or_none()
                if dn:
                    dn.amount_paid = float(dn.amount_paid or 0) + float(alloc["amount"])
                    dn_total = float(dn.total or 0)
                    dn.status = "applied" if float(dn.amount_paid) >= dn_total else "issued"

    new_num = update_data.get("payment_number")
    if new_num and new_num != obj.payment_number:
        existing = (await db.execute(select(SalesPayment.id).where(SalesPayment.organization_id == obj.organization_id, SalesPayment.payment_number == new_num, SalesPayment.id != obj.id))).first()
        if existing:
            raise HTTPException(status_code=400, detail="Payment number already in use")

    for key, value in update_data.items():
        setattr(obj, key, value)

    await db.commit()
    result2 = await db.execute(
        select(SalesPayment).options(selectinload(SalesPayment.allocations)).where(SalesPayment.id == obj.id)
    )
    return result2.scalar_one()


@router.patch("/sales-payments/{sp_id}/status")
async def update_sales_payment_status(sp_id: UUID, status: str, current_user: dict = Depends(require_write()), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SalesPayment)
        .options(selectinload(SalesPayment.allocations))
        .where(SalesPayment.id == sp_id, SalesPayment.organization_id == current_user["org_id"])
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Sales payment not found")
    valid = {"draft", "completed", "void"}
    if status not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid)}")

    voiding = status == "void" and obj.status != "void"
    if voiding:
        for alloc in obj.allocations:
            if alloc.invoice_id:
                inv_result = await db.execute(select(Invoice).where(Invoice.id == alloc.invoice_id))
                inv = inv_result.scalar_one_or_none()
                if inv:
                    inv.amount_paid = max(0.0, float(inv.amount_paid or 0) - float(alloc.amount))
                    inv.mark_paid()
            if alloc.debit_note_id:
                dn_result = await db.execute(select(DebitNote).where(DebitNote.id == alloc.debit_note_id))
                dn = dn_result.scalar_one_or_none()
                if dn:
                    dn.amount_paid = max(0.0, float(dn.amount_paid or 0) - float(alloc.amount))
                    dn_total = float(dn.total or 0)
                    dn.status = "applied" if float(dn.amount_paid) >= dn_total else "issued"
        await revert_gl(
            db, current_user["org_id"], obj.id, "payment",
            obj.payment_date,
            f"Reversal: Payment {obj.payment_number} voided",
            obj.payment_number,
        )

    obj.status = status
    await db.commit()
    return {"id": str(sp_id), "status": status}


@router.delete("/sales-payments/{sp_id}", status_code=204)
async def delete_sales_payment(sp_id: UUID, current_user: dict = Depends(require_write()), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SalesPayment)
        .options(selectinload(SalesPayment.allocations))
        .where(SalesPayment.id == sp_id, SalesPayment.organization_id == current_user["org_id"])
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Sales payment not found")
    # Revert invoice balances and GL unless already voided (void already handled reversal)
    if obj.status != "void":
        for alloc in obj.allocations:
            inv_result = await db.execute(select(Invoice).where(Invoice.id == alloc.invoice_id))
            inv = inv_result.scalar_one_or_none()
            if inv:
                inv.amount_paid = max(0.0, float(inv.amount_paid or 0) - float(alloc.amount))
                inv_total = float(inv.total or 0)
                if float(inv.amount_paid) >= inv_total:
                    inv.status = "paid"
                elif float(inv.amount_paid) > 0:
                    inv.status = "partially paid"
                else:
                    inv.status = "outstanding"
        await revert_gl(
            db, current_user["org_id"], obj.id, "payment",
            obj.payment_date,
            f"Reversal: Payment {obj.payment_number} deleted",
            obj.payment_number,
        )
    await db.delete(obj)
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "delete", "sales_payment", sp_id)


def _build_events(events: list[dict]) -> dict:
    events.sort(key=lambda e: (e.get("ts") or ""))
    running = 0.0
    for ev in events:
        running += ev.get("delta", 0.0)
        ev["balance"] = round(running, 2)
    return {"total": round(running, 2), "events": events}


@router.get("/sales-payments/{sp_id}/activity")
async def sales_payment_activity(sp_id: UUID, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    org_id = current_user["org_id"]
    result = await db.execute(select(SalesPayment).where(SalesPayment.id == sp_id, SalesPayment.organization_id == org_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Sales payment not found")
    events: list[dict] = [{
        "ts": obj.payment_date.isoformat() if obj.payment_date else None,
        "type": "issued", "ref": obj.payment_number, "ref_id": str(obj.id),
        "delta": float(obj.amount or 0), "note": obj.notes or "", "status": obj.status,
    }]
    alloc_result = await db.execute(
        select(PaymentAllocation, Invoice)
        .join(Invoice, Invoice.id == PaymentAllocation.invoice_id)
        .where(PaymentAllocation.payment_id == sp_id)
    )
    for alloc, inv in alloc_result.all():
        events.append({
            "ts": obj.payment_date.isoformat() if obj.payment_date else None,
            "type": "payment", "ref": inv.invoice_number, "ref_id": str(inv.id),
            "delta": -float(alloc.amount or 0), "note": f"Allocated to {inv.invoice_number}", "status": inv.status,
        })
    return _build_events(events)
