from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID
from datetime import datetime
from typing import Optional
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import BankTransfer
from .gl_helpers import post_gl_by_id, revert_gl

router = APIRouter(prefix="/bank-transfers", tags=["bank-transfers"])


class BankTransferCreate(BaseModel):
    from_account_id: UUID
    to_account_id: UUID
    transfer_date: datetime
    amount: float
    reference_no: Optional[str] = None
    notes: Optional[str] = None


class BankTransferUpdate(BaseModel):
    from_account_id: Optional[UUID] = None
    to_account_id: Optional[UUID] = None
    transfer_date: Optional[datetime] = None
    amount: Optional[float] = None
    reference_no: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None


class BankTransferResponse(BaseModel):
    id: UUID
    organization_id: UUID
    from_account_id: UUID
    to_account_id: UUID
    transfer_date: datetime
    amount: float
    reference_no: Optional[str]
    notes: Optional[str]
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("", response_model=list[BankTransferResponse])
async def list_bank_transfers(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(BankTransfer)
        .where(BankTransfer.organization_id == current_user["org_id"])
        .order_by(BankTransfer.transfer_date.desc())
    )
    return result.scalars().all()


@router.post("", response_model=BankTransferResponse, status_code=201)
async def create_bank_transfer(
    payload: BankTransferCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if payload.from_account_id == payload.to_account_id:
        raise HTTPException(status_code=400, detail="From and To accounts must differ")
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    transfer = BankTransfer(
        organization_id=current_user["org_id"],
        **payload.model_dump(),
    )
    db.add(transfer)
    await db.flush()

    ref = payload.reference_no or f"XFER-{transfer.id.hex[:8].upper()}"
    await post_gl_by_id(
        db,
        current_user["org_id"],
        payload.transfer_date,
        payload.notes or f"Bank transfer {ref}",
        ref,
        "bank_transfer",
        transfer.id,
        [
            (payload.to_account_id, float(payload.amount), 0.0),
            (payload.from_account_id, 0.0, float(payload.amount)),
        ],
    )

    await db.commit()
    await db.refresh(transfer)
    return transfer


@router.get("/{transfer_id}", response_model=BankTransferResponse)
async def get_bank_transfer(
    transfer_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(BankTransfer).where(
            BankTransfer.id == transfer_id,
            BankTransfer.organization_id == current_user["org_id"],
        )
    )
    transfer = result.scalar_one_or_none()
    if not transfer:
        raise HTTPException(status_code=404, detail="Bank transfer not found")
    return transfer


@router.patch("/{transfer_id}", response_model=BankTransferResponse)
async def update_bank_transfer(
    transfer_id: UUID,
    payload: BankTransferUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(BankTransfer).where(
            BankTransfer.id == transfer_id,
            BankTransfer.organization_id == current_user["org_id"],
        )
    )
    transfer = result.scalar_one_or_none()
    if not transfer:
        raise HTTPException(status_code=404, detail="Bank transfer not found")
    for key, val in payload.model_dump(exclude_unset=True).items():
        setattr(transfer, key, val)
    await db.commit()
    await db.refresh(transfer)
    return transfer


@router.delete("/{transfer_id}", status_code=204)
async def delete_bank_transfer(
    transfer_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(BankTransfer).where(
            BankTransfer.id == transfer_id,
            BankTransfer.organization_id == current_user["org_id"],
        )
    )
    transfer = result.scalar_one_or_none()
    if not transfer:
        raise HTTPException(status_code=404, detail="Bank transfer not found")
    await revert_gl(
        db,
        current_user["org_id"],
        transfer.id,
        "bank_transfer",
        transfer.transfer_date,
        f"Reversal of bank transfer {transfer.reference_no or transfer.id}",
        transfer.reference_no or "",
    )
    await db.delete(transfer)
    await db.commit()
