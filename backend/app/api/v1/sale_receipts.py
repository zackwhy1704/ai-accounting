from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from uuid import UUID

from datetime import datetime
from pydantic import BaseModel
from typing import Optional

from sqlalchemy import or_
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import require_write
from app.core.pagination import PaginationParams, paginated_result, apply_sort
from app.core.audit import log_audit
from app.models.models import SaleReceipt, Contact
from app.schemas.schemas import SaleReceiptCreate, SaleReceiptResponse, SaleReceiptLineItem
from .gl_helpers import post_gl, revert_gl
from app.services.gl_posting import post_sale_receipt_gl
from app.services.fx import document_rate
from app.services.inventory import issue_for_document_lines, reverse_moves
from app.services.gl_posting import post_inventory_gl

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


@router.get("")
async def list_sale_receipts(
    status: str | None = None,
    contact_id: UUID | None = None,
    p: PaginationParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    org_id = current_user["org_id"]
    base = select(SaleReceipt).where(SaleReceipt.organization_id == org_id)
    if status:
        base = base.where(SaleReceipt.status == status)
    if contact_id:
        base = base.where(SaleReceipt.contact_id == contact_id)
    if p.search:
        like = f"%{p.search}%"
        contact_match = select(Contact.id).where(
            Contact.organization_id == org_id, Contact.name.ilike(like)
        )
        base = base.where(or_(
            SaleReceipt.receipt_number.ilike(like),
            SaleReceipt.contact_id.in_(contact_match),
        ))
    if p.date_from:
        base = base.where(SaleReceipt.receipt_date >= p.date_from)
    if p.date_to:
        base = base.where(SaleReceipt.receipt_date <= p.date_to)

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    query = apply_sort(base, SaleReceipt, p, "receipt_date").offset(p.offset).limit(p.limit)
    items = (await db.execute(query)).scalars().all()
    items = [SaleReceiptResponse.model_validate(i) for i in items]
    return paginated_result(items, total, p)


@router.post("", response_model=SaleReceiptResponse, status_code=201)
async def create_sale_receipt(
    payload: SaleReceiptCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
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

    # GL via shared service (org defaults -> hardcoded fallback, one balanced txn)
    receipt.exchange_rate = await document_rate(db, current_user["org_id"], receipt.currency, payload.receipt_date)
    await post_sale_receipt_gl(
        db, current_user["org_id"],
        receipt_date=payload.receipt_date,
        number=receipt_number,
        receipt_id=receipt.id,
        subtotal=float(subtotal),
        tax_amount=float(tax_amount),
        total=float(total),
        rate=float(receipt.exchange_rate),
    )

    # Perpetual inventory: cash sales issue stock + post COGS like invoices
    issued = await issue_for_document_lines(
        db, current_user["org_id"], receipt.line_items or [], "sale_receipt", receipt.id, payload.receipt_date,
    )
    if issued:
        await post_inventory_gl(
            db, current_user["org_id"], date=payload.receipt_date, number=receipt_number,
            source="sale_receipt", source_id=receipt.id, issued=issued, direction="out",
        )

    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "create", "sale_receipt", receipt.id)
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
    current_user: dict = Depends(require_write()),
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
    await log_audit(db, current_user["org_id"], current_user["sub"], "update", "sale_receipt", receipt_id)
    await db.refresh(receipt)
    return receipt


@router.delete("/{receipt_id}", status_code=204)
async def delete_sale_receipt(
    receipt_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
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
    if receipt.status not in ("draft", "void"):
        raise HTTPException(status_code=409, detail="Only draft or voided receipts can be deleted. Void the receipt first.")
    await revert_gl(
        db, current_user["org_id"], receipt_id, "sale_receipt",
        receipt.receipt_date,
        f"Deletion: Sale Receipt {receipt.receipt_number}",
        receipt.receipt_number,
    )
    await reverse_moves(db, current_user["org_id"], "sale_receipt", receipt_id, receipt.receipt_date)
    await db.delete(receipt)
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "delete", "sale_receipt", receipt_id)


@router.post("/{receipt_id}/void", response_model=SaleReceiptResponse)
async def void_sale_receipt(
    receipt_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
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
    await reverse_moves(db, current_user["org_id"], "sale_receipt", receipt_id, receipt.receipt_date)
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "void", "sale_receipt", receipt_id)
    await db.refresh(receipt)
    return receipt


@router.get("/{receipt_id}/activity")
async def sale_receipt_activity(receipt_id: UUID, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    org_id = current_user["org_id"]
    result = await db.execute(select(SaleReceipt).where(SaleReceipt.id == receipt_id, SaleReceipt.organization_id == org_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Sale receipt not found")
    events: list[dict] = [{
        "ts": obj.receipt_date.isoformat() if obj.receipt_date else None,
        "type": "issued", "ref": obj.receipt_number, "ref_id": str(obj.id),
        "delta": float(obj.total or 0), "note": "", "status": obj.status,
        "balance": float(obj.total or 0),
    }]
    return {"total": float(obj.total or 0), "events": events}
