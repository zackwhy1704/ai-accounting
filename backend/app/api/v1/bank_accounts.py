from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID
from datetime import datetime
from typing import Optional
from pydantic import BaseModel

from sqlalchemy import func, or_
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import require_write
from app.core.pagination import PaginationParams, paginated_result, apply_sort
from app.core.audit import log_audit
from app.models.models import BankAccount, BankTransaction

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


@router.get("")
async def list_bank_accounts(
    p: PaginationParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    org_id = current_user["org_id"]
    base = select(BankAccount).where(BankAccount.organization_id == org_id)
    if p.search:
        like = f"%{p.search}%"
        base = base.where(or_(
            BankAccount.name.ilike(like),
            BankAccount.bank_name.ilike(like),
        ))

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    query = apply_sort(base, BankAccount, p, "name").offset(p.offset).limit(p.limit)
    items = (await db.execute(query)).scalars().all()
    items = [BankAccountResponse.model_validate(i) for i in items]
    return paginated_result(items, total, p)


@router.post("", response_model=BankAccountResponse, status_code=201)
async def create_bank_account(
    payload: BankAccountCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    data = payload.model_dump()
    opening_bal = data["opening_balance"]
    account = BankAccount(
        organization_id=current_user["org_id"],
        name=data["name"],
        account_type=data["account_type"],
        bank_name=data.get("bank_name"),
        account_number=data.get("account_number"),
        currency=data["currency"],
        opening_balance=opening_bal,
        current_balance=opening_bal,
    )
    db.add(account)
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "create", "bank_account", account.id)
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
    current_user: dict = Depends(require_write()),
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
    updates = payload.model_dump(exclude_unset=True)
    if "opening_balance" in updates and "current_balance" not in updates:
        updates["current_balance"] = updates["opening_balance"]
    for key, val in updates.items():
        setattr(account, key, val)
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "update", "bank_account", account_id)
    await db.refresh(account)
    return account


@router.delete("/{account_id}", status_code=204)
async def delete_bank_account(
    account_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
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
    txn_count_result = await db.execute(
        select(func.count(BankTransaction.id)).where(BankTransaction.bank_account_id == account_id)
    )
    if (txn_count_result.scalar() or 0) > 0:
        raise HTTPException(status_code=409, detail="Cannot delete a bank account that has transactions. Deactivate it instead.")
    await db.delete(account)
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "delete", "bank_account", account_id)
