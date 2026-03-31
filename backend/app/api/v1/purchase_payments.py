import random
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID
from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import PurchasePayment
from .gl_helpers import post_gl, revert_gl

router = APIRouter(prefix="/purchase-payments", tags=["purchase-payments"])


class PurchasePaymentCreate(BaseModel):
    payment_date: datetime
    amount: float
    currency: str = "MYR"
    contact_id: Optional[UUID] = None
    payment_method: str = "bank_transfer"
    reference_no: Optional[str] = None
    notes: Optional[str] = None


class PurchasePaymentUpdate(BaseModel):
    payment_date: Optional[datetime] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    contact_id: Optional[UUID] = None
    payment_method: Optional[str] = None
    reference_no: Optional[str] = None
    notes: Optional[str] = None


class PurchasePaymentResponse(BaseModel):
    id: UUID
    organization_id: UUID
    payment_no: str
    contact_id: Optional[UUID]
    payment_date: datetime
    amount: float
    currency: str
    payment_method: str
    reference_no: Optional[str]
    notes: Optional[str]
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


def _gen_payment_no() -> str:
    now = datetime.now(timezone.utc)
    return f"PPY-{now.strftime('%Y%m')}-{random.randint(1000, 9999)}"


@router.get("", response_model=list[PurchasePaymentResponse])
async def list_purchase_payments(
    contact_id: Optional[UUID] = Query(None),
    from_date: Optional[datetime] = Query(None),
    to_date: Optional[datetime] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    q = select(PurchasePayment).where(
        PurchasePayment.organization_id == current_user["org_id"],
        PurchasePayment.status != "void",
    )
    if contact_id:
        q = q.where(PurchasePayment.contact_id == contact_id)
    if from_date:
        q = q.where(PurchasePayment.payment_date >= from_date)
    if to_date:
        q = q.where(PurchasePayment.payment_date <= to_date)
    q = q.order_by(PurchasePayment.payment_date.desc())
    result = await db.execute(q)
    return result.scalars().all()


@router.post("", response_model=PurchasePaymentResponse, status_code=201)
async def create_purchase_payment(
    payload: PurchasePaymentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    org_id = current_user["org_id"]
    payment = PurchasePayment(
        organization_id=org_id,
        payment_no=_gen_payment_no(),
        **payload.model_dump(),
    )
    db.add(payment)
    await db.flush()

    # GL: Dr AP / Cr Cash (paying a vendor reduces AP and cash)
    await post_gl(
        db, org_id, payload.payment_date,
        f"Purchase payment {payment.payment_no}",
        payment.payment_no, "purchase_payment", payment.id,
        [("2000", float(payload.amount), 0), ("1000", 0, float(payload.amount))],
    )

    await db.commit()
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
    for key, val in payload.model_dump(exclude_unset=True).items():
        setattr(payment, key, val)
    await db.commit()
    await db.refresh(payment)
    return payment


@router.delete("/{payment_id}", status_code=204)
async def void_purchase_payment(
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
    payment.status = "void"
    await revert_gl(
        db, current_user["org_id"], payment_id, "purchase_payment",
        payment.payment_date,
        f"Reversal: Purchase payment {payment.payment_no} voided",
        payment.payment_no,
    )
    await db.commit()
