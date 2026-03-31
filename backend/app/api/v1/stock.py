import random
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID
from datetime import datetime, timezone
from typing import Optional, Any
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import StockAdjustment, StockTransfer

# ── Schemas ────────────────────────────────────

class StockAdjustmentCreate(BaseModel):
    adjustment_date: datetime
    reference_no: Optional[str] = None
    reason: str = "Inventory Adjustment"
    notes: Optional[str] = None
    lines: list[Any] = []


class StockAdjustmentUpdate(BaseModel):
    adjustment_date: Optional[datetime] = None
    reference_no: Optional[str] = None
    reason: Optional[str] = None
    notes: Optional[str] = None
    lines: Optional[list[Any]] = None


class StockAdjustmentResponse(BaseModel):
    id: UUID
    organization_id: UUID
    adjustment_no: str
    adjustment_date: datetime
    reference_no: Optional[str]
    reason: str
    notes: Optional[str]
    status: str
    lines: list[Any]
    created_at: datetime

    model_config = {"from_attributes": True}


class StockTransferCreate(BaseModel):
    transfer_date: datetime
    from_location: Optional[str] = None
    to_location: Optional[str] = None
    notes: Optional[str] = None
    lines: list[Any] = []


class StockTransferUpdate(BaseModel):
    transfer_date: Optional[datetime] = None
    from_location: Optional[str] = None
    to_location: Optional[str] = None
    notes: Optional[str] = None
    lines: Optional[list[Any]] = None


class StockTransferResponse(BaseModel):
    id: UUID
    organization_id: UUID
    transfer_no: str
    transfer_date: datetime
    from_location: Optional[str]
    to_location: Optional[str]
    notes: Optional[str]
    status: str
    lines: list[Any]
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Helpers ────────────────────────────────────

def _gen_adj_no() -> str:
    now = datetime.now(timezone.utc)
    return f"ADJ-{now.strftime('%Y%m')}-{random.randint(1000, 9999)}"


def _gen_trf_no() -> str:
    now = datetime.now(timezone.utc)
    return f"TRF-{now.strftime('%Y%m')}-{random.randint(1000, 9999)}"


# ── Stock Adjustments Router ───────────────────

adjustments_router = APIRouter(prefix="/stock-adjustments", tags=["stock-adjustments"])


@adjustments_router.get("", response_model=list[StockAdjustmentResponse])
async def list_adjustments(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(StockAdjustment)
        .where(StockAdjustment.organization_id == current_user["org_id"])
        .order_by(StockAdjustment.adjustment_date.desc())
    )
    return result.scalars().all()


@adjustments_router.post("", response_model=StockAdjustmentResponse, status_code=201)
async def create_adjustment(
    payload: StockAdjustmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    adj = StockAdjustment(
        organization_id=current_user["org_id"],
        adjustment_no=_gen_adj_no(),
        **payload.model_dump(),
    )
    db.add(adj)
    await db.commit()
    await db.refresh(adj)
    return adj


@adjustments_router.get("/{adj_id}", response_model=StockAdjustmentResponse)
async def get_adjustment(
    adj_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(StockAdjustment).where(
            StockAdjustment.id == adj_id,
            StockAdjustment.organization_id == current_user["org_id"],
        )
    )
    adj = result.scalar_one_or_none()
    if not adj:
        raise HTTPException(status_code=404, detail="Stock adjustment not found")
    return adj


@adjustments_router.patch("/{adj_id}", response_model=StockAdjustmentResponse)
async def update_adjustment(
    adj_id: UUID,
    payload: StockAdjustmentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(StockAdjustment).where(
            StockAdjustment.id == adj_id,
            StockAdjustment.organization_id == current_user["org_id"],
        )
    )
    adj = result.scalar_one_or_none()
    if not adj:
        raise HTTPException(status_code=404, detail="Stock adjustment not found")
    for key, val in payload.model_dump(exclude_unset=True).items():
        setattr(adj, key, val)
    await db.commit()
    await db.refresh(adj)
    return adj


@adjustments_router.delete("/{adj_id}", status_code=204)
async def delete_adjustment(
    adj_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(StockAdjustment).where(
            StockAdjustment.id == adj_id,
            StockAdjustment.organization_id == current_user["org_id"],
        )
    )
    adj = result.scalar_one_or_none()
    if not adj:
        raise HTTPException(status_code=404, detail="Stock adjustment not found")
    await db.delete(adj)
    await db.commit()


@adjustments_router.post("/{adj_id}/confirm", response_model=StockAdjustmentResponse)
async def confirm_adjustment(
    adj_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(StockAdjustment).where(
            StockAdjustment.id == adj_id,
            StockAdjustment.organization_id == current_user["org_id"],
        )
    )
    adj = result.scalar_one_or_none()
    if not adj:
        raise HTTPException(status_code=404, detail="Stock adjustment not found")
    if adj.status != "draft":
        raise HTTPException(status_code=400, detail="Only draft adjustments can be confirmed")
    adj.status = "confirmed"
    await db.commit()
    await db.refresh(adj)
    return adj


# ── Stock Transfers Router ─────────────────────

transfers_router = APIRouter(prefix="/stock-transfers", tags=["stock-transfers"])


@transfers_router.get("", response_model=list[StockTransferResponse])
async def list_transfers(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(StockTransfer)
        .where(StockTransfer.organization_id == current_user["org_id"])
        .order_by(StockTransfer.transfer_date.desc())
    )
    return result.scalars().all()


@transfers_router.post("", response_model=StockTransferResponse, status_code=201)
async def create_transfer(
    payload: StockTransferCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    trf = StockTransfer(
        organization_id=current_user["org_id"],
        transfer_no=_gen_trf_no(),
        **payload.model_dump(),
    )
    db.add(trf)
    await db.commit()
    await db.refresh(trf)
    return trf


@transfers_router.get("/{trf_id}", response_model=StockTransferResponse)
async def get_transfer(
    trf_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(StockTransfer).where(
            StockTransfer.id == trf_id,
            StockTransfer.organization_id == current_user["org_id"],
        )
    )
    trf = result.scalar_one_or_none()
    if not trf:
        raise HTTPException(status_code=404, detail="Stock transfer not found")
    return trf


@transfers_router.patch("/{trf_id}", response_model=StockTransferResponse)
async def update_transfer(
    trf_id: UUID,
    payload: StockTransferUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(StockTransfer).where(
            StockTransfer.id == trf_id,
            StockTransfer.organization_id == current_user["org_id"],
        )
    )
    trf = result.scalar_one_or_none()
    if not trf:
        raise HTTPException(status_code=404, detail="Stock transfer not found")
    for key, val in payload.model_dump(exclude_unset=True).items():
        setattr(trf, key, val)
    await db.commit()
    await db.refresh(trf)
    return trf


@transfers_router.delete("/{trf_id}", status_code=204)
async def delete_transfer(
    trf_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(StockTransfer).where(
            StockTransfer.id == trf_id,
            StockTransfer.organization_id == current_user["org_id"],
        )
    )
    trf = result.scalar_one_or_none()
    if not trf:
        raise HTTPException(status_code=404, detail="Stock transfer not found")
    await db.delete(trf)
    await db.commit()


@transfers_router.post("/{trf_id}/complete", response_model=StockTransferResponse)
async def complete_transfer(
    trf_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(StockTransfer).where(
            StockTransfer.id == trf_id,
            StockTransfer.organization_id == current_user["org_id"],
        )
    )
    trf = result.scalar_one_or_none()
    if not trf:
        raise HTTPException(status_code=404, detail="Stock transfer not found")
    if trf.status != "draft":
        raise HTTPException(status_code=400, detail="Only draft transfers can be completed")
    trf.status = "completed"
    await db.commit()
    await db.refresh(trf)
    return trf
