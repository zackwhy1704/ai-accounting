from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import (
    CreditNote, SalesRefund,
)
from .gl_helpers import post_gl
from app.schemas.schemas import (
    SalesRefundCreate, SalesRefundUpdate, SalesRefundResponse,
)
from app.core.sequences import next_sequence_number

router = APIRouter(tags=["Sales"])


# ═══════════════════════════════════════════════
# SALES REFUNDS
# ═══════════════════════════════════════════════
@router.get("/sales-refunds", response_model=list[SalesRefundResponse])
async def list_sales_refunds(status: str | None = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    org_id = current_user["org_id"]
    q = select(SalesRefund).where(SalesRefund.organization_id == org_id).order_by(SalesRefund.created_at.desc())
    if status:
        q = q.where(SalesRefund.status == status)
    return (await db.execute(q)).scalars().all()


@router.get("/sales-refunds/{sr_id}", response_model=SalesRefundResponse)
async def get_sales_refund(sr_id: UUID, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SalesRefund).where(SalesRefund.id == sr_id, SalesRefund.organization_id == current_user["org_id"])
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Sales refund not found")
    return obj


@router.post("/sales-refunds", response_model=SalesRefundResponse, status_code=201)
async def create_sales_refund(data: SalesRefundCreate, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    org_id = current_user["org_id"]
    if data.refund_number:
        existing = (await db.execute(select(SalesRefund.id).where(SalesRefund.organization_id == org_id, SalesRefund.refund_number == data.refund_number))).first()
        if existing:
            raise HTTPException(status_code=400, detail="Refund number already in use")
        ref_number = data.refund_number
    else:
        ref_number = await next_sequence_number(db, SalesRefund, SalesRefund.refund_number, org_id, "REF")

    # If linked to a credit note, ensure the refund doesn't exceed the
    # CN's remaining available balance and consume it on the CN row.
    cn = None
    if data.credit_note_id:
        cn_res = await db.execute(
            select(CreditNote).where(
                CreditNote.id == data.credit_note_id,
                CreditNote.organization_id == org_id,
            )
        )
        cn = cn_res.scalar_one_or_none()
        if not cn:
            raise HTTPException(status_code=404, detail="Linked credit note not found")
        if cn.status == "void":
            raise HTTPException(status_code=400, detail="Cannot refund a voided credit note")
        available = float(cn.total or 0) - float(cn.credit_applied or 0)
        if float(data.amount) > available + 1e-6:
            raise HTTPException(
                status_code=400,
                detail=f"Refund amount {data.amount} exceeds credit note available balance {available:.2f}",
            )

    obj = SalesRefund(
        organization_id=org_id, contact_id=data.contact_id, credit_note_id=data.credit_note_id,
        refund_number=ref_number, refund_date=data.refund_date,
        refund_method=data.refund_method, reference=data.reference,
        amount=data.amount, bank_account_id=data.bank_account_id,
        currency=data.currency, notes=data.notes, status="completed",
    )
    db.add(obj)
    await db.flush()

    if cn is not None:
        cn.credit_applied = float(cn.credit_applied or 0) + float(data.amount)
        if float(cn.credit_applied or 0) >= float(cn.total or 0) - 1e-6:
            cn.status = "applied"

    # GL: Dr AR (1100) / Cr Cash/Bank (1000)
    await post_gl(
        db, org_id, data.refund_date,
        f"Refund {obj.refund_number}",
        obj.refund_number, "refund", obj.id,
        [("1100", float(data.amount), 0), ("1000", 0, float(data.amount))],
    )

    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/sales-refunds/{sr_id}", response_model=SalesRefundResponse)
async def update_sales_refund(sr_id: UUID, data: SalesRefundUpdate, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SalesRefund)
        .where(SalesRefund.id == sr_id, SalesRefund.organization_id == current_user["org_id"])
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Sales refund not found")
    if obj.status in ("void",):
        raise HTTPException(status_code=400, detail="Voided refunds cannot be edited")

    update_data = data.model_dump(exclude_unset=True)

    new_num = update_data.get("refund_number")
    if new_num and new_num != obj.refund_number:
        existing = (await db.execute(select(SalesRefund.id).where(SalesRefund.organization_id == obj.organization_id, SalesRefund.refund_number == new_num, SalesRefund.id != obj.id))).first()
        if existing:
            raise HTTPException(status_code=400, detail="Refund number already in use")

    for key, value in update_data.items():
        setattr(obj, key, value)

    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/sales-refunds/{sr_id}/status")
async def update_sales_refund_status(sr_id: UUID, status: str, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SalesRefund).where(SalesRefund.id == sr_id, SalesRefund.organization_id == current_user["org_id"]))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Sales refund not found")
    valid = {"draft", "completed", "void"}
    if status not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid)}")

    voiding = status == "void" and obj.status != "void"
    if voiding and obj.credit_note_id:
        cn_res = await db.execute(
            select(CreditNote).where(CreditNote.id == obj.credit_note_id)
        )
        cn = cn_res.scalar_one_or_none()
        if cn:
            cn.credit_applied = max(0.0, float(cn.credit_applied or 0) - float(obj.amount or 0))
            if cn.status == "applied" and float(cn.credit_applied or 0) < float(cn.total or 0):
                cn.status = "issued"

    obj.status = status
    await db.commit()
    return {"id": str(sr_id), "status": status}


@router.delete("/sales-refunds/{sr_id}", status_code=204)
async def delete_sales_refund(sr_id: UUID, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SalesRefund).where(SalesRefund.id == sr_id, SalesRefund.organization_id == current_user["org_id"]))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Sales refund not found")
    # Refund a still-active refund consumed CN balance — return it.
    # Already-void refunds had their reversal done at void time.
    if obj.status != "void" and obj.credit_note_id:
        cn_res = await db.execute(
            select(CreditNote).where(CreditNote.id == obj.credit_note_id)
        )
        cn = cn_res.scalar_one_or_none()
        if cn:
            cn.credit_applied = max(0.0, float(cn.credit_applied or 0) - float(obj.amount or 0))
            if cn.status == "applied" and float(cn.credit_applied or 0) < float(cn.total or 0):
                cn.status = "issued"
    await db.delete(obj)
    await db.commit()


def _build_events(events: list[dict]) -> dict:
    events.sort(key=lambda e: (e.get("ts") or ""))
    running = 0.0
    for ev in events:
        running += ev.get("delta", 0.0)
        ev["balance"] = round(running, 2)
    return {"total": round(running, 2), "events": events}


@router.get("/sales-refunds/{sr_id}/activity")
async def sales_refund_activity(sr_id: UUID, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.models.models import SalesRefund
    org_id = current_user["org_id"]
    result = await db.execute(select(SalesRefund).where(SalesRefund.id == sr_id, SalesRefund.organization_id == org_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Sales refund not found")
    events: list[dict] = [{
        "ts": obj.refund_date.isoformat() if obj.refund_date else None,
        "type": "issued", "ref": getattr(obj, "refund_number", str(obj.id)), "ref_id": str(obj.id),
        "delta": float(obj.amount or 0), "note": obj.notes or "", "status": obj.status,
    }]
    return _build_events(events)
