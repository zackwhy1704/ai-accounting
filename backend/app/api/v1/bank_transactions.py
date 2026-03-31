from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID
from datetime import datetime
from typing import Optional
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import BankTransaction

router = APIRouter(prefix="/bank-transactions", tags=["bank-transactions"])


class BankTransactionCreate(BaseModel):
    transaction_type: str
    transaction_date: datetime
    description: str
    amount: float
    currency: str = "MYR"
    bank_account_id: Optional[UUID] = None
    contact_id: Optional[UUID] = None
    reference_no: Optional[str] = None
    payment_method: str = "bank_transfer"
    category: Optional[str] = None
    notes: Optional[str] = None


class BankTransactionUpdate(BaseModel):
    transaction_type: Optional[str] = None
    transaction_date: Optional[datetime] = None
    description: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    bank_account_id: Optional[UUID] = None
    contact_id: Optional[UUID] = None
    reference_no: Optional[str] = None
    payment_method: Optional[str] = None
    category: Optional[str] = None
    notes: Optional[str] = None


class BankTransactionResponse(BaseModel):
    id: UUID
    organization_id: UUID
    bank_account_id: Optional[UUID]
    contact_id: Optional[UUID]
    transaction_type: str
    transaction_date: datetime
    reference_no: Optional[str]
    description: str
    amount: float
    currency: str
    payment_method: str
    category: Optional[str]
    notes: Optional[str]
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("", response_model=list[BankTransactionResponse])
async def list_bank_transactions(
    transaction_type: Optional[str] = Query(None),
    from_date: Optional[datetime] = Query(None),
    to_date: Optional[datetime] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    q = select(BankTransaction).where(
        BankTransaction.organization_id == current_user["org_id"],
        BankTransaction.status != "void",
    )
    if transaction_type:
        q = q.where(BankTransaction.transaction_type == transaction_type)
    if from_date:
        q = q.where(BankTransaction.transaction_date >= from_date)
    if to_date:
        q = q.where(BankTransaction.transaction_date <= to_date)
    q = q.order_by(BankTransaction.transaction_date.desc())
    result = await db.execute(q)
    return result.scalars().all()


@router.post("", response_model=BankTransactionResponse, status_code=201)
async def create_bank_transaction(
    payload: BankTransactionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    txn = BankTransaction(
        organization_id=current_user["org_id"],
        **payload.model_dump(),
    )
    db.add(txn)
    await db.commit()
    await db.refresh(txn)
    return txn


@router.get("/{txn_id}", response_model=BankTransactionResponse)
async def get_bank_transaction(
    txn_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(BankTransaction).where(
            BankTransaction.id == txn_id,
            BankTransaction.organization_id == current_user["org_id"],
        )
    )
    txn = result.scalar_one_or_none()
    if not txn:
        raise HTTPException(status_code=404, detail="Bank transaction not found")
    return txn


@router.patch("/{txn_id}", response_model=BankTransactionResponse)
async def update_bank_transaction(
    txn_id: UUID,
    payload: BankTransactionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(BankTransaction).where(
            BankTransaction.id == txn_id,
            BankTransaction.organization_id == current_user["org_id"],
        )
    )
    txn = result.scalar_one_or_none()
    if not txn:
        raise HTTPException(status_code=404, detail="Bank transaction not found")
    for key, val in payload.model_dump(exclude_unset=True).items():
        setattr(txn, key, val)
    await db.commit()
    await db.refresh(txn)
    return txn


@router.delete("/{txn_id}", status_code=204)
async def void_bank_transaction(
    txn_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(BankTransaction).where(
            BankTransaction.id == txn_id,
            BankTransaction.organization_id == current_user["org_id"],
        )
    )
    txn = result.scalar_one_or_none()
    if not txn:
        raise HTTPException(status_code=404, detail="Bank transaction not found")
    txn.status = "void"
    await db.commit()
