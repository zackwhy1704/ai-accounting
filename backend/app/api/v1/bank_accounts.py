from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID
from datetime import datetime
from typing import Optional
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import BankAccount

router = APIRouter(prefix="/bank-accounts", tags=["bank-accounts"])


class BankAccountCreate(BaseModel):
    name: str
    account_type: str = "current"
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    currency: str = "MYR"
    opening_balance: float = 0.0


class BankAccountUpdate(BaseModel):
    name: Optional[str] = None
    account_type: Optional[str] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    currency: Optional[str] = None
    opening_balance: Optional[float] = None
    current_balance: Optional[float] = None
    is_active: Optional[bool] = None


class BankAccountResponse(BaseModel):
    id: UUID
    organization_id: UUID
    name: str
    account_type: str
    bank_name: Optional[str]
    account_number: Optional[str]
    currency: str
    opening_balance: float
    current_balance: float
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("", response_model=list[BankAccountResponse])
async def list_bank_accounts(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(BankAccount)
        .where(BankAccount.organization_id == current_user["org_id"])
        .order_by(BankAccount.name)
    )
    return result.scalars().all()


@router.post("", response_model=BankAccountResponse, status_code=201)
async def create_bank_account(
    payload: BankAccountCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    data = payload.model_dump()
    account = BankAccount(
        organization_id=current_user["org_id"],
        current_balance=data["opening_balance"],
        **data,
    )
    db.add(account)
    await db.commit()
    await db.refresh(account)
    return account


@router.get("/{account_id}", response_model=BankAccountResponse)
async def get_bank_account(
    account_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(BankAccount).where(
            BankAccount.id == account_id,
            BankAccount.organization_id == current_user["org_id"],
        )
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Bank account not found")
    return account


@router.patch("/{account_id}", response_model=BankAccountResponse)
async def update_bank_account(
    account_id: UUID,
    payload: BankAccountUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(BankAccount).where(
            BankAccount.id == account_id,
            BankAccount.organization_id == current_user["org_id"],
        )
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Bank account not found")
    for key, val in payload.model_dump(exclude_unset=True).items():
        setattr(account, key, val)
    await db.commit()
    await db.refresh(account)
    return account


@router.delete("/{account_id}", status_code=204)
async def delete_bank_account(
    account_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(BankAccount).where(
            BankAccount.id == account_id,
            BankAccount.organization_id == current_user["org_id"],
        )
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Bank account not found")
    await db.delete(account)
    await db.commit()
