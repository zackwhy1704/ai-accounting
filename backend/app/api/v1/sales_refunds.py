from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from uuid import UUID
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import require_write
from app.core.pagination import PaginationParams, paginated_result, apply_sort
from app.models.models import (
    CreditNote, SalesRefund, Contact,
)
from .gl_helpers import post_gl, revert_gl
from app.services.gl_posting import post_sales_refund_gl
from app.services.fx import document_rate
from app.schemas.schemas import (
    SalesRefundCreate, SalesRefundUpdate, SalesRefundResponse,
)
from app.core.sequences import next_sequence_number
from app.core.audit import log_audit

router = APIRouter(tags=["Sales"])


# ═══════════════════════════════════════════════
# SALES REFUNDS
# ═══════════════════════════════════════════════
@router.get("/sales-refunds")
async def list_sales_refunds(
    status: str | None = None,
    contact_id: UUID | None = None,
    p: PaginationParams = Depends(),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = current_user["org_id"]
    base = select(SalesRefund).where(SalesRefund.organization_id == org_id)
    if status:
        base = base.where(SalesRefund.status == status)
    if contact_id:
        base = base.where(SalesRefund.contact_id == contact_id)
    if p.search:
        like = f"%{p.search}%"
        contact_match = select(Contact.id).where(
            Contact.organization_id == org_id, Contact.name.ilike(like)
        )
        base = base.where(or_(
            SalesRefund.refund_number.ilike(like),
            SalesRefund.contact_id.in_(contact_match),
        ))
    if p.date_from:
        base = base.where(SalesRefund.refund_date >= p.date_from)
    if p.date_to:
        base = base.where(SalesRefund.refund_date <= p.date_to)

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    query = apply_sort(base, SalesRefund, p).offset(p.offset).limit(p.limit)
    items = (await db.execute(query)).scalars().all()
    items = [SalesRefundResponse.model_validate(i) for i in items]
    return paginated_result(items, total, p)


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
async def create_sales_refund(data: SalesRefundCreate, current_user: dict = Depends(require_write()), db: AsyncSession = Depends(get_db)):
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

    # GL via shared service (org defaults -> hardcoded fallback)
    obj.exchange_rate = await document_rate(db, org_id, obj.currency, data.refund_date)
    await post_sales_refund_gl(
        db, org_id,
        refund_date=data.refund_date,
        number=obj.refund_number,
        refund_id=obj.id,
        amount=float(data.amount),
        rate=float(obj.exchange_rate),
    )

    await db.commit()
    await log_audit(db, org_id, current_user["sub"], "create", "sales_refund", obj.id)
    await db.refresh(obj)
    return obj


@router.patch("/sales-refunds/{sr_id}", response_model=SalesRefundResponse)
async def update_sales_refund(sr_id: UUID, data: SalesRefundUpdate, current_user: dict = Depends(require_write()), db: AsyncSession = Depends(get_db)):
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
    await log_audit(db, current_user["org_id"], current_user["sub"], "update", "sales_refund", sr_id)
    await db.refresh(obj)
    return obj


@router.patch("/sales-refunds/{sr_id}/status")
async def update_sales_refund_status(sr_id: UUID, status: str, current_user: dict = Depends(require_write()), db: AsyncSession = Depends(get_db)):
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
    if voiding:
        await revert_gl(
            db, current_user["org_id"], sr_id, "refund",
            obj.refund_date,
            f"Reversal: Refund {obj.refund_number} voided",
            obj.refund_number,
        )

    obj.status = status
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "status_change", "sales_refund", sr_id)
    return {"id": str(sr_id), "status": status}


@router.delete("/sales-refunds/{sr_id}", status_code=204)
async def delete_sales_refund(sr_id: UUID, current_user: dict = Depends(require_write()), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SalesRefund).where(SalesRefund.id == sr_id, SalesRefund.organization_id == current_user["org_id"]))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Sales refund not found")
    # Every refund posts GL on create (there's no draft path today) — deleting an
    # active refund directly would orphan that GL and its CN application, so
    # require voiding first (which reverses both). Mirrors purchase_refunds.py.
    if obj.status not in ("draft", "void"):
        raise HTTPException(status_code=400, detail="Only draft or void refunds can be deleted. Void the refund first.")
    if obj.status == "draft" and obj.credit_note_id:
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
    await log_audit(db, current_user["org_id"], current_user["sub"], "delete", "sales_refund", sr_id)


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
