from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload
from uuid import UUID

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import PurchaseDebitNote, PurchaseDebitNoteLineItem
from app.schemas.schemas import (
    PurchaseDebitNoteCreate, PurchaseDebitNoteUpdate, PurchaseDebitNoteResponse,
)
from .sales import next_sequence_number, calc_totals
from .gl_helpers import post_gl

router = APIRouter(prefix="/purchase-debit-notes", tags=["purchase-debit-notes"])


@router.get("", response_model=list[PurchaseDebitNoteResponse])
async def list_purchase_debit_notes(
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    org_id = current_user["org_id"]
    q = (
        select(PurchaseDebitNote)
        .options(selectinload(PurchaseDebitNote.line_items))
        .where(PurchaseDebitNote.organization_id == org_id)
        .order_by(PurchaseDebitNote.created_at.desc())
    )
    if status:
        q = q.where(PurchaseDebitNote.status == status)
    return (await db.execute(q)).scalars().all()


@router.get("/{dn_id}", response_model=PurchaseDebitNoteResponse)
async def get_purchase_debit_note(
    dn_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(PurchaseDebitNote)
        .options(selectinload(PurchaseDebitNote.line_items))
        .where(PurchaseDebitNote.id == dn_id, PurchaseDebitNote.organization_id == current_user["org_id"])
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Purchase debit note not found")
    return obj


@router.post("", response_model=PurchaseDebitNoteResponse, status_code=201)
async def create_purchase_debit_note(
    data: PurchaseDebitNoteCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    org_id = current_user["org_id"]
    if data.debit_note_number:
        existing = (await db.execute(
            select(PurchaseDebitNote.id).where(
                PurchaseDebitNote.organization_id == org_id,
                PurchaseDebitNote.debit_note_number == data.debit_note_number,
            )
        )).first()
        if existing:
            raise HTTPException(status_code=400, detail="Debit note number already in use")
        dn_number = data.debit_note_number
    else:
        dn_number = await next_sequence_number(
            db, PurchaseDebitNote, PurchaseDebitNote.debit_note_number, org_id, "PDN"
        )

    subtotal, discount_total, tax_amount = calc_totals(data.line_items)

    obj = PurchaseDebitNote(
        organization_id=org_id,
        contact_id=data.contact_id,
        bill_id=data.bill_id,
        debit_note_number=dn_number,
        issue_date=data.issue_date,
        reference=data.reference,
        subtotal=subtotal,
        discount_amount=discount_total,
        tax_amount=tax_amount,
        total=subtotal - discount_total + tax_amount,
        currency=data.currency,
        notes=data.notes,
    )
    db.add(obj)
    await db.flush()

    for i, item in enumerate(data.line_items):
        db.add(PurchaseDebitNoteLineItem(
            debit_note_id=obj.id,
            description=item.description,
            quantity=item.quantity,
            unit_price=item.unit_price,
            tax_rate=item.tax_rate,
            tax_code_id=item.tax_code_id,
            discount=item.discount,
            amount=item.quantity * item.unit_price,
            account_id=item.account_id,
            sort_order=i,
        ))

    # GL: Dr AP / Cr Expense reversal (buyer issues debit note to reduce payable)
    dn_total = float(subtotal - discount_total + tax_amount)
    dn_subtotal = float(subtotal - discount_total)
    entries = [
        ("2000", dn_total, 0),       # Dr AP (reduces payable)
        ("5000", 0, dn_subtotal),    # Cr Expense
    ]
    if tax_amount > 0:
        entries.append(("1150", float(tax_amount), 0))  # Dr GST Receivable reversal
    await post_gl(
        db, org_id, data.issue_date,
        f"Purchase Debit Note {obj.debit_note_number}",
        obj.debit_note_number, "purchase_debit_note", obj.id, entries,
    )

    await db.commit()
    result2 = await db.execute(
        select(PurchaseDebitNote)
        .options(selectinload(PurchaseDebitNote.line_items))
        .where(PurchaseDebitNote.id == obj.id)
    )
    return result2.scalar_one()


@router.patch("/{dn_id}", response_model=PurchaseDebitNoteResponse)
async def update_purchase_debit_note(
    dn_id: UUID,
    data: PurchaseDebitNoteUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(PurchaseDebitNote)
        .options(selectinload(PurchaseDebitNote.line_items))
        .where(PurchaseDebitNote.id == dn_id, PurchaseDebitNote.organization_id == current_user["org_id"])
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Purchase debit note not found")
    if obj.status not in ("draft",):
        raise HTTPException(status_code=400, detail="Only draft debit notes can be edited")

    update_data = data.model_dump(exclude_unset=True)

    if "line_items" in update_data:
        line_items_data = update_data.pop("line_items")
        await db.execute(delete(PurchaseDebitNoteLineItem).where(PurchaseDebitNoteLineItem.debit_note_id == obj.id))
        await db.flush()
        subtotal = sum(li["quantity"] * li["unit_price"] for li in line_items_data)
        discount_total = sum(li.get("discount", 0) or 0 for li in line_items_data)
        tax_amount = sum(
            (li["quantity"] * li["unit_price"] - (li.get("discount", 0) or 0)) * (li["tax_rate"] / 100)
            for li in line_items_data
        )
        for i, item in enumerate(line_items_data):
            db.add(PurchaseDebitNoteLineItem(
                debit_note_id=obj.id,
                description=item["description"],
                quantity=item["quantity"],
                unit_price=item["unit_price"],
                tax_rate=item["tax_rate"],
                tax_code_id=item.get("tax_code_id"),
                discount=item.get("discount", 0),
                amount=item["quantity"] * item["unit_price"],
                account_id=item.get("account_id"),
                sort_order=i,
            ))
        obj.subtotal = subtotal
        obj.discount_amount = discount_total
        obj.tax_amount = tax_amount
        obj.total = subtotal - discount_total + tax_amount

    new_num = update_data.get("debit_note_number")
    if new_num and new_num != obj.debit_note_number:
        existing = (await db.execute(
            select(PurchaseDebitNote.id).where(
                PurchaseDebitNote.organization_id == obj.organization_id,
                PurchaseDebitNote.debit_note_number == new_num,
                PurchaseDebitNote.id != obj.id,
            )
        )).first()
        if existing:
            raise HTTPException(status_code=400, detail="Debit note number already in use")

    for key, value in update_data.items():
        setattr(obj, key, value)

    await db.commit()
    result2 = await db.execute(
        select(PurchaseDebitNote)
        .options(selectinload(PurchaseDebitNote.line_items))
        .where(PurchaseDebitNote.id == obj.id)
    )
    return result2.scalar_one()


@router.patch("/{dn_id}/status")
async def update_purchase_debit_note_status(
    dn_id: UUID,
    status: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    valid = {"draft", "issued", "applied", "void"}
    if status not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid)}")
    result = await db.execute(
        select(PurchaseDebitNote).where(
            PurchaseDebitNote.id == dn_id, PurchaseDebitNote.organization_id == current_user["org_id"]
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Purchase debit note not found")
    obj.status = status
    await db.commit()
    return {"id": str(obj.id), "status": obj.status}


@router.delete("/{dn_id}", status_code=204)
async def delete_purchase_debit_note(
    dn_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(PurchaseDebitNote).where(
            PurchaseDebitNote.id == dn_id, PurchaseDebitNote.organization_id == current_user["org_id"]
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Purchase debit note not found")
    if obj.status == "applied":
        raise HTTPException(status_code=400, detail="Cannot delete an applied debit note")
    await db.delete(obj)
    await db.commit()
