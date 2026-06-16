import random
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from uuid import UUID
from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import require_write
from app.core.pagination import PaginationParams, paginated_result, apply_sort
from app.core.audit import log_audit
from app.models.models import PurchaseRefund, Bill, PurchaseCreditNote, Contact
from .gl_helpers import post_gl, revert_gl
from app.services.gl_posting import post_purchase_refund_gl

router = APIRouter(prefix="/purchase-refunds", tags=["purchase-refunds"])


class PurchaseRefundCreate(BaseModel):
    refund_no: Optional[str] = None
    refund_date: datetime
    amount: float
    currency: str = "MYR"
    contact_id: Optional[UUID] = None
    bill_id: Optional[UUID] = None
    pcn_id: Optional[UUID] = None
    payment_method: str = "bank_transfer"
    bank_account_id: Optional[str] = None
    reference_no: Optional[str] = None
    notes: Optional[str] = None


class PurchaseRefundUpdate(BaseModel):
    refund_no: Optional[str] = None
    refund_date: Optional[datetime] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    contact_id: Optional[UUID] = None
    bill_id: Optional[UUID] = None
    pcn_id: Optional[UUID] = None
    payment_method: Optional[str] = None
    bank_account_id: Optional[str] = None
    reference_no: Optional[str] = None
    notes: Optional[str] = None


class PurchaseRefundResponse(BaseModel):
    id: UUID
    organization_id: UUID
    refund_no: str
    contact_id: Optional[UUID]
    bill_id: Optional[UUID]
    pcn_id: Optional[UUID] = None
    refund_date: datetime
    amount: float
    currency: str
    payment_method: str
    bank_account_id: Optional[UUID]
    reference_no: Optional[str]
    notes: Optional[str]
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


def _gen_refund_no() -> str:
    now = datetime.now(timezone.utc)
    return f"PRF-{now.strftime('%Y%m')}-{random.randint(1000, 9999)}"


async def _deduct_bill(db: AsyncSession, bill_id: UUID, amount: float):
    """Reduce bill.amount_paid by amount (min 0), reopen if was paid."""
    result = await db.execute(select(Bill).where(Bill.id == bill_id))
    bill = result.scalar_one_or_none()
    if bill:
        bill.amount_paid = max(0.0, float(bill.amount_paid or 0) - amount)
        if bill.status == "paid":
            bill.status = "outstanding"


async def _restore_bill(db: AsyncSession, bill_id: UUID, amount: float):
    """Add amount back to bill.amount_paid, mark paid if fully covered."""
    result = await db.execute(select(Bill).where(Bill.id == bill_id))
    bill = result.scalar_one_or_none()
    if bill:
        bill.amount_paid = float(bill.amount_paid or 0) + amount
        if bill.amount_paid >= float(bill.total or 0):
            bill.status = "paid"


async def _deduct_pcn(db: AsyncSession, pcn_id: UUID, amount: float):
    """Increase PCN credit_applied by amount (tracking how much has been refunded)."""
    result = await db.execute(select(PurchaseCreditNote).where(PurchaseCreditNote.id == pcn_id))
    pcn = result.scalar_one_or_none()
    if pcn:
        pcn.credit_applied = float(pcn.credit_applied or 0) + amount
        if float(pcn.credit_applied) >= float(pcn.total or 0):
            pcn.status = "applied"


async def _restore_pcn(db: AsyncSession, pcn_id: UUID, amount: float):
    """Restore PCN balance by reducing credit_applied."""
    result = await db.execute(select(PurchaseCreditNote).where(PurchaseCreditNote.id == pcn_id))
    pcn = result.scalar_one_or_none()
    if pcn:
        pcn.credit_applied = max(0.0, float(pcn.credit_applied or 0) - amount)
        if float(pcn.credit_applied) < float(pcn.total or 0) and pcn.status == "applied":
            pcn.status = "issued"


@router.get("")
async def list_purchase_refunds(
    contact_id: Optional[UUID] = Query(None),
    from_date: Optional[datetime] = Query(None),
    to_date: Optional[datetime] = Query(None),
    p: PaginationParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    org_id = current_user["org_id"]
    base = select(PurchaseRefund).where(
        PurchaseRefund.organization_id == org_id,
        PurchaseRefund.status != "void",
    )
    if contact_id:
        base = base.where(PurchaseRefund.contact_id == contact_id)
    if from_date:
        base = base.where(PurchaseRefund.refund_date >= from_date)
    if to_date:
        base = base.where(PurchaseRefund.refund_date <= to_date)
    if p.search:
        like = f"%{p.search}%"
        contact_match = select(Contact.id).where(
            Contact.organization_id == org_id, Contact.name.ilike(like)
        )
        base = base.where(or_(
            PurchaseRefund.refund_no.ilike(like),
            PurchaseRefund.contact_id.in_(contact_match),
        ))
    if p.date_from:
        base = base.where(PurchaseRefund.refund_date >= p.date_from)
    if p.date_to:
        base = base.where(PurchaseRefund.refund_date <= p.date_to)

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    query = apply_sort(base, PurchaseRefund, p).offset(p.offset).limit(p.limit)
    items = (await db.execute(query)).scalars().all()
    items = [PurchaseRefundResponse.model_validate(i) for i in items]
    return paginated_result(items, total, p)


@router.post("", response_model=PurchaseRefundResponse, status_code=201)
async def create_purchase_refund(
    payload: PurchaseRefundCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    org_id = current_user["org_id"]
    data = payload.model_dump()
    custom_no = data.pop("refund_no", None)
    if custom_no:
        existing = (await db.execute(select(PurchaseRefund.id).where(PurchaseRefund.organization_id == org_id, PurchaseRefund.refund_no == custom_no))).first()
        if existing:
            raise HTTPException(status_code=400, detail="Refund number already in use")
        refund_no = custom_no
    else:
        refund_no = _gen_refund_no()
    refund = PurchaseRefund(
        organization_id=org_id,
        refund_no=refund_no,
        **data,
    )
    db.add(refund)
    await db.flush()

    # Deduct refund amount from linked bill's amount_paid
    if payload.bill_id:
        await _deduct_bill(db, payload.bill_id, float(payload.amount))

    # Deduct refund amount from linked PCN balance
    if payload.pcn_id:
        await _deduct_pcn(db, payload.pcn_id, float(payload.amount))

    # GL via shared service (org defaults -> hardcoded fallback)
    await post_purchase_refund_gl(
        db, org_id,
        refund_date=payload.refund_date,
        number=refund.refund_no,
        refund_id=refund.id,
        amount=float(payload.amount),
    )

    await db.commit()
    await log_audit(db, org_id, current_user["sub"], "create", "purchase_refund", refund.id)
    await db.refresh(refund)
    return refund


@router.get("/{refund_id}", response_model=PurchaseRefundResponse)
async def get_purchase_refund(
    refund_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(PurchaseRefund).where(
            PurchaseRefund.id == refund_id,
            PurchaseRefund.organization_id == current_user["org_id"],
        )
    )
    refund = result.scalar_one_or_none()
    if not refund:
        raise HTTPException(status_code=404, detail="Purchase refund not found")
    return refund


@router.patch("/{refund_id}", response_model=PurchaseRefundResponse)
async def update_purchase_refund(
    refund_id: UUID,
    payload: PurchaseRefundUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    result = await db.execute(
        select(PurchaseRefund).where(
            PurchaseRefund.id == refund_id,
            PurchaseRefund.organization_id == current_user["org_id"],
        )
    )
    refund = result.scalar_one_or_none()
    if not refund:
        raise HTTPException(status_code=404, detail="Purchase refund not found")

    update_data = payload.model_dump(exclude_unset=True)

    if "refund_no" in update_data and update_data["refund_no"]:
        existing = (await db.execute(select(PurchaseRefund.id).where(PurchaseRefund.organization_id == current_user["org_id"], PurchaseRefund.refund_no == update_data["refund_no"], PurchaseRefund.id != refund.id))).first()
        if existing:
            raise HTTPException(status_code=400, detail="Refund number already in use")

    # If bill_id/pcn_id/amount changed, reverse old effects and apply new ones
    new_bill_id = update_data.get("bill_id", refund.bill_id)
    new_pcn_id = update_data.get("pcn_id", refund.pcn_id)
    new_amount = float(update_data.get("amount", refund.amount) or 0)
    old_bill_id = refund.bill_id
    old_pcn_id = refund.pcn_id
    old_amount = float(refund.amount or 0)

    link_changed = "bill_id" in update_data or "pcn_id" in update_data or "amount" in update_data
    if link_changed and refund.status != "void":
        if old_bill_id:
            await _restore_bill(db, old_bill_id, old_amount)
        if new_bill_id:
            await _deduct_bill(db, new_bill_id, new_amount)
        if old_pcn_id:
            await _restore_pcn(db, old_pcn_id, old_amount)
        if new_pcn_id:
            await _deduct_pcn(db, new_pcn_id, new_amount)

    for key, val in update_data.items():
        setattr(refund, key, val)
    await db.commit()
    await db.refresh(refund)
    return refund


@router.delete("/{refund_id}", status_code=204)
async def delete_purchase_refund(
    refund_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    result = await db.execute(
        select(PurchaseRefund).where(
            PurchaseRefund.id == refund_id,
            PurchaseRefund.organization_id == current_user["org_id"],
        )
    )
    refund = result.scalar_one_or_none()
    if not refund:
        raise HTTPException(status_code=404, detail="Purchase refund not found")
    if refund.status not in ("draft", "void"):
        raise HTTPException(status_code=400, detail="Only draft or void refunds can be deleted. Void the refund first.")
    await db.delete(refund)
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "delete", "purchase_refund", refund_id)


@router.patch("/{refund_id}/status")
async def update_purchase_refund_status(
    refund_id: UUID,
    status: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    valid = {"draft", "completed", "void"}
    if status not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid}")
    result = await db.execute(
        select(PurchaseRefund).where(
            PurchaseRefund.id == refund_id,
            PurchaseRefund.organization_id == current_user["org_id"],
        )
    )
    refund = result.scalar_one_or_none()
    if not refund:
        raise HTTPException(status_code=404, detail="Purchase refund not found")
    if status == "void" and refund.status != "void":
        if refund.bill_id:
            await _restore_bill(db, refund.bill_id, float(refund.amount or 0))
        if refund.pcn_id:
            await _restore_pcn(db, refund.pcn_id, float(refund.amount or 0))
        await revert_gl(
            db, current_user["org_id"], refund_id, "purchase_refund",
            refund.refund_date,
            f"Reversal: Purchase refund {refund.refund_no} voided",
            refund.refund_no,
        )
    refund.status = status
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "status_change", "purchase_refund", refund_id)
    return {"id": str(refund_id), "status": status}


@router.get("/{refund_id}/activity")
async def purchase_refund_activity(refund_id: UUID, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    org_id = current_user["org_id"]
    result = await db.execute(select(PurchaseRefund).where(PurchaseRefund.id == refund_id, PurchaseRefund.organization_id == org_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Purchase refund not found")
    events: list[dict] = [{
        "ts": obj.refund_date.isoformat() if obj.refund_date else None,
        "type": "issued", "ref": obj.refund_no, "ref_id": str(obj.id),
        "delta": float(obj.amount or 0), "note": obj.notes or "", "status": obj.status,
        "balance": float(obj.amount or 0),
    }]
    if obj.bill_id:
        bill_result = await db.execute(select(Bill).where(Bill.id == obj.bill_id))
        bill = bill_result.scalar_one_or_none()
        if bill:
            events.append({
                "ts": obj.refund_date.isoformat() if obj.refund_date else None,
                "type": "payment", "ref": bill.bill_number, "ref_id": str(bill.id),
                "delta": -float(obj.amount or 0), "note": f"Refund against bill {bill.bill_number}", "status": bill.status,
                "balance": 0.0,
            })
    return {"total": float(obj.amount or 0), "events": events}
