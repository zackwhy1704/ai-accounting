from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload
from uuid import UUID
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import (
    CreditNote, CreditNoteLineItem,
    CreditApplication as CreditApplicationModel,
    Invoice,
)
from .gl_helpers import post_gl, revert_gl
from app.schemas.schemas import (
    CreditNoteCreate, CreditNoteUpdate, CreditNoteResponse,
)
from app.core.sequences import next_sequence_number
from .sales import calc_totals

router = APIRouter(tags=["Sales"])


# ═══════════════════════════════════════════════
# CREDIT NOTES
# ═══════════════════════════════════════════════
@router.get("/credit-notes", response_model=list[CreditNoteResponse])
async def list_credit_notes(status: str | None = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    org_id = current_user["org_id"]
    q = select(CreditNote).options(selectinload(CreditNote.line_items), selectinload(CreditNote.credit_applications)).where(CreditNote.organization_id == org_id).order_by(CreditNote.created_at.desc())
    if status:
        q = q.where(CreditNote.status == status)
    return (await db.execute(q)).scalars().all()


@router.get("/credit-notes/{cn_id}", response_model=CreditNoteResponse)
async def get_credit_note(cn_id: UUID, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CreditNote).options(selectinload(CreditNote.line_items), selectinload(CreditNote.credit_applications))
        .where(CreditNote.id == cn_id, CreditNote.organization_id == current_user["org_id"])
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Credit note not found")
    return obj


@router.post("/credit-notes", response_model=CreditNoteResponse, status_code=201)
async def create_credit_note(data: CreditNoteCreate, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    org_id = current_user["org_id"]
    if data.credit_note_number:
        existing = (await db.execute(select(CreditNote.id).where(CreditNote.organization_id == org_id, CreditNote.credit_note_number == data.credit_note_number))).first()
        if existing:
            raise HTTPException(status_code=400, detail="Credit note number already in use")
        cn_number = data.credit_note_number
    else:
        cn_number = await next_sequence_number(db, CreditNote, CreditNote.credit_note_number, org_id, "CN")
    subtotal, discount_total, tax_amount = calc_totals(data.line_items)
    total = subtotal - discount_total + tax_amount

    obj = CreditNote(
        organization_id=org_id, contact_id=data.contact_id, invoice_id=data.invoice_id,
        credit_note_number=cn_number, issue_date=data.issue_date,
        reference=data.reference, subtotal=subtotal, discount_amount=discount_total,
        tax_amount=tax_amount, total=total, currency=data.currency, notes=data.notes,
    )
    db.add(obj)
    await db.flush()

    for i, item in enumerate(data.line_items):
        disc_mode = getattr(item, 'discount_mode', 'percent') or 'percent'
        line_total = item.quantity * item.unit_price
        disc_val = min(item.discount, line_total) if disc_mode == 'amount' else line_total * item.discount / 100
        db.add(CreditNoteLineItem(
            credit_note_id=obj.id, description=item.description, quantity=item.quantity,
            unit_price=item.unit_price, tax_rate=item.tax_rate, tax_code_id=item.tax_code_id,
            discount=item.discount, discount_mode=disc_mode,
            line_type=getattr(item, 'line_type', 'goods') or 'goods',
            amount=line_total - disc_val, account_id=item.account_id, sort_order=i,
        ))

    # Process credit_applications if provided at create time
    credit_applied = 0.0
    if data.credit_applications:
        for app in data.credit_applications:
            db.add(CreditApplicationModel(credit_note_id=obj.id, invoice_id=app.invoice_id, amount=app.amount))
            credit_applied += app.amount
            inv_result = await db.execute(select(Invoice).where(Invoice.id == app.invoice_id))
            inv = inv_result.scalar_one_or_none()
            if inv:
                inv.amount_paid = float(inv.amount_paid or 0) + app.amount
                if float(inv.amount_paid) >= float(inv.total):
                    inv.status = "paid"
        obj.credit_applied = credit_applied
        if credit_applied >= float(total):
            obj.status = "applied"
        else:
            obj.status = "issued"
    else:
        # CN starts as draft — user must explicitly issue and apply
        obj.status = "draft"
        obj.credit_applied = 0

    # GL: Dr Revenue / Cr AR (+ Dr GST Payable if tax)
    entries = [
        ("4000", float(subtotal - discount_total), 0),  # Dr Revenue
        ("1100", 0, float(total)),                       # Cr AR
    ]
    if tax_amount > 0:
        entries.append(("2100", float(tax_amount), 0))  # Dr GST Payable
    await post_gl(
        db, org_id, data.issue_date,
        f"Credit Note {obj.credit_note_number}",
        obj.credit_note_number, "credit_note", obj.id, entries,
    )

    await db.commit()
    result2 = await db.execute(
        select(CreditNote).options(selectinload(CreditNote.line_items), selectinload(CreditNote.credit_applications)).where(CreditNote.id == obj.id)
    )
    return result2.scalar_one()


@router.patch("/credit-notes/{cn_id}", response_model=CreditNoteResponse)
async def update_credit_note(cn_id: UUID, data: CreditNoteUpdate, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CreditNote)
        .options(selectinload(CreditNote.line_items), selectinload(CreditNote.credit_applications))
        .where(CreditNote.id == cn_id, CreditNote.organization_id == current_user["org_id"])
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Credit note not found")
    update_data_check = data.model_dump(exclude_unset=True)
    editing_fields = {k for k in update_data_check if k not in ("status", "credit_applications")}
    if obj.status not in ("draft", "issued") and editing_fields:
        raise HTTPException(status_code=400, detail="Only draft or issued credit notes can have their details edited")

    update_data = data.model_dump(exclude_unset=True)

    if "line_items" in update_data:
        line_items_data = update_data.pop("line_items")
        await db.execute(delete(CreditNoteLineItem).where(CreditNoteLineItem.credit_note_id == obj.id))
        subtotal = sum(li["quantity"] * li["unit_price"] for li in line_items_data)
        def _disc(li):
            raw = li.get("discount", 0) or 0
            mode = li.get("discount_mode", "percent") or "percent"
            amount = li["quantity"] * li["unit_price"]
            return min(raw, amount) if mode == "amount" else amount * (raw / 100)
        discount_total = sum(_disc(li) for li in line_items_data)
        tax_amount = sum((li["quantity"] * li["unit_price"] - _disc(li)) * (li["tax_rate"] / 100) for li in line_items_data)
        for i, item in enumerate(line_items_data):
            _disc_mode = item.get("discount_mode", "percent") or "percent"
            _line_total = item["quantity"] * item["unit_price"]
            _disc_val = min(item.get("discount", 0) or 0, _line_total) if _disc_mode == "amount" else _line_total * (item.get("discount", 0) or 0) / 100
            db.add(CreditNoteLineItem(
                credit_note_id=obj.id, description=item["description"], quantity=item["quantity"],
                unit_price=item["unit_price"], tax_rate=item["tax_rate"],
                tax_code_id=item.get("tax_code_id"),
                discount=item.get("discount", 0),
                discount_mode=_disc_mode,
                line_type=item.get("line_type", "goods") or "goods",
                amount=_line_total - _disc_val,
                account_id=item.get("account_id"), sort_order=i,
            ))
        obj.subtotal = subtotal
        obj.discount_amount = discount_total
        obj.tax_amount = tax_amount
        obj.total = subtotal - discount_total + tax_amount

    if "credit_applications" in update_data:
        apps_data = update_data.pop("credit_applications")
        # Revert old credit applications on invoices
        for existing_app in obj.credit_applications:
            inv_result = await db.execute(select(Invoice).where(Invoice.id == existing_app.invoice_id))
            inv = inv_result.scalar_one_or_none()
            if inv:
                inv.amount_paid = float(inv.amount_paid or 0) - existing_app.amount
        await db.execute(delete(CreditApplicationModel).where(CreditApplicationModel.credit_note_id == obj.id))
        credit_applied = 0
        for app in apps_data:
            db.add(CreditApplicationModel(credit_note_id=obj.id, invoice_id=app["invoice_id"], amount=app["amount"]))
            credit_applied += app["amount"]
            inv_result = await db.execute(select(Invoice).where(Invoice.id == app["invoice_id"]))
            inv = inv_result.scalar_one_or_none()
            if inv:
                inv.amount_paid = float(inv.amount_paid or 0) + app["amount"]
        obj.credit_applied = credit_applied
        # Update status based on how much credit has been applied
        if credit_applied <= 0:
            if obj.status in ("applied", "issued"):
                obj.status = "issued"
        elif credit_applied >= float(obj.total or 0):
            obj.status = "applied"
        else:
            obj.status = "issued"

    new_num = update_data.get("credit_note_number")
    if new_num and new_num != obj.credit_note_number:
        existing = (await db.execute(select(CreditNote.id).where(CreditNote.organization_id == obj.organization_id, CreditNote.credit_note_number == new_num, CreditNote.id != obj.id))).first()
        if existing:
            raise HTTPException(status_code=400, detail="Credit note number already in use")

    for key, value in update_data.items():
        setattr(obj, key, value)

    await db.commit()
    result2 = await db.execute(
        select(CreditNote).options(selectinload(CreditNote.line_items), selectinload(CreditNote.credit_applications)).where(CreditNote.id == obj.id)
    )
    return result2.scalar_one()


@router.patch("/credit-notes/{cn_id}/status")
async def update_credit_note_status(cn_id: UUID, status: str, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CreditNote).where(CreditNote.id == cn_id, CreditNote.organization_id == current_user["org_id"]))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Credit note not found")
    valid = {"draft", "issued", "applied", "void"}
    if status not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid)}")
    obj.status = status
    await db.commit()
    return {"id": str(cn_id), "status": status}


@router.delete("/credit-notes/{cn_id}/applications/{app_id}", status_code=200)
async def remove_single_credit_application(cn_id: UUID, app_id: UUID, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Remove a single credit application by ID, reverting the invoice balance."""
    result = await db.execute(
        select(CreditNote)
        .options(selectinload(CreditNote.credit_applications))
        .where(CreditNote.id == cn_id, CreditNote.organization_id == current_user["org_id"])
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Credit note not found")
    if obj.status == "void":
        raise HTTPException(status_code=400, detail="Cannot modify a voided credit note")
    # Find the specific application
    app_result = await db.execute(
        select(CreditApplicationModel).where(
            CreditApplicationModel.id == app_id,
            CreditApplicationModel.credit_note_id == cn_id,
        )
    )
    app = app_result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Credit application not found")
    # Revert invoice balance
    inv_result = await db.execute(select(Invoice).where(Invoice.id == app.invoice_id))
    inv = inv_result.scalar_one_or_none()
    if inv:
        inv.amount_paid = max(0.0, float(inv.amount_paid or 0) - float(app.amount))
        inv_total = float(inv.total or 0)
        if float(inv.amount_paid) >= inv_total:
            inv.status = "paid"
        elif float(inv.amount_paid) > 0:
            inv.status = "partially paid"
        else:
            inv.status = "outstanding"
    await db.delete(app)
    await db.flush()
    # Recalculate credit_applied from remaining applications
    remaining = await db.execute(
        select(CreditApplicationModel).where(CreditApplicationModel.credit_note_id == cn_id)
    )
    remaining_apps = remaining.scalars().all()
    new_credit_applied = sum(float(a.amount) for a in remaining_apps)
    obj.credit_applied = new_credit_applied
    if new_credit_applied <= 0:
        obj.status = "issued"
    elif new_credit_applied >= float(obj.total or 0):
        obj.status = "applied"
    else:
        obj.status = "issued"
    await db.commit()
    return {"removed": True}


@router.delete("/credit-notes/{cn_id}/applications", status_code=200)
async def remove_credit_applications(cn_id: UUID, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Remove all credit applications from a credit note, reverting invoice balances."""
    result = await db.execute(
        select(CreditNote)
        .options(selectinload(CreditNote.credit_applications))
        .where(CreditNote.id == cn_id, CreditNote.organization_id == current_user["org_id"])
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Credit note not found")
    if obj.status == "void":
        raise HTTPException(status_code=400, detail="Cannot modify a voided credit note")
    # Revert invoice balances
    for app in obj.credit_applications:
        inv_result = await db.execute(select(Invoice).where(Invoice.id == app.invoice_id))
        inv = inv_result.scalar_one_or_none()
        if inv:
            inv.amount_paid = max(0.0, float(inv.amount_paid or 0) - float(app.amount))
            inv_total = float(inv.total or 0)
            if float(inv.amount_paid) >= inv_total:
                inv.status = "paid"
            elif float(inv.amount_paid) > 0:
                inv.status = "partially paid"
            else:
                inv.status = "outstanding"
    await db.execute(delete(CreditApplicationModel).where(CreditApplicationModel.credit_note_id == obj.id))
    obj.credit_applied = 0
    obj.status = "issued"
    await db.commit()
    return {"removed": True}


@router.delete("/credit-notes/{cn_id}", status_code=204)
async def delete_credit_note(cn_id: UUID, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CreditNote)
        .options(selectinload(CreditNote.credit_applications))
        .where(CreditNote.id == cn_id, CreditNote.organization_id == current_user["org_id"])
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Credit note not found")
    if obj.status == "applied" and obj.credit_applications:
        raise HTTPException(status_code=400, detail="Remove credit applications first before deleting")
    if obj.status not in ("draft", "issued", "void"):
        raise HTTPException(status_code=400, detail="Only draft, issued, or void credit notes can be deleted")
    await db.delete(obj)
    await db.commit()


def _build_events(events: list[dict]) -> dict:
    events.sort(key=lambda e: (e.get("ts") or ""))
    running = 0.0
    for ev in events:
        running += ev.get("delta", 0.0)
        ev["balance"] = round(running, 2)
    return {"total": round(running, 2), "events": events}


@router.get("/credit-notes/{cn_id}/activity")
async def credit_note_activity(cn_id: UUID, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    org_id = current_user["org_id"]
    result = await db.execute(select(CreditNote).where(CreditNote.id == cn_id, CreditNote.organization_id == org_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Credit note not found")
    events: list[dict] = [{
        "ts": obj.issue_date.isoformat() if obj.issue_date else None,
        "type": "issued", "ref": obj.credit_note_number, "ref_id": str(obj.id),
        "delta": float(obj.total or 0), "note": obj.notes or "", "status": obj.status,
    }]
    apps_result = await db.execute(
        select(CreditApplicationModel, Invoice)
        .join(Invoice, Invoice.id == CreditApplicationModel.invoice_id)
        .where(CreditApplicationModel.credit_note_id == cn_id)
    )
    for app, inv in apps_result.all():
        events.append({
            "ts": app.applied_at.isoformat() if app.applied_at else None,
            "type": "payment", "ref": inv.invoice_number, "ref_id": str(inv.id),
            "delta": -float(app.amount or 0), "note": f"Applied to invoice {inv.invoice_number}", "status": inv.status,
        })
    return _build_events(events)
