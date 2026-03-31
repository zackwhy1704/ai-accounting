from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from uuid import UUID
from typing import Any

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import InvoiceTemplate

router = APIRouter(prefix="/invoice-templates", tags=["invoice-templates"])


class TemplateCreate(BaseModel):
    name: str
    layout: str = "classic"
    primary_color: str = "#4D63FF"
    secondary_color: str = "#F8FAFF"
    logo_url: str | None = None
    show_logo: bool = True
    show_payment_terms: bool = True
    show_notes: bool = True
    show_bank_details: bool = True
    show_tax_breakdown: bool = True
    show_signature: bool = False
    header_text: str | None = None
    footer_text: str | None = None
    terms_text: str | None = None
    bank_details_text: str | None = None


class TemplateUpdate(BaseModel):
    name: str | None = None
    layout: str | None = None
    primary_color: str | None = None
    secondary_color: str | None = None
    logo_url: str | None = None
    show_logo: bool | None = None
    show_payment_terms: bool | None = None
    show_notes: bool | None = None
    show_bank_details: bool | None = None
    show_tax_breakdown: bool | None = None
    show_signature: bool | None = None
    header_text: str | None = None
    footer_text: str | None = None
    terms_text: str | None = None
    bank_details_text: str | None = None
    is_default: bool | None = None


class TemplateResponse(BaseModel):
    id: UUID
    organization_id: UUID
    name: str
    is_default: bool
    layout: str
    primary_color: str
    secondary_color: str
    logo_url: str | None
    show_logo: bool
    show_payment_terms: bool
    show_notes: bool
    show_bank_details: bool
    show_tax_breakdown: bool
    show_signature: bool
    header_text: str | None
    footer_text: str | None
    terms_text: str | None
    bank_details_text: str | None
    created_at: Any
    updated_at: Any
    model_config = {"from_attributes": True}


@router.get("", response_model=list[TemplateResponse])
async def list_templates(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(InvoiceTemplate)
        .where(InvoiceTemplate.organization_id == current_user["org_id"])
        .order_by(InvoiceTemplate.is_default.desc(), InvoiceTemplate.created_at)
    )
    return result.scalars().all()


@router.post("", response_model=TemplateResponse, status_code=201)
async def create_template(
    payload: TemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    tmpl = InvoiceTemplate(organization_id=current_user["org_id"], **payload.model_dump())
    db.add(tmpl)
    await db.commit()
    await db.refresh(tmpl)
    return tmpl


@router.get("/{tmpl_id}", response_model=TemplateResponse)
async def get_template(
    tmpl_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(InvoiceTemplate).where(
            InvoiceTemplate.id == tmpl_id,
            InvoiceTemplate.organization_id == current_user["org_id"],
        )
    )
    tmpl = result.scalar_one_or_none()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    return tmpl


@router.patch("/{tmpl_id}", response_model=TemplateResponse)
async def update_template(
    tmpl_id: UUID,
    payload: TemplateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(InvoiceTemplate).where(
            InvoiceTemplate.id == tmpl_id,
            InvoiceTemplate.organization_id == current_user["org_id"],
        )
    )
    tmpl = result.scalar_one_or_none()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")

    # If setting as default, unset other defaults
    if payload.is_default:
        others = await db.execute(
            select(InvoiceTemplate).where(
                InvoiceTemplate.organization_id == current_user["org_id"],
                InvoiceTemplate.id != tmpl_id,
            )
        )
        for other in others.scalars().all():
            other.is_default = False

    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(tmpl, k, v)
    await db.commit()
    await db.refresh(tmpl)
    return tmpl


@router.delete("/{tmpl_id}", status_code=204)
async def delete_template(
    tmpl_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(InvoiceTemplate).where(
            InvoiceTemplate.id == tmpl_id,
            InvoiceTemplate.organization_id == current_user["org_id"],
        )
    )
    tmpl = result.scalar_one_or_none()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    await db.delete(tmpl)
    await db.commit()
