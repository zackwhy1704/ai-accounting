from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from uuid import UUID
from typing import Any

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import CustomField

router = APIRouter(prefix="/custom-fields", tags=["custom-fields"])


class CustomFieldCreate(BaseModel):
    entity_type: str       # invoice | bill | contact | product | quotation
    field_name: str
    field_label: str
    field_type: str        # text | number | date | select | checkbox
    is_required: bool = False
    options: dict | None = None
    default_value: str | None = None
    sort_order: int = 0


class CustomFieldUpdate(BaseModel):
    field_label: str | None = None
    is_required: bool | None = None
    options: dict | None = None
    default_value: str | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class CustomFieldResponse(BaseModel):
    id: UUID
    organization_id: UUID
    entity_type: str
    field_name: str
    field_label: str
    field_type: str
    is_required: bool
    options: dict | None
    default_value: str | None
    sort_order: int
    is_active: bool
    created_at: Any
    model_config = {"from_attributes": True}


@router.get("", response_model=list[CustomFieldResponse])
async def list_custom_fields(
    entity_type: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    q = select(CustomField).where(CustomField.organization_id == current_user["org_id"])
    if entity_type:
        q = q.where(CustomField.entity_type == entity_type)
    q = q.where(CustomField.is_active == True).order_by(CustomField.entity_type, CustomField.sort_order)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("", response_model=CustomFieldResponse, status_code=201)
async def create_custom_field(
    payload: CustomFieldCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    cf = CustomField(organization_id=current_user["org_id"], **payload.model_dump())
    db.add(cf)
    await db.commit()
    await db.refresh(cf)
    return cf


@router.patch("/{field_id}", response_model=CustomFieldResponse)
async def update_custom_field(
    field_id: UUID,
    payload: CustomFieldUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(CustomField).where(
            CustomField.id == field_id,
            CustomField.organization_id == current_user["org_id"],
        )
    )
    cf = result.scalar_one_or_none()
    if not cf:
        raise HTTPException(status_code=404, detail="Custom field not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(cf, k, v)
    await db.commit()
    await db.refresh(cf)
    return cf


@router.delete("/{field_id}", status_code=204)
async def delete_custom_field(
    field_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(CustomField).where(
            CustomField.id == field_id,
            CustomField.organization_id == current_user["org_id"],
        )
    )
    cf = result.scalar_one_or_none()
    if not cf:
        raise HTTPException(status_code=404, detail="Custom field not found")
    cf.is_active = False
    await db.commit()
