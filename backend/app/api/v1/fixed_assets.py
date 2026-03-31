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
    status: str
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


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
    await db.delete(asset)
    await db.commit()
