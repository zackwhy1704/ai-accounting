from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, delete as sa_delete
from sqlalchemy.orm import selectinload
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.pagination import PaginationParams, paginated_result, apply_sort
from app.models.models import PurchaseCreditNote, PurchaseCreditNoteLineItem, PurchaseCreditApplication, Bill, Contact
from app.schemas.schemas import (
    PurchaseCreditNoteCreate, PurchaseCreditNoteResponse,
    PurchaseCreditNoteLineItem as PCNLineItemSchema,
)
from .gl_helpers import post_gl, revert_gl

router = APIRouter(prefix="/purchase-credit-notes", tags=["purchase-credit-notes"])


class PurchaseCreditNoteUpdate(BaseModel):
    contact_id: Optional[UUID] = None
    pcn_number: Optional[str] = None
    bill_id: Optional[UUID] = None
    issue_date: Optional[datetime] = None
    reference: Optional[str] = None
    currency: Optional[str] = None
    notes: Optional[str] = None
    line_items: Optional[list[PCNLineItemSchema]] = None


async def _next_pcn_number(org_id: UUID, db: AsyncSession) -> str:
    result = await db.execute(
        select(func.count(PurchaseCreditNote.id)).where(PurchaseCreditNote.organization_id == org_id)
    )
    count = result.scalar_one() + 1
    return f"PCN-{count:05d}"


def _line_discount(item: PCNLineItemSchema) -> float:
    line_total = item.quantity * item.unit_price
    if item.discount_mode == "amount":
        return min(item.discount, line_total)
    return line_total * item.discount / 100


def _calc_totals(line_items: list[PCNLineItemSchema]) -> tuple[float, float, float, float]:
    subtotal = sum(item.quantity * item.unit_price for item in line_items)
    total_discount = sum(_line_discount(item) for item in line_items)
    tax_amount = sum((item.quantity * item.unit_price - _line_discount(item)) * item.tax_rate / 100 for item in line_items)
    total = subtotal - total_discount + tax_amount
    return subtotal, total_discount, tax_amount, total


def _build_line_items(pcn_id: UUID, line_items: list[PCNLineItemSchema]) -> list[PurchaseCreditNoteLineItem]:
    rows = []
    for i, item in enumerate(line_items):
        disc = _line_discount(item)
        after_disc = item.quantity * item.unit_price - disc
        amount = after_disc * (1 + item.tax_rate / 100)
        rows.append(PurchaseCreditNoteLineItem(
            credit_note_id=pcn_id,
            line_type=item.line_type,
            description=item.description,
            quantity=item.quantity,
            unit_price=item.unit_price,
            discount=item.discount,
            discount_mode=item.discount_mode,
            tax_rate=item.tax_rate,
            tax_code_id=UUID(item.tax_code_id) if item.tax_code_id else None,
            amount=round(amount, 2),
            account_id=UUID(item.account_id) if item.account_id else None,
            sort_order=i,
        ))
    return rows


def _with_pcn(q):
    return q.options(
        selectinload(PurchaseCreditNote.line_items),
        selectinload(PurchaseCreditNote.credit_applications),
    )


async def _recalc_bill_status(bill: Bill) -> None:
    bill_total = float(bill.total or 0)
    if float(bill.amount_paid or 0) >= bill_total:
        bill.status = "paid"
    elif float(bill.amount_paid or 0) > 0:
        bill.status = "partially paid"
    else:
        bill.status = "outstanding"


@router.get("")
async def list_purchase_credit_notes(
    status: str | None = None,
    contact_id: UUID | None = None,
    p: PaginationParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    org_id = current_user["org_id"]
    base = select(PurchaseCreditNote).where(PurchaseCreditNote.organization_id == org_id)
    if status:
        base = base.where(PurchaseCreditNote.status == status)
    if contact_id:
        base = base.where(PurchaseCreditNote.contact_id == contact_id)
    if p.search:
        like = f"%{p.search}%"
        contact_match = select(Contact.id).where(
            Contact.organization_id == org_id, Contact.name.ilike(like)
        )
        base = base.where(or_(
            PurchaseCreditNote.pcn_number.ilike(like),
            PurchaseCreditNote.contact_id.in_(contact_match),
        ))
    if p.date_from:
        base = base.where(PurchaseCreditNote.issue_date >= p.date_from)
    if p.date_to:
        base = base.where(PurchaseCreditNote.issue_date <= p.date_to)

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    query = _with_pcn(apply_sort(base, PurchaseCreditNote, p)).offset(p.offset).limit(p.limit)
    items = (await db.execute(query)).scalars().all()
    items = [PurchaseCreditNoteResponse.model_validate(i) for i in items]
    return paginated_result(items, total, p)


@router.post("", response_model=PurchaseCreditNoteResponse, status_code=201)
async def create_purchase_credit_note(
    payload: PurchaseCreditNoteCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    org_id = current_user["org_id"]
    subtotal, discount_amount, tax_amount, total = _calc_totals(payload.line_items)

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
        reference=payload.reference,
        currency=payload.currency,
        notes=payload.notes,
        subtotal=subtotal,
        discount_amount=discount_amount,
        tax_amount=tax_amount,
        total=total,
        status="draft",
        credit_applied=0,
    )
    db.add(pcn)
    await db.flush()

    for li in _build_line_items(pcn.id, payload.line_items):
        db.add(li)

    # Process credit_applications if provided at create time
    credit_applied = 0.0
    for app in payload.credit_applications:
        db.add(PurchaseCreditApplication(credit_note_id=pcn.id, bill_id=app.bill_id, amount=app.amount))
        credit_applied += app.amount
        bill_result = await db.execute(select(Bill).where(Bill.id == app.bill_id))
        bill = bill_result.scalar_one_or_none()
        if bill:
            bill.amount_paid = float(bill.amount_paid or 0) + app.amount
            await _recalc_bill_status(bill)

    if credit_applied > 0:
        pcn.credit_applied = credit_applied
        pcn.status = "applied" if credit_applied >= total else "issued"

    await post_gl(
        db, org_id, payload.issue_date,
        f"Purchase Credit Note {pcn_number}",
        pcn_number, "purchase_credit_note", pcn.id,
        [("2000", total, 0), ("2200", 0, total)],
    )

    await db.commit()
    result = await db.execute(_with_pcn(select(PurchaseCreditNote).where(PurchaseCreditNote.id == pcn.id)))
    return result.scalar_one()


@router.get("/{pcn_id}", response_model=PurchaseCreditNoteResponse)
async def get_purchase_credit_note(
    pcn_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        _with_pcn(select(PurchaseCreditNote).where(
            PurchaseCreditNote.id == pcn_id,
            PurchaseCreditNote.organization_id == current_user["org_id"],
        ))
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
        _with_pcn(select(PurchaseCreditNote).where(
            PurchaseCreditNote.id == pcn_id,
            PurchaseCreditNote.organization_id == current_user["org_id"],
        ))
    )
    pcn = result.scalar_one_or_none()
    if not pcn:
        raise HTTPException(status_code=404, detail="Purchase credit note not found")
    if pcn.status == "void":
        raise HTTPException(status_code=400, detail="Already voided")
    if status == "void":
        if pcn.credit_applications:
            raise HTTPException(status_code=400, detail="Applied credit notes cannot be voided directly. Remove the application first.")
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
        _with_pcn(select(PurchaseCreditNote).where(
            PurchaseCreditNote.id == pcn_id,
            PurchaseCreditNote.organization_id == current_user["org_id"],
        ))
    )
    pcn = result.scalar_one_or_none()
    if not pcn:
        raise HTTPException(status_code=404, detail="Purchase credit note not found")
    if pcn.status == "void":
        raise HTTPException(status_code=400, detail="Cannot edit a voided purchase credit note")

    update_data = data.model_dump(exclude_unset=True)

    if "pcn_number" in update_data and update_data["pcn_number"]:
        existing = (await db.execute(select(PurchaseCreditNote.id).where(
            PurchaseCreditNote.organization_id == current_user["org_id"],
            PurchaseCreditNote.pcn_number == update_data["pcn_number"],
            PurchaseCreditNote.id != pcn.id
        ))).first()
        if existing:
            raise HTTPException(status_code=400, detail="PCN number already in use")

    if "line_items" in update_data and data.line_items is not None:
        update_data.pop("line_items")
        subtotal, discount_amount, tax_amount, total = _calc_totals(data.line_items)
        await db.execute(sa_delete(PurchaseCreditNoteLineItem).where(PurchaseCreditNoteLineItem.credit_note_id == pcn.id))
        for li in _build_line_items(pcn.id, data.line_items):
            db.add(li)
        pcn.subtotal = subtotal
        pcn.discount_amount = discount_amount
        pcn.tax_amount = tax_amount
        pcn.total = total

    for key, value in update_data.items():
        setattr(pcn, key, value)

    await db.commit()
    result2 = await db.execute(_with_pcn(select(PurchaseCreditNote).where(PurchaseCreditNote.id == pcn.id)))
    return result2.scalar_one()


@router.post("/{pcn_id}/applications", response_model=PurchaseCreditNoteResponse)
async def apply_purchase_credit_note(
    pcn_id: UUID,
    bill_id: UUID,
    amount: float,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Apply part or all of a PCN's credit to a bill."""
    result = await db.execute(
        _with_pcn(select(PurchaseCreditNote).where(
            PurchaseCreditNote.id == pcn_id,
            PurchaseCreditNote.organization_id == current_user["org_id"],
        ))
    )
    pcn = result.scalar_one_or_none()
    if not pcn:
        raise HTTPException(status_code=404, detail="Purchase credit note not found")
    if pcn.status == "void":
        raise HTTPException(status_code=400, detail="Cannot apply a voided credit note")
    if pcn.status == "draft":
        raise HTTPException(status_code=400, detail="Credit note must be issued before applying")

    remaining = float(pcn.total) - float(pcn.credit_applied or 0)
    if amount > remaining + 0.001:
        raise HTTPException(status_code=400, detail=f"Amount {amount} exceeds remaining credit {remaining:.2f}")

    bill_result = await db.execute(
        select(Bill).where(Bill.id == bill_id, Bill.organization_id == current_user["org_id"])
    )
    bill = bill_result.scalar_one_or_none()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")

    db.add(PurchaseCreditApplication(credit_note_id=pcn_id, bill_id=bill_id, amount=amount))
    bill.amount_paid = float(bill.amount_paid or 0) + amount
    await _recalc_bill_status(bill)

    pcn.credit_applied = float(pcn.credit_applied or 0) + amount
    if float(pcn.credit_applied) >= float(pcn.total):
        pcn.status = "applied"
    else:
        pcn.status = "issued"

    await db.commit()
    result2 = await db.execute(_with_pcn(select(PurchaseCreditNote).where(PurchaseCreditNote.id == pcn.id)))
    return result2.scalar_one()


@router.delete("/{pcn_id}/applications", status_code=204)
async def remove_all_applications(
    pcn_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Remove all bill applications from a PCN and restore bill balances."""
    result = await db.execute(
        _with_pcn(select(PurchaseCreditNote).where(
            PurchaseCreditNote.id == pcn_id,
            PurchaseCreditNote.organization_id == current_user["org_id"],
        ))
    )
    pcn = result.scalar_one_or_none()
    if not pcn:
        raise HTTPException(status_code=404, detail="Purchase credit note not found")

    for app in pcn.credit_applications:
        bill_result = await db.execute(select(Bill).where(Bill.id == app.bill_id))
        bill = bill_result.scalar_one_or_none()
        if bill:
            bill.amount_paid = max(0.0, float(bill.amount_paid or 0) - float(app.amount))
            await _recalc_bill_status(bill)

    await db.execute(sa_delete(PurchaseCreditApplication).where(PurchaseCreditApplication.credit_note_id == pcn_id))
    pcn.credit_applied = 0
    pcn.status = "issued"
    await db.commit()


@router.delete("/{pcn_id}/applications/{app_id}", status_code=204)
async def remove_single_application(
    pcn_id: UUID,
    app_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Remove a single bill application from a PCN."""
    result = await db.execute(
        select(PurchaseCreditNote).where(
            PurchaseCreditNote.id == pcn_id,
            PurchaseCreditNote.organization_id == current_user["org_id"],
        )
    )
    pcn = result.scalar_one_or_none()
    if not pcn:
        raise HTTPException(status_code=404, detail="Purchase credit note not found")

    app_result = await db.execute(
        select(PurchaseCreditApplication).where(
            PurchaseCreditApplication.id == app_id,
            PurchaseCreditApplication.credit_note_id == pcn_id,
        )
    )
    app = app_result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    bill_result = await db.execute(select(Bill).where(Bill.id == app.bill_id))
    bill = bill_result.scalar_one_or_none()
    if bill:
        bill.amount_paid = max(0.0, float(bill.amount_paid or 0) - float(app.amount))
        await _recalc_bill_status(bill)

    pcn.credit_applied = max(0.0, float(pcn.credit_applied or 0) - float(app.amount))
    pcn.status = "issued" if float(pcn.credit_applied) > 0 else "issued"

    await db.delete(app)
    await db.commit()


@router.delete("/{pcn_id}", status_code=204)
async def delete_purchase_credit_note(
    pcn_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        _with_pcn(select(PurchaseCreditNote).where(
            PurchaseCreditNote.id == pcn_id,
            PurchaseCreditNote.organization_id == current_user["org_id"],
        ))
    )
    pcn = result.scalar_one_or_none()
    if not pcn:
        raise HTTPException(status_code=404, detail="Purchase credit note not found")
    if pcn.status not in ("draft", "void"):
        raise HTTPException(status_code=400, detail="Only draft or void purchase credit notes can be deleted. Void it first.")
    if pcn.credit_applications:
        raise HTTPException(status_code=400, detail="Remove all bill applications before deleting.")
    await db.delete(pcn)
    await db.commit()
