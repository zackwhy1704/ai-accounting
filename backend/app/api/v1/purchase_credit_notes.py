from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from uuid import UUID

from datetime import datetime
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import PurchaseCreditNote
from app.schemas.schemas import PurchaseCreditNoteCreate, PurchaseCreditNoteResponse, PurchaseCreditNoteLineItem
from .gl_helpers import post_gl, revert_gl

router = APIRouter(prefix="/purchase-credit-notes", tags=["purchase-credit-notes"])


class PurchaseCreditNoteUpdate(BaseModel):
    contact_id: Optional[UUID] = None
    pcn_number: Optional[str] = None
    bill_id: Optional[UUID] = None
    issue_date: Optional[datetime] = None
    currency: Optional[str] = None
    notes: Optional[str] = None
    line_items: Optional[list[PurchaseCreditNoteLineItem]] = None


async def _next_pcn_number(org_id: UUID, db: AsyncSession) -> str:
    result = await db.execute(
        select(func.count(PurchaseCreditNote.id)).where(PurchaseCreditNote.organization_id == org_id)
    )
    count = result.scalar_one() + 1
    return f"PCN-{count:05d}"


def _line_discount(item) -> float:
    line_total = item.quantity * item.unit_price
    if item.discount_mode == "amount":
        return min(item.discount, line_total)
    return line_total * item.discount / 100


def _calc_totals(line_items: list) -> tuple[float, float, float]:
    subtotal = sum(item.quantity * item.unit_price for item in line_items)
    total_discount = sum(_line_discount(item) for item in line_items)
    tax_amount = sum((item.quantity * item.unit_price - _line_discount(item)) * item.tax_rate / 100 for item in line_items)
    return subtotal, tax_amount, subtotal - total_discount + tax_amount


@router.get("", response_model=list[PurchaseCreditNoteResponse])
async def list_purchase_credit_notes(
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    q = select(PurchaseCreditNote).where(PurchaseCreditNote.organization_id == current_user["org_id"])
    if status:
        q = q.where(PurchaseCreditNote.status == status)
    q = q.order_by(PurchaseCreditNote.issue_date.desc())
    result = await db.execute(q)
    return result.scalars().all()


@router.post("", response_model=PurchaseCreditNoteResponse, status_code=201)
async def create_purchase_credit_note(
    payload: PurchaseCreditNoteCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    subtotal, tax_amount, total = _calc_totals(payload.line_items)
    org_id = current_user["org_id"]
    if payload.pcn_number:
        existing = (await db.execute(select(PurchaseCreditNote.id).where(
            PurchaseCreditNote.organization_id == org_id,
            PurchaseCreditNote.pcn_number == payload.pcn_number
        ))).first()
        if existing:
            raise HTTPException(status_code=400, detail="PCN number already in use")
        pcn_number = payload.pcn_number
    else:
        pcn_number = await _next_pcn_number(org_id, db)
    pcn = PurchaseCreditNote(
        organization_id=org_id,
        pcn_number=pcn_number,
        contact_id=payload.contact_id,
        bill_id=payload.bill_id,
        issue_date=payload.issue_date,
        currency=payload.currency,
        notes=payload.notes,
        line_items=[item.model_dump() for item in payload.line_items],
        subtotal=subtotal,
        tax_amount=tax_amount,
        total=total,
        status="draft",
    )
    db.add(pcn)
    await db.flush()

    # GL: Dr AP (2000) / Cr Purchase Credit Note Liability (2200)
    await post_gl(
        db, org_id, payload.issue_date,
        f"Purchase Credit Note {pcn_number}",
        pcn_number, "purchase_credit_note", pcn.id,
        [("2000", total, 0), ("2200", 0, total)],
    )

    await db.commit()
    await db.refresh(pcn)
    return pcn


@router.get("/{pcn_id}", response_model=PurchaseCreditNoteResponse)
async def get_purchase_credit_note(
    pcn_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(PurchaseCreditNote).where(
            PurchaseCreditNote.id == pcn_id,
            PurchaseCreditNote.organization_id == current_user["org_id"],
        )
    )
    pcn = result.scalar_one_or_none()
    if not pcn:
        raise HTTPException(status_code=404, detail="Purchase credit note not found")
    return pcn


@router.patch("/{pcn_id}/status")
async def update_purchase_credit_note_status(
    pcn_id: UUID,
    status: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    valid = {"draft", "issued", "applied", "void"}
    if status not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid}")
    result = await db.execute(
        select(PurchaseCreditNote).where(
            PurchaseCreditNote.id == pcn_id,
            PurchaseCreditNote.organization_id == current_user["org_id"],
        )
    )
    pcn = result.scalar_one_or_none()
    if not pcn:
        raise HTTPException(status_code=404, detail="Purchase credit note not found")
    if pcn.status == "void":
        raise HTTPException(status_code=400, detail="Already voided")
    if status == "void" and pcn.status == "applied":
        raise HTTPException(status_code=400, detail="Applied credit notes cannot be voided directly. Remove the application first.")
    if status == "void":
        await revert_gl(
            db, current_user["org_id"], pcn_id, "purchase_credit_note",
            pcn.issue_date,
            f"Reversal: Purchase Credit Note {pcn.pcn_number} voided",
            pcn.pcn_number,
        )
    pcn.status = status
    await db.commit()
    return {"id": str(pcn_id), "status": status}


@router.patch("/{pcn_id}", response_model=PurchaseCreditNoteResponse)
async def update_purchase_credit_note(
    pcn_id: UUID,
    data: PurchaseCreditNoteUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(PurchaseCreditNote).where(
            PurchaseCreditNote.id == pcn_id,
            PurchaseCreditNote.organization_id == current_user["org_id"],
        )
    )
    pcn = result.scalar_one_or_none()
    if not pcn:
        raise HTTPException(status_code=404, detail="Purchase credit note not found")
    if pcn.status in ("void", "applied"):
        raise HTTPException(status_code=400, detail=f"Cannot edit a {pcn.status} purchase credit note")

    update_data = data.model_dump(exclude_unset=True)

    if "pcn_number" in update_data and update_data["pcn_number"]:
        existing = (await db.execute(select(PurchaseCreditNote.id).where(
            PurchaseCreditNote.organization_id == current_user["org_id"],
            PurchaseCreditNote.pcn_number == update_data["pcn_number"],
            PurchaseCreditNote.id != pcn.id
        ))).first()
        if existing:
            raise HTTPException(status_code=400, detail="PCN number already in use")

    if "line_items" in update_data:
        update_data.pop("line_items")
        subtotal, tax_amount, total = _calc_totals(data.line_items)
        pcn.line_items = [item.model_dump() for item in data.line_items]
        pcn.subtotal = subtotal
        pcn.tax_amount = tax_amount
        pcn.total = total

    for key, value in update_data.items():
        setattr(pcn, key, value)

    await db.commit()
    await db.refresh(pcn)
    return pcn


@router.delete("/{pcn_id}", status_code=204)
async def delete_purchase_credit_note(
    pcn_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(PurchaseCreditNote).where(
            PurchaseCreditNote.id == pcn_id,
            PurchaseCreditNote.organization_id == current_user["org_id"],
        )
    )
    pcn = result.scalar_one_or_none()
    if not pcn:
        raise HTTPException(status_code=404, detail="Purchase credit note not found")
    if pcn.status == "applied":
        raise HTTPException(status_code=400, detail="Cannot delete an applied purchase credit note")
    await db.delete(pcn)
    await db.commit()
