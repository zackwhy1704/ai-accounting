from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func, or_
from sqlalchemy.orm import selectinload
from uuid import UUID

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import require_write
from app.core.pagination import PaginationParams, paginated_result, apply_sort
from app.core.audit import log_audit
from app.models.models import PurchaseDebitNote, PurchaseDebitNoteLineItem, Contact
from app.schemas.schemas import (
    PurchaseDebitNoteCreate, PurchaseDebitNoteUpdate, PurchaseDebitNoteResponse,
)
from app.core.sequences import next_sequence_number
from app.core.line_items import calculate_line_items
from .gl_helpers import post_gl
from app.services.gl_posting import post_purchase_debit_note_gl
from app.services.pricing import line_after_discount as _net
from app.services.fx import document_rate

router = APIRouter(prefix="/purchase-debit-notes", tags=["purchase-debit-notes"])


@router.get("")
async def list_purchase_debit_notes(
    status: str | None = None,
    contact_id: UUID | None = None,
    p: PaginationParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    org_id = current_user["org_id"]
    base = select(PurchaseDebitNote).where(PurchaseDebitNote.organization_id == org_id)
    if status:
        base = base.where(PurchaseDebitNote.status == status)
    if contact_id:
        base = base.where(PurchaseDebitNote.contact_id == contact_id)
    if p.search:
        like = f"%{p.search}%"
        contact_match = select(Contact.id).where(
            Contact.organization_id == org_id, Contact.name.ilike(like)
        )
        base = base.where(or_(
            PurchaseDebitNote.debit_note_number.ilike(like),
            PurchaseDebitNote.contact_id.in_(contact_match),
        ))
    if p.date_from:
        base = base.where(PurchaseDebitNote.issue_date >= p.date_from)
    if p.date_to:
        base = base.where(PurchaseDebitNote.issue_date <= p.date_to)

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    query = apply_sort(base, PurchaseDebitNote, p).options(selectinload(PurchaseDebitNote.line_items)).offset(p.offset).limit(p.limit)
    items = (await db.execute(query)).scalars().all()
    items = [PurchaseDebitNoteResponse.model_validate(i) for i in items]
    return paginated_result(items, total, p)


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
    current_user: dict = Depends(require_write()),
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

    _line_dicts = [{"quantity": getattr(i, "quantity", 1), "unit_price": getattr(i, "unit_price", 0), "discount": getattr(i, "discount", 0) or 0, "discount_mode": getattr(i, "discount_mode", "percent") or "percent", "tax_rate": getattr(i, "tax_rate", 0) or 0} for i in data.line_items]
    subtotal, tax_amount, discount_total, _ = calculate_line_items(_line_dicts)

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
        total=subtotal + tax_amount,
        currency=data.currency,
        notes=data.notes,
    )
    db.add(obj)
    await db.flush()

    for i, item in enumerate(data.line_items):
        disc_mode = getattr(item, 'discount_mode', 'percent') or 'percent'
        line_total = item.quantity * item.unit_price
        disc_val = min(item.discount, line_total) if disc_mode == 'amount' else line_total * item.discount / 100
        db.add(PurchaseDebitNoteLineItem(
            debit_note_id=obj.id,
            description=item.description,
            quantity=item.quantity,
            unit_price=item.unit_price,
            tax_rate=item.tax_rate,
            tax_code_id=item.tax_code_id,
            discount=item.discount,
            discount_mode=disc_mode,
            amount=line_total - disc_val,
            account_id=item.account_id,
            sort_order=i,
        ))

    # GL via shared service (org defaults -> hardcoded fallback, one balanced txn)
    obj.exchange_rate = await document_rate(db, org_id, obj.currency, data.issue_date)
    await post_purchase_debit_note_gl(
        db, org_id,
        issue_date=data.issue_date,
        number=obj.debit_note_number,
        pdn_id=obj.id,
        subtotal=float(subtotal),
        tax_amount=float(tax_amount),
        total=float(subtotal + tax_amount),
        rate=float(obj.exchange_rate),
        lines=[(li.account_id, _net(li.quantity, li.unit_price, li.discount, getattr(li, "discount_mode", "percent") or "percent")) for li in data.line_items],
    )

    await db.commit()
    await log_audit(db, org_id, current_user["sub"], "create", "purchase_debit_note", obj.id)
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
    current_user: dict = Depends(require_write()),
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
        subtotal, tax_amount, discount_total, total = calculate_line_items(line_items_data)
        for i, item in enumerate(line_items_data):
            db.add(PurchaseDebitNoteLineItem(
                debit_note_id=obj.id,
                description=item.get("description", ""),
                quantity=item.get("quantity", 1),
                unit_price=item.get("unit_price", 0),
                tax_rate=item.get("tax_rate", 0),
                tax_code_id=item.get("tax_code_id"),
                discount=item.get("discount", 0),
                discount_mode=item.get("discount_mode", "percent"),
                amount=item.get("amount", 0),
                account_id=item.get("account_id"),
                sort_order=i,
            ))
        obj.subtotal = subtotal
        obj.discount_amount = discount_total
        obj.tax_amount = tax_amount
        obj.total = total

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
    await log_audit(db, current_user["org_id"], current_user["sub"], "update", "purchase_debit_note", dn_id)
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
    current_user: dict = Depends(require_write()),
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
    await log_audit(db, current_user["org_id"], current_user["sub"], "status_change", "purchase_debit_note", dn_id, {"status": status})
    return {"id": str(obj.id), "status": obj.status}


@router.delete("/{dn_id}", status_code=204)
async def delete_purchase_debit_note(
    dn_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
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
        raise HTTPException(status_code=400, detail="This debit note has a payment applied. Void the payment first, then void the debit note before deleting.")
    if obj.status not in ("draft", "void", "issued"):
        raise HTTPException(status_code=400, detail="Only draft, issued, or void debit notes can be deleted.")
    await db.delete(obj)
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "delete", "purchase_debit_note", dn_id)


@router.get("/{dn_id}/activity")
async def purchase_debit_note_activity(dn_id: UUID, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    org_id = current_user["org_id"]
    result = await db.execute(select(PurchaseDebitNote).where(PurchaseDebitNote.id == dn_id, PurchaseDebitNote.organization_id == org_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Purchase debit note not found")
    events: list[dict] = [{
        "ts": obj.issue_date.isoformat() if obj.issue_date else None,
        "type": "issued", "ref": obj.debit_note_number, "ref_id": str(obj.id),
        "delta": float(obj.total or 0), "note": obj.notes or "", "status": obj.status,
        "balance": float(obj.total or 0),
    }]
    return {"total": float(obj.total or 0), "events": events}
