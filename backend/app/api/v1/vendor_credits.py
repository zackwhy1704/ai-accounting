from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from uuid import UUID

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import VendorCredit
from app.schemas.schemas import VendorCreditCreate, VendorCreditResponse

router = APIRouter(prefix="/vendor-credits", tags=["vendor-credits"])


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
    await db.commit()
    await db.refresh(vc)
    return vc
