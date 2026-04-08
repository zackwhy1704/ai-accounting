from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from uuid import UUID

from datetime import datetime
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import SaleReceipt
from app.schemas.schemas import SaleReceiptCreate, SaleReceiptResponse, SaleReceiptLineItem
from .gl_helpers import post_gl, revert_gl

router = APIRouter(prefix="/sale-receipts", tags=["sale-receipts"])


class SaleReceiptUpdate(BaseModel):
    contact_id: Optional[UUID] = None
    receipt_date: Optional[datetime] = None
    currency: Optional[str] = None
    payment_method: Optional[str] = None
    bank_account_id: Optional[UUID] = None
    notes: Optional[str] = None
    line_items: Optional[list[SaleReceiptLineItem]] = None


async def _next_receipt_number(org_id: UUID, db: AsyncSession) -> str:
    result = await db.execute(
        select(func.count(SaleReceipt.id)).where(SaleReceipt.organization_id == org_id)
    )
    count = result.scalar_one() + 1
    return f"SR-{count:05d}"


def _calc_totals(line_items: list) -> tuple[float, float, float]:
    subtotal = sum(item.quantity * item.unit_price for item in line_items)
    tax_amount = sum(item.quantity * item.unit_price * item.tax_rate / 100 for item in line_items)
    return subtotal, tax_amount, subtotal + tax_amount


@router.get("", response_model=list[SaleReceiptResponse])
async def list_sale_receipts(
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    q = select(SaleReceipt).where(SaleReceipt.organization_id == current_user["org_id"])
    if status:
        q = q.where(SaleReceipt.status == status)
    q = q.order_by(SaleReceipt.receipt_date.desc())
    result = await db.execute(q)
    return result.scalars().all()


@router.post("", response_model=SaleReceiptResponse, status_code=201)
async def create_sale_receipt(
    payload: SaleReceiptCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    subtotal, tax_amount, total = _calc_totals(payload.line_items)
    receipt_number = await _next_receipt_number(current_user["org_id"], db)
    receipt = SaleReceipt(
        organization_id=current_user["org_id"],
        receipt_number=receipt_number,
        contact_id=payload.contact_id,
        receipt_date=payload.receipt_date,
        currency=payload.currency,
        payment_method=payload.payment_method,
        bank_account_id=payload.bank_account_id,
        notes=payload.notes,
        line_items=[item.model_dump() for item in payload.line_items],
        subtotal=subtotal,
        tax_amount=tax_amount,
        total=total,
    )
    db.add(receipt)
    await db.flush()

    # GL: Dr Cash / Cr Revenue (+ Cr GST Payable if tax)
    entries = [
        ("1000", total, 0),        # Dr Cash/Bank
        ("4000", 0, subtotal),     # Cr Revenue
    ]
    if tax_amount > 0:
        entries.append(("2100", 0, tax_amount))  # Cr GST Payable
    await post_gl(
        db, current_user["org_id"], payload.receipt_date,
        f"Sale Receipt {receipt_number}",
        receipt_number, "sale_receipt", receipt.id, entries,
    )

    await db.commit()
    await db.refresh(receipt)
    return receipt


@router.get("/{receipt_id}", response_model=SaleReceiptResponse)
async def get_sale_receipt(
    receipt_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(SaleReceipt).where(
            SaleReceipt.id == receipt_id,
            SaleReceipt.organization_id == current_user["org_id"],
        )
    )
    receipt = result.scalar_one_or_none()
    if not receipt:
        raise HTTPException(status_code=404, detail="Sale receipt not found")
    return receipt


@router.patch("/{receipt_id}", response_model=SaleReceiptResponse)
async def update_sale_receipt(
    receipt_id: UUID,
    data: SaleReceiptUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(SaleReceipt).where(
            SaleReceipt.id == receipt_id,
            SaleReceipt.organization_id == current_user["org_id"],
        )
    )
    receipt = result.scalar_one_or_none()
    if not receipt:
        raise HTTPException(status_code=404, detail="Sale receipt not found")

    update_data = data.model_dump(exclude_unset=True)

    if "line_items" in update_data:
        line_items_raw = update_data.pop("line_items")
        subtotal, tax_amount, total = _calc_totals(data.line_items)
        receipt.line_items = [item.model_dump() for item in data.line_items]
        receipt.subtotal = subtotal
        receipt.tax_amount = tax_amount
        receipt.total = total

    for key, value in update_data.items():
        setattr(receipt, key, value)

    await db.commit()
    await db.refresh(receipt)
    return receipt


@router.post("/{receipt_id}/void", response_model=SaleReceiptResponse)
async def void_sale_receipt(
    receipt_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(SaleReceipt).where(
            SaleReceipt.id == receipt_id,
            SaleReceipt.organization_id == current_user["org_id"],
        )
    )
    receipt = result.scalar_one_or_none()
    if not receipt:
        raise HTTPException(status_code=404, detail="Sale receipt not found")
    if receipt.status == "void":
        raise HTTPException(status_code=409, detail="Already voided")
    receipt.status = "void"
    await revert_gl(
        db, current_user["org_id"], receipt_id, "sale_receipt",
        receipt.receipt_date,
        f"Reversal: Sale Receipt {receipt.receipt_number} voided",
        receipt.receipt_number,
    )
    await db.commit()
    await db.refresh(receipt)
    return receipt
