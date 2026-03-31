from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID
from datetime import datetime
from typing import Optional
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import ContactGroup

router = APIRouter(prefix="/contact-groups", tags=["contact-groups"])


class ContactGroupCreate(BaseModel):
    name: str
    description: Optional[str] = None


class ContactGroupUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class ContactGroupResponse(BaseModel):
    id: UUID
    organization_id: UUID
    name: str
    description: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("", response_model=list[ContactGroupResponse])
async def list_contact_groups(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(ContactGroup)
        .where(ContactGroup.organization_id == current_user["org_id"])
        .order_by(ContactGroup.name)
    )
    return result.scalars().all()


@router.post("", response_model=ContactGroupResponse, status_code=201)
async def create_contact_group(
    payload: ContactGroupCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    group = ContactGroup(
        organization_id=current_user["org_id"],
        **payload.model_dump(),
    )
    db.add(group)
    await db.commit()
    await db.refresh(group)
    return group


@router.get("/{group_id}", response_model=ContactGroupResponse)
async def get_contact_group(
    group_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(ContactGroup).where(
            ContactGroup.id == group_id,
            ContactGroup.organization_id == current_user["org_id"],
        )
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Contact group not found")
    return group


@router.patch("/{group_id}", response_model=ContactGroupResponse)
async def update_contact_group(
    group_id: UUID,
    payload: ContactGroupUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(ContactGroup).where(
            ContactGroup.id == group_id,
            ContactGroup.organization_id == current_user["org_id"],
        )
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Contact group not found")
    for key, val in payload.model_dump(exclude_unset=True).items():
        setattr(group, key, val)
    await db.commit()
    await db.refresh(group)
    return group


@router.delete("/{group_id}", status_code=204)
async def delete_contact_group(
    group_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(ContactGroup).where(
            ContactGroup.id == group_id,
            ContactGroup.organization_id == current_user["org_id"],
        )
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Contact group not found")
    await db.delete(group)
    await db.commit()
