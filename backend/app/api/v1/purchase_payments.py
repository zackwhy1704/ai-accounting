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
from app.models.models import PurchasePayment, Bill, PurchaseDebitNote, Contact
from .gl_helpers import post_gl, post_gl_by_id, revert_gl
from app.core.org_defaults import get_default_accounts
from app.services.gl_posting import post_purchase_payment_gl
from app.core.audit import log_audit

router = APIRouter(prefix="/purchase-payments", tags=["purchase-payments"])


class PurchasePaymentCreate(BaseModel):
    payment_no: Optional[str] = None
    payment_date: datetime
    amount: float
    currency: str = "MYR"
    contact_id: Optional[UUID] = None
    bill_id: Optional[UUID] = None
    debit_note_id: Optional[UUID] = None
    payment_method: str = "bank_transfer"
    bank_account_id: Optional[str] = None
    reference_no: Optional[str] = None
    notes: Optional[str] = None


class PurchasePaymentUpdate(BaseModel):
    payment_no: Optional[str] = None
    payment_date: Optional[datetime] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    contact_id: Optional[UUID] = None
    bill_id: Optional[UUID] = None
    debit_note_id: Optional[UUID] = None
    payment_method: Optional[str] = None
    bank_account_id: Optional[str] = None
    reference_no: Optional[str] = None
    notes: Optional[str] = None


class PurchasePaymentResponse(BaseModel):
    id: UUID
    organization_id: UUID
    payment_no: str
    contact_id: Optional[UUID]
    bill_id: Optional[UUID] = None
    debit_note_id: Optional[UUID] = None
    payment_date: datetime
    amount: float
    currency: str
    payment_method: str
    bank_account_id: Optional[UUID]
    reference_no: Optional[str]
    notes: Optional[str]
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


def _gen_payment_no() -> str:
    now = datetime.now(timezone.utc)
    return f"PPY-{now.strftime('%Y%m')}-{random.randint(1000, 9999)}"


@router.get("")
async def list_purchase_payments(
    contact_id: Optional[UUID] = Query(None),
    from_date: Optional[datetime] = Query(None),
    to_date: Optional[datetime] = Query(None),
    p: PaginationParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    org_id = current_user["org_id"]
    base = select(PurchasePayment).where(
        PurchasePayment.organization_id == org_id,
        PurchasePayment.status != "void",
    )
    if contact_id:
        base = base.where(PurchasePayment.contact_id == contact_id)
    if from_date:
        base = base.where(PurchasePayment.payment_date >= from_date)
    if to_date:
        base = base.where(PurchasePayment.payment_date <= to_date)
    if p.search:
        like = f"%{p.search}%"
        contact_match = select(Contact.id).where(
            Contact.organization_id == org_id, Contact.name.ilike(like)
        )
        base = base.where(or_(
            PurchasePayment.payment_no.ilike(like),
            PurchasePayment.contact_id.in_(contact_match),
        ))
    if p.date_from:
        base = base.where(PurchasePayment.payment_date >= p.date_from)
    if p.date_to:
        base = base.where(PurchasePayment.payment_date <= p.date_to)

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    query = apply_sort(base, PurchasePayment, p).offset(p.offset).limit(p.limit)
    items = (await db.execute(query)).scalars().all()
    items = [PurchasePaymentResponse.model_validate(i) for i in items]
    return paginated_result(items, total, p)


@router.post("", response_model=PurchasePaymentResponse, status_code=201)
async def create_purchase_payment(
    payload: PurchasePaymentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    org_id = current_user["org_id"]
    data = payload.model_dump()
    custom_no = data.pop("payment_no", None)
    if custom_no:
        existing = (await db.execute(select(PurchasePayment.id).where(PurchasePayment.organization_id == org_id, PurchasePayment.payment_no == custom_no))).first()
        if existing:
            raise HTTPException(status_code=400, detail="Payment number already in use")
        payment_no = custom_no
    else:
        payment_no = _gen_payment_no()
    payment = PurchasePayment(
        organization_id=org_id,
        payment_no=payment_no,
        **data,
    )
    db.add(payment)
    await db.flush()

    # Update linked bill balance
    if payload.bill_id:
        bill_result = await db.execute(select(Bill).where(Bill.id == payload.bill_id))
        bill = bill_result.scalar_one_or_none()
        if bill:
            outstanding = float(bill.total or 0) - float(bill.amount_paid or 0)
            if float(payload.amount) > outstanding + 0.01:
                raise HTTPException(status_code=400, detail="Payment exceeds outstanding bill balance")
            bill.amount_paid = float(bill.amount_paid or 0) + float(payload.amount)
            bill.mark_paid()

    # Update linked debit note balance
    if payload.debit_note_id:
        dn_result = await db.execute(select(PurchaseDebitNote).where(PurchaseDebitNote.id == payload.debit_note_id))
        dn = dn_result.scalar_one_or_none()
        if dn:
            dn_outstanding = float(dn.total or 0) - float(dn.amount_paid or 0)
            if float(payload.amount) > dn_outstanding + 0.01:
                raise HTTPException(status_code=400, detail="Payment exceeds outstanding debit note balance")
            dn.amount_paid = float(dn.amount_paid or 0) + float(payload.amount)
            dn_total = float(dn.total or 0)
            if float(dn.amount_paid) >= dn_total:
                dn.status = "applied"
            elif float(dn.amount_paid) > 0:
                dn.status = "partially_paid"

    # GL: Dr AP / Cr Cash/Bank via shared service
    await post_purchase_payment_gl(
        db, org_id,
        payment_date=payload.payment_date,
        number=payment.payment_no,
        payment_id=payment.id,
        amount=float(payload.amount),
    )

    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "create", "purchase_payment", payment.id)
    await db.refresh(payment)
    return payment


@router.get("/{payment_id}", response_model=PurchasePaymentResponse)
async def get_purchase_payment(
    payment_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(PurchasePayment).where(
            PurchasePayment.id == payment_id,
            PurchasePayment.organization_id == current_user["org_id"],
        )
    )
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Purchase payment not found")
    return payment


@router.patch("/{payment_id}", response_model=PurchasePaymentResponse)
async def update_purchase_payment(
    payment_id: UUID,
    payload: PurchasePaymentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    result = await db.execute(
        select(PurchasePayment).where(
            PurchasePayment.id == payment_id,
            PurchasePayment.organization_id == current_user["org_id"],
        )
    )
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Purchase payment not found")
    if payment.status == "void":
        raise HTTPException(status_code=400, detail="Voided payments cannot be edited")

    update_data = payload.model_dump(exclude_unset=True)
    if "payment_no" in update_data and update_data["payment_no"]:
        existing = (await db.execute(select(PurchasePayment.id).where(PurchasePayment.organization_id == current_user["org_id"], PurchasePayment.payment_no == update_data["payment_no"], PurchasePayment.id != payment.id))).first()
        if existing:
            raise HTTPException(status_code=400, detail="Payment number already in use")

    # Recalculate bill balances when amount or bill_id changes
    new_amount = float(update_data.get("amount", payment.amount) or 0)
    new_bill_id = update_data.get("bill_id", payment.bill_id)
    old_bill_id = payment.bill_id
    old_amount = float(payment.amount or 0)
    bill_changed = "bill_id" in update_data or "amount" in update_data

    if bill_changed:
        # Revert old bill
        if old_bill_id:
            bill_result = await db.execute(select(Bill).where(Bill.id == old_bill_id))
            bill = bill_result.scalar_one_or_none()
            if bill:
                bill.amount_paid = max(0.0, float(bill.amount_paid or 0) - old_amount)
                bill.mark_paid()
        # Apply to new bill
        if new_bill_id:
            bill_result = await db.execute(select(Bill).where(Bill.id == new_bill_id))
            bill = bill_result.scalar_one_or_none()
            if bill:
                outstanding = float(bill.total or 0) - float(bill.amount_paid or 0)
                if new_amount > outstanding + 0.01:
                    raise HTTPException(status_code=400, detail="Payment exceeds outstanding bill balance")
                bill.amount_paid = float(bill.amount_paid or 0) + new_amount
                bill.mark_paid()

    for key, val in update_data.items():
        setattr(payment, key, val)
    await db.commit()
    await db.refresh(payment)
    return payment


async def _revert_bill_balance(db: AsyncSession, payment: PurchasePayment) -> None:
    """Reverse the bill's amount_paid and recalculate its status after voiding a payment."""
    if not payment.bill_id:
        return
    result = await db.execute(select(Bill).where(Bill.id == payment.bill_id))
    bill = result.scalar_one_or_none()
    if not bill:
        return
    bill.amount_paid = max(0.0, float(bill.amount_paid or 0) - float(payment.amount or 0))
    bill.mark_paid()


@router.delete("/{payment_id}", status_code=204)
async def void_purchase_payment(
    payment_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    result = await db.execute(
        select(PurchasePayment).where(
            PurchasePayment.id == payment_id,
            PurchasePayment.organization_id == current_user["org_id"],
        )
    )
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Purchase payment not found")
    payment.status = "void"
    await _revert_bill_balance(db, payment)
    await revert_gl(
        db, current_user["org_id"], payment_id, "purchase_payment",
        payment.payment_date,
        f"Reversal: Purchase payment {payment.payment_no} voided",
        payment.payment_no,
    )
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "delete", "purchase_payment", payment_id)


@router.patch("/{payment_id}/status")
async def update_purchase_payment_status(
    payment_id: UUID,
    status: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    valid = {"draft", "completed", "void"}
    if status not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid}")
    result = await db.execute(
        select(PurchasePayment).where(
            PurchasePayment.id == payment_id,
            PurchasePayment.organization_id == current_user["org_id"],
        )
    )
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Purchase payment not found")
    if status == "void" and payment.status != "void":
        await _revert_bill_balance(db, payment)
        await revert_gl(
            db, current_user["org_id"], payment_id, "purchase_payment",
            payment.payment_date,
            f"Reversal: Purchase payment {payment.payment_no} voided",
            payment.payment_no,
        )
    payment.status = status
    await db.commit()
    return {"id": str(payment_id), "status": status}


@router.get("/{payment_id}/activity")
async def purchase_payment_activity(payment_id: UUID, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    org_id = current_user["org_id"]
    result = await db.execute(select(PurchasePayment).where(PurchasePayment.id == payment_id, PurchasePayment.organization_id == org_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Purchase payment not found")
    events: list[dict] = [{
        "ts": obj.payment_date.isoformat() if obj.payment_date else None,
        "type": "issued", "ref": obj.payment_no, "ref_id": str(obj.id),
        "delta": float(obj.amount or 0), "note": obj.notes or "", "status": obj.status,
        "balance": float(obj.amount or 0),
    }]
    if obj.bill_id:
        bill_result = await db.execute(select(Bill).where(Bill.id == obj.bill_id))
        bill = bill_result.scalar_one_or_none()
        if bill:
            events.append({
                "ts": obj.payment_date.isoformat() if obj.payment_date else None,
                "type": "payment", "ref": bill.bill_number, "ref_id": str(bill.id),
                "delta": -float(obj.amount or 0), "note": f"Applied to bill {bill.bill_number}", "status": bill.status,
                "balance": 0.0,
            })
    return {"total": float(obj.amount or 0), "events": events}
