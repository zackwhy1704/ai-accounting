from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID
from datetime import datetime
from typing import Optional
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import Tag, Location, PaymentTerm, PaymentMethod

router = APIRouter(prefix="/settings-data", tags=["settings-data"])


# ── Tag schemas ────────────────────────────────

class TagCreate(BaseModel):
    name: str
    color: str = "#6366F1"


class TagResponse(BaseModel):
    id: UUID
    organization_id: UUID
    name: str
    color: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Location schemas ───────────────────────────

class LocationCreate(BaseModel):
    name: str
    address: Optional[str] = None
    is_active: bool = True


class LocationUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    is_active: Optional[bool] = None


class LocationResponse(BaseModel):
    id: UUID
    organization_id: UUID
    name: str
    address: Optional[str]
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ── PaymentTerm schemas ────────────────────────

class PaymentTermCreate(BaseModel):
    name: str
    due_days: int = 30
    is_default: bool = False


class PaymentTermUpdate(BaseModel):
    name: Optional[str] = None
    due_days: Optional[int] = None
    is_default: Optional[bool] = None


class PaymentTermResponse(BaseModel):
    id: UUID
    organization_id: UUID
    name: str
    due_days: int
    is_default: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ── PaymentMethod schemas ──────────────────────

class PaymentMethodCreate(BaseModel):
    name: str
    is_active: bool = True


class PaymentMethodUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None


class PaymentMethodResponse(BaseModel):
    id: UUID
    organization_id: UUID
    name: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Tag endpoints ──────────────────────────────

@router.get("/tags", response_model=list[TagResponse])
async def list_tags(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Tag)
        .where(Tag.organization_id == current_user["org_id"])
        .order_by(Tag.name)
    )
    return result.scalars().all()


@router.post("/tags", response_model=TagResponse, status_code=201)
async def create_tag(
    payload: TagCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    tag = Tag(organization_id=current_user["org_id"], **payload.model_dump())
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return tag


@router.delete("/tags/{tag_id}", status_code=204)
async def delete_tag(
    tag_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Tag).where(Tag.id == tag_id, Tag.organization_id == current_user["org_id"])
    )
    tag = result.scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    await db.delete(tag)
    await db.commit()


# ── Location endpoints ─────────────────────────

@router.get("/locations", response_model=list[LocationResponse])
async def list_locations(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Location)
        .where(Location.organization_id == current_user["org_id"])
        .order_by(Location.name)
    )
    return result.scalars().all()


@router.post("/locations", response_model=LocationResponse, status_code=201)
async def create_location(
    payload: LocationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    loc = Location(organization_id=current_user["org_id"], **payload.model_dump())
    db.add(loc)
    await db.commit()
    await db.refresh(loc)
    return loc


@router.patch("/locations/{loc_id}", response_model=LocationResponse)
async def update_location(
    loc_id: UUID,
    payload: LocationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Location).where(
            Location.id == loc_id,
            Location.organization_id == current_user["org_id"],
        )
    )
    loc = result.scalar_one_or_none()
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")
    for key, val in payload.model_dump(exclude_unset=True).items():
        setattr(loc, key, val)
    await db.commit()
    await db.refresh(loc)
    return loc


@router.delete("/locations/{loc_id}", status_code=204)
async def delete_location(
    loc_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Location).where(
            Location.id == loc_id,
            Location.organization_id == current_user["org_id"],
        )
    )
    loc = result.scalar_one_or_none()
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")
    await db.delete(loc)
    await db.commit()


# ── PaymentTerm endpoints ──────────────────────

@router.get("/payment-terms", response_model=list[PaymentTermResponse])
async def list_payment_terms(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(PaymentTerm)
        .where(PaymentTerm.organization_id == current_user["org_id"])
        .order_by(PaymentTerm.due_days)
    )
    return result.scalars().all()


@router.post("/payment-terms", response_model=PaymentTermResponse, status_code=201)
async def create_payment_term(
    payload: PaymentTermCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    term = PaymentTerm(organization_id=current_user["org_id"], **payload.model_dump())
    db.add(term)
    await db.commit()
    await db.refresh(term)
    return term


@router.patch("/payment-terms/{term_id}", response_model=PaymentTermResponse)
async def update_payment_term(
    term_id: UUID,
    payload: PaymentTermUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(PaymentTerm).where(
            PaymentTerm.id == term_id,
            PaymentTerm.organization_id == current_user["org_id"],
        )
    )
    term = result.scalar_one_or_none()
    if not term:
        raise HTTPException(status_code=404, detail="Payment term not found")
    for key, val in payload.model_dump(exclude_unset=True).items():
        setattr(term, key, val)
    await db.commit()
    await db.refresh(term)
    return term


@router.delete("/payment-terms/{term_id}", status_code=204)
async def delete_payment_term(
    term_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(PaymentTerm).where(
            PaymentTerm.id == term_id,
            PaymentTerm.organization_id == current_user["org_id"],
        )
    )
    term = result.scalar_one_or_none()
    if not term:
        raise HTTPException(status_code=404, detail="Payment term not found")
    await db.delete(term)
    await db.commit()


# ── PaymentMethod endpoints ────────────────────

@router.get("/payment-methods", response_model=list[PaymentMethodResponse])
async def list_payment_methods(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(PaymentMethod)
        .where(PaymentMethod.organization_id == current_user["org_id"])
        .order_by(PaymentMethod.name)
    )
    return result.scalars().all()


@router.post("/payment-methods", response_model=PaymentMethodResponse, status_code=201)
async def create_payment_method(
    payload: PaymentMethodCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    method = PaymentMethod(organization_id=current_user["org_id"], **payload.model_dump())
    db.add(method)
    await db.commit()
    await db.refresh(method)
    return method


@router.patch("/payment-methods/{method_id}", response_model=PaymentMethodResponse)
async def update_payment_method(
    method_id: UUID,
    payload: PaymentMethodUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(PaymentMethod).where(
            PaymentMethod.id == method_id,
            PaymentMethod.organization_id == current_user["org_id"],
        )
    )
    method = result.scalar_one_or_none()
    if not method:
        raise HTTPException(status_code=404, detail="Payment method not found")
    for key, val in payload.model_dump(exclude_unset=True).items():
        setattr(method, key, val)
    await db.commit()
    await db.refresh(method)
    return method


@router.delete("/payment-methods/{method_id}", status_code=204)
async def delete_payment_method(
    method_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(PaymentMethod).where(
            PaymentMethod.id == method_id,
            PaymentMethod.organization_id == current_user["org_id"],
        )
    )
    method = result.scalar_one_or_none()
    if not method:
        raise HTTPException(status_code=404, detail="Payment method not found")
    await db.delete(method)
    await db.commit()
