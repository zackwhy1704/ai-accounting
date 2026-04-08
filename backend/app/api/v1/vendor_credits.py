from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from uuid import UUID

from datetime import datetime
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import VendorCredit
from app.schemas.schemas import VendorCreditCreate, VendorCreditResponse, VendorCreditLineItem
from .gl_helpers import post_gl, revert_gl

router = APIRouter(prefix="/vendor-credits", tags=["vendor-credits"])


class VendorCreditUpdate(BaseModel):
    contact_id: Optional[UUID] = None
    bill_id: Optional[UUID] = None
    issue_date: Optional[datetime] = None
    currency: Optional[str] = None
    notes: Optional[str] = None
    line_items: Optional[list[VendorCreditLineItem]] = None


async def _next_vc_number(org_id: UUID, db: AsyncSession) -> str:
    result = await db.execute(
        select(func.count(VendorCredit.id)).where(VendorCredit.organization_id == org_id)
    )
    count = result.scalar_one() + 1
    return f"VC-{count:05d}"


def _calc_totals(line_items: list) -> tuple[float, float, float]:
    subtotal = sum(item.quantity * item.unit_price for item in line_items)
    tax_amount = sum(item.quantity * item.unit_price * item.tax_rate / 100 for item in line_items)
    return subtotal, tax_amount, subtotal + tax_amount


@router.get("", response_model=list[VendorCreditResponse])
async def list_vendor_credits(
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    q = select(VendorCredit).where(VendorCredit.organization_id == current_user["org_id"])
    if status:
        q = q.where(VendorCredit.status == status)
    q = q.order_by(VendorCredit.issue_date.desc())
    result = await db.execute(q)
    return result.scalars().all()


@router.post("", response_model=VendorCreditResponse, status_code=201)
async def create_vendor_credit(
    payload: VendorCreditCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    subtotal, tax_amount, total = _calc_totals(payload.line_items)
    vc_number = await _next_vc_number(current_user["org_id"], db)
    vc = VendorCredit(
        organization_id=current_user["org_id"],
        vendor_credit_number=vc_number,
        contact_id=payload.contact_id,
        bill_id=payload.bill_id,
        issue_date=payload.issue_date,
        currency=payload.currency,
        notes=payload.notes,
        line_items=[item.model_dump() for item in payload.line_items],
        subtotal=subtotal,
        tax_amount=tax_amount,
        total=total,
    )
    db.add(vc)
    await db.flush()

    # GL: Dr AP / Cr Vendor Credit Liability
    await post_gl(
        db, current_user["org_id"], payload.issue_date,
        f"Vendor Credit {vc_number}",
        vc_number, "vendor_credit", vc.id,
        [("2000", total, 0), ("2200", 0, total)],
    )

    await db.commit()
    await db.refresh(vc)
    return vc


@router.get("/{vc_id}", response_model=VendorCreditResponse)
async def get_vendor_credit(
    vc_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(VendorCredit).where(
            VendorCredit.id == vc_id,
            VendorCredit.organization_id == current_user["org_id"],
        )
    )
    vc = result.scalar_one_or_none()
    if not vc:
        raise HTTPException(status_code=404, detail="Vendor credit not found")
    return vc


@router.patch("/{vc_id}", response_model=VendorCreditResponse)
async def update_vendor_credit(
    vc_id: UUID,
    data: VendorCreditUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(VendorCredit).where(
            VendorCredit.id == vc_id,
            VendorCredit.organization_id == current_user["org_id"],
        )
    )
    vc = result.scalar_one_or_none()
    if not vc:
        raise HTTPException(status_code=404, detail="Vendor credit not found")

    update_data = data.model_dump(exclude_unset=True)

    if "line_items" in update_data:
        line_items_raw = update_data.pop("line_items")
        subtotal, tax_amount, total = _calc_totals(data.line_items)
        vc.line_items = [item.model_dump() for item in data.line_items]
        vc.subtotal = subtotal
        vc.tax_amount = tax_amount
        vc.total = total

    for key, value in update_data.items():
        setattr(vc, key, value)

    await db.commit()
    await db.refresh(vc)
    return vc


@router.post("/{vc_id}/void", response_model=VendorCreditResponse)
async def void_vendor_credit(
    vc_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(VendorCredit).where(
            VendorCredit.id == vc_id,
            VendorCredit.organization_id == current_user["org_id"],
        )
    )
    vc = result.scalar_one_or_none()
    if not vc:
        raise HTTPException(status_code=404, detail="Vendor credit not found")
    if vc.status == "void":
        raise HTTPException(status_code=409, detail="Already voided")
    vc.status = "void"
    await revert_gl(
        db, current_user["org_id"], vc_id, "vendor_credit",
        vc.issue_date,
        f"Reversal: Vendor Credit {vc.vendor_credit_number} voided",
        vc.vendor_credit_number,
    )
    await db.commit()
    await db.refresh(vc)
    return vc
