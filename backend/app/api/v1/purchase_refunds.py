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
from app.models.models import PurchaseRefund

router = APIRouter(prefix="/purchase-refunds", tags=["purchase-refunds"])


class PurchaseRefundCreate(BaseModel):
    refund_date: datetime
    amount: float
    currency: str = "MYR"
    contact_id: Optional[UUID] = None
    payment_method: str = "bank_transfer"
    reference_no: Optional[str] = None
    notes: Optional[str] = None


class PurchaseRefundUpdate(BaseModel):
    refund_date: Optional[datetime] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    contact_id: Optional[UUID] = None
    payment_method: Optional[str] = None
    reference_no: Optional[str] = None
    notes: Optional[str] = None


class PurchaseRefundResponse(BaseModel):
    id: UUID
    organization_id: UUID
    refund_no: str
    contact_id: Optional[UUID]
    refund_date: datetime
    amount: float
    currency: str
    payment_method: str
    reference_no: Optional[str]
    notes: Optional[str]
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


def _gen_refund_no() -> str:
    now = datetime.now(timezone.utc)
    return f"PRF-{now.strftime('%Y%m')}-{random.randint(1000, 9999)}"


@router.get("", response_model=list[PurchaseRefundResponse])
async def list_purchase_refunds(
    contact_id: Optional[UUID] = Query(None),
    from_date: Optional[datetime] = Query(None),
    to_date: Optional[datetime] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    q = select(PurchaseRefund).where(
        PurchaseRefund.organization_id == current_user["org_id"],
        PurchaseRefund.status != "void",
    )
    if contact_id:
        q = q.where(PurchaseRefund.contact_id == contact_id)
    if from_date:
        q = q.where(PurchaseRefund.refund_date >= from_date)
    if to_date:
        q = q.where(PurchaseRefund.refund_date <= to_date)
    q = q.order_by(PurchaseRefund.refund_date.desc())
    result = await db.execute(q)
    return result.scalars().all()


@router.post("", response_model=PurchaseRefundResponse, status_code=201)
async def create_purchase_refund(
    payload: PurchaseRefundCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    refund = PurchaseRefund(
        organization_id=current_user["org_id"],
        refund_no=_gen_refund_no(),
        **payload.model_dump(),
    )
    db.add(refund)
    await db.commit()
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
    for key, val in payload.model_dump(exclude_unset=True).items():
        setattr(refund, key, val)
    await db.commit()
    await db.refresh(refund)
    return refund


@router.delete("/{refund_id}", status_code=204)
async def void_purchase_refund(
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
    refund.status = "void"
    await db.commit()
