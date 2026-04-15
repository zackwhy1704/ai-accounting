from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID
from datetime import datetime
from typing import Optional
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import FixedAsset
from .gl_helpers import post_gl_by_id, revert_gl

router = APIRouter(prefix="/fixed-assets", tags=["fixed-assets"])


class FixedAssetCreate(BaseModel):
    name: str
    asset_type: str = "Equipment"
    code: Optional[str] = None
    serial_no: Optional[str] = None
    purchase_date: Optional[datetime] = None
    purchase_cost: float = 0.0
    salvage_value: float = 0.0
    useful_life_years: int = 5
    depreciation_method: str = "straight_line"
    notes: Optional[str] = None
    asset_account_id: Optional[UUID] = None
    accumulated_depreciation_account_id: Optional[UUID] = None
    depreciation_expense_account_id: Optional[UUID] = None


class FixedAssetUpdate(BaseModel):
    name: Optional[str] = None
    asset_type: Optional[str] = None
    code: Optional[str] = None
    serial_no: Optional[str] = None
    purchase_date: Optional[datetime] = None
    purchase_cost: Optional[float] = None
    salvage_value: Optional[float] = None
    useful_life_years: Optional[int] = None
    depreciation_method: Optional[str] = None
    current_value: Optional[float] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    asset_account_id: Optional[UUID] = None
    accumulated_depreciation_account_id: Optional[UUID] = None
    depreciation_expense_account_id: Optional[UUID] = None


class FixedAssetResponse(BaseModel):
    id: UUID
    organization_id: UUID
    code: Optional[str]
    name: str
    asset_type: str
    serial_no: Optional[str]
    purchase_date: Optional[datetime]
    purchase_cost: float
    salvage_value: float
    useful_life_years: int
    depreciation_method: str
    current_value: float
    accumulated_depreciation: float
    status: str
    notes: Optional[str]
    asset_account_id: Optional[UUID]
    accumulated_depreciation_account_id: Optional[UUID]
    depreciation_expense_account_id: Optional[UUID]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DepreciateRequest(BaseModel):
    amount: float
    period_end: datetime
    notes: Optional[str] = None


class DisposeRequest(BaseModel):
    disposal_date: datetime
    proceeds: float = 0.0
    proceeds_account_id: Optional[UUID] = None  # cash / bank account where money landed
    notes: Optional[str] = None


@router.get("", response_model=list[FixedAssetResponse])
async def list_fixed_assets(
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    q = select(FixedAsset).where(FixedAsset.organization_id == current_user["org_id"])
    if status:
        q = q.where(FixedAsset.status == status)
    q = q.order_by(FixedAsset.name)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("", response_model=FixedAssetResponse, status_code=201)
async def create_fixed_asset(
    payload: FixedAssetCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    data = payload.model_dump()
    asset = FixedAsset(
        organization_id=current_user["org_id"],
        current_value=data["purchase_cost"],
        **data,
    )
    db.add(asset)
    await db.commit()
    await db.refresh(asset)
    return asset


@router.get("/{asset_id}", response_model=FixedAssetResponse)
async def get_fixed_asset(
    asset_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(FixedAsset).where(
            FixedAsset.id == asset_id,
            FixedAsset.organization_id == current_user["org_id"],
        )
    )
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Fixed asset not found")
    return asset


@router.patch("/{asset_id}", response_model=FixedAssetResponse)
async def update_fixed_asset(
    asset_id: UUID,
    payload: FixedAssetUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(FixedAsset).where(
            FixedAsset.id == asset_id,
            FixedAsset.organization_id == current_user["org_id"],
        )
    )
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Fixed asset not found")
    for key, val in payload.model_dump(exclude_unset=True).items():
        setattr(asset, key, val)
    await db.commit()
    await db.refresh(asset)
    return asset


@router.delete("/{asset_id}", status_code=204)
async def delete_fixed_asset(
    asset_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(FixedAsset).where(
            FixedAsset.id == asset_id,
            FixedAsset.organization_id == current_user["org_id"],
        )
    )
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Fixed asset not found")
    await revert_gl(
        db,
        current_user["org_id"],
        asset.id,
        "fixed_asset",
        asset.purchase_date or datetime.utcnow(),
        f"Reversal — fixed asset {asset.name} deleted",
        asset.code or "",
    )
    await db.delete(asset)
    await db.commit()


async def _load_asset(db: AsyncSession, asset_id: UUID, org_id: str) -> FixedAsset:
    result = await db.execute(
        select(FixedAsset).where(FixedAsset.id == asset_id, FixedAsset.organization_id == org_id)
    )
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Fixed asset not found")
    return asset


@router.post("/{asset_id}/post-acquisition", response_model=FixedAssetResponse)
async def post_acquisition(
    asset_id: UUID,
    payment_account_id: UUID = Query(..., description="Bank/cash/AP account credited for the purchase"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Post the acquisition journal: Dr Fixed Asset / Cr Cash or AP."""
    asset = await _load_asset(db, asset_id, current_user["org_id"])
    if not asset.asset_account_id:
        raise HTTPException(status_code=400, detail="Asset account not configured on this fixed asset")
    if asset.purchase_cost <= 0:
        raise HTTPException(status_code=400, detail="Purchase cost must be > 0")
    txn = await post_gl_by_id(
        db,
        current_user["org_id"],
        asset.purchase_date or datetime.utcnow(),
        f"Acquisition — {asset.name}",
        asset.code or asset.name,
        "fixed_asset",
        asset.id,
        [
            (asset.asset_account_id, float(asset.purchase_cost), 0.0),
            (payment_account_id, 0.0, float(asset.purchase_cost)),
        ],
    )
    if txn is None:
        raise HTTPException(status_code=400, detail="Could not post — verify accounts exist")
    await db.commit()
    await db.refresh(asset)
    return asset


@router.post("/{asset_id}/depreciate", response_model=FixedAssetResponse)
async def depreciate(
    asset_id: UUID,
    payload: DepreciateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Post a depreciation period: Dr Depreciation Expense / Cr Accumulated Depreciation."""
    asset = await _load_asset(db, asset_id, current_user["org_id"])
    if not asset.depreciation_expense_account_id or not asset.accumulated_depreciation_account_id:
        raise HTTPException(status_code=400, detail="Depreciation accounts not configured on this fixed asset")
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Depreciation amount must be > 0")
    remaining = float(asset.current_value) - float(asset.salvage_value)
    if payload.amount > remaining:
        raise HTTPException(status_code=400, detail=f"Amount exceeds depreciable balance ({remaining:.2f})")

    txn = await post_gl_by_id(
        db,
        current_user["org_id"],
        payload.period_end,
        payload.notes or f"Depreciation — {asset.name}",
        asset.code or asset.name,
        "fixed_asset",
        asset.id,
        [
            (asset.depreciation_expense_account_id, float(payload.amount), 0.0),
            (asset.accumulated_depreciation_account_id, 0.0, float(payload.amount)),
        ],
    )
    if txn is None:
        raise HTTPException(status_code=400, detail="Could not post — verify accounts exist")

    asset.accumulated_depreciation = float(asset.accumulated_depreciation) + float(payload.amount)
    asset.current_value = float(asset.current_value) - float(payload.amount)
    await db.commit()
    await db.refresh(asset)
    return asset


@router.post("/{asset_id}/dispose", response_model=FixedAssetResponse)
async def dispose(
    asset_id: UUID,
    payload: DisposeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Dispose the asset:
        Dr Cash/Bank (proceeds)
        Dr Accumulated Depreciation (full)
        Cr Fixed Asset (purchase cost)
        Dr/Cr Gain or Loss on Disposal (the balancing figure)

    Gain = proceeds + accumulated_depr - purchase_cost. If gain > 0 → Cr Gain (income).
    If gain < 0 → Dr Loss (expense). The user picks ONE account for both via the
    asset's depreciation expense account or via a query param if needed.
    """
    asset = await _load_asset(db, asset_id, current_user["org_id"])
    if not asset.asset_account_id or not asset.accumulated_depreciation_account_id:
        raise HTTPException(status_code=400, detail="Asset/accumulated-depreciation accounts not configured")
    if payload.proceeds > 0 and not payload.proceeds_account_id:
        raise HTTPException(status_code=400, detail="proceeds_account_id required when proceeds > 0")
    if asset.status == "disposed":
        raise HTTPException(status_code=409, detail="Asset already disposed")

    cost = float(asset.purchase_cost)
    accum = float(asset.accumulated_depreciation)
    proceeds = float(payload.proceeds)
    gain = proceeds + accum - cost  # positive = gain, negative = loss

    entries: list[tuple[UUID, float, float]] = [
        (asset.accumulated_depreciation_account_id, accum, 0.0),
        (asset.asset_account_id, 0.0, cost),
    ]
    if proceeds > 0 and payload.proceeds_account_id:
        entries.append((payload.proceeds_account_id, proceeds, 0.0))
    if gain != 0:
        # Use depreciation expense account as the gain/loss bucket fallback
        gl_account = asset.depreciation_expense_account_id or asset.asset_account_id
        if gain > 0:
            entries.append((gl_account, 0.0, abs(gain)))   # Cr gain
        else:
            entries.append((gl_account, abs(gain), 0.0))   # Dr loss

    txn = await post_gl_by_id(
        db,
        current_user["org_id"],
        payload.disposal_date,
        payload.notes or f"Disposal — {asset.name}",
        asset.code or asset.name,
        "fixed_asset",
        asset.id,
        entries,
    )
    if txn is None:
        raise HTTPException(status_code=400, detail="Could not post — verify accounts exist")

    asset.status = "disposed"
    asset.current_value = 0
    await db.commit()
    await db.refresh(asset)
    return asset
