from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func, or_
from sqlalchemy.orm import selectinload
from uuid import UUID
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import require_write
from app.core.pagination import PaginationParams, paginated_result, apply_sort
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel as PydanticBaseModel
from app.models.models import (
    Quotation, QuotationLineItem,
    DeliveryOrder, DeliveryOrderLineItem,
    Invoice, InvoiceLineItem, Contact,
)
from app.schemas.schemas import (
    QuotationCreate, QuotationUpdate, QuotationResponse,
)
from app.core.sequences import next_sequence_number
from app.core.audit import log_audit
from .sales import calc_totals

router = APIRouter(tags=["Sales"])


# ═══════════════════════════════════════════════
# QUOTATIONS
# ═══════════════════════════════════════════════
@router.get("/quotations")
async def list_quotations(
    status: str | None = None,
    contact_id: UUID | None = None,
    p: PaginationParams = Depends(),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = current_user["org_id"]
    base = select(Quotation).where(Quotation.organization_id == org_id)
    if status:
        base = base.where(Quotation.status == status)
    if contact_id:
        base = base.where(Quotation.contact_id == contact_id)
    if p.search:
        like = f"%{p.search}%"
        contact_match = select(Contact.id).where(
            Contact.organization_id == org_id, Contact.name.ilike(like)
        )
        base = base.where(or_(
            Quotation.quotation_number.ilike(like),
            Quotation.contact_id.in_(contact_match),
        ))
    if p.date_from:
        base = base.where(Quotation.issue_date >= p.date_from)
    if p.date_to:
        base = base.where(Quotation.issue_date <= p.date_to)

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    query = apply_sort(base, Quotation, p).options(selectinload(Quotation.line_items)).offset(p.offset).limit(p.limit)
    items = (await db.execute(query)).scalars().all()
    items = [QuotationResponse.model_validate(i) for i in items]
    return paginated_result(items, total, p)


@router.post("/quotations", response_model=QuotationResponse, status_code=201)
async def create_quotation(data: QuotationCreate, current_user: dict = Depends(require_write()), db: AsyncSession = Depends(get_db)):
    org_id = current_user["org_id"]
    if data.quotation_number:
        existing = (await db.execute(select(Quotation.id).where(Quotation.organization_id == org_id, Quotation.quotation_number == data.quotation_number))).first()
        if existing:
            raise HTTPException(status_code=400, detail="Quotation number already in use")
        quotation_number = data.quotation_number
    else:
        quotation_number = await next_sequence_number(db, Quotation, Quotation.quotation_number, org_id, "QT")
    subtotal, discount_total, tax_amount = calc_totals(data.line_items)

    obj = Quotation(
        organization_id=org_id, contact_id=data.contact_id,
        quotation_number=quotation_number, issue_date=data.issue_date,
        expiry_date=data.expiry_date, reference=data.reference,
        subtotal=subtotal, discount_amount=discount_total, tax_amount=tax_amount,
        total=subtotal + tax_amount, currency=data.currency,
        notes=data.notes, terms=data.terms,
        billing_address_line1=data.billing_address_line1, billing_address_line2=data.billing_address_line2,
        billing_city=data.billing_city, billing_state=data.billing_state,
        billing_postcode=data.billing_postcode, billing_country=data.billing_country,
    )
    db.add(obj)
    await db.flush()
    for i, item in enumerate(data.line_items):
        line_total = item.quantity * item.unit_price
        disc_mode = getattr(item, 'discount_mode', 'percent') or 'percent'
        disc_val = min(item.discount, line_total) if disc_mode == 'amount' else line_total * item.discount / 100
        after_disc = line_total - disc_val
        db.add(QuotationLineItem(
            quotation_id=obj.id, line_type=item.line_type, description=item.description,
            quantity=item.quantity, unit_price=item.unit_price, tax_rate=item.tax_rate,
            tax_code_id=item.tax_code_id, discount=item.discount, discount_mode=disc_mode,
            amount=after_disc, account_id=item.account_id, sort_order=i,
        ))
    await db.commit()
    await log_audit(db, org_id, current_user["sub"], "create", "quotation", obj.id)
    result = await db.execute(
        select(Quotation).options(selectinload(Quotation.line_items)).where(Quotation.id == obj.id)
    )
    return result.scalar_one()


@router.get("/quotations/{qid}", response_model=QuotationResponse)
async def get_quotation(qid: UUID, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Quotation)
        .options(selectinload(Quotation.line_items))
        .where(Quotation.id == qid, Quotation.organization_id == current_user["org_id"])
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Quotation not found")
    return obj


@router.patch("/quotations/{qid}", response_model=QuotationResponse)
async def update_quotation(qid: UUID, data: QuotationUpdate, current_user: dict = Depends(require_write()), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Quotation)
        .options(selectinload(Quotation.line_items))
        .where(Quotation.id == qid, Quotation.organization_id == current_user["org_id"])
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Quotation not found")
    if obj.status == "void":
        raise HTTPException(status_code=400, detail="Voided quotations cannot be edited")

    if data.contact_id is not None:
        obj.contact_id = data.contact_id
    if data.quotation_number is not None and data.quotation_number != obj.quotation_number:
        existing = (await db.execute(select(Quotation.id).where(Quotation.organization_id == obj.organization_id, Quotation.quotation_number == data.quotation_number, Quotation.id != obj.id))).first()
        if existing:
            raise HTTPException(status_code=400, detail="Quotation number already in use")
        obj.quotation_number = data.quotation_number
    if data.issue_date is not None:
        obj.issue_date = data.issue_date
    if data.expiry_date is not None:
        obj.expiry_date = data.expiry_date
    if data.reference is not None:
        obj.reference = data.reference
    if data.currency is not None:
        obj.currency = data.currency
    if data.notes is not None:
        obj.notes = data.notes
    if data.terms is not None:
        obj.terms = data.terms
    for addr_field in [
        "billing_address_line1", "billing_address_line2", "billing_city",
        "billing_state", "billing_postcode", "billing_country",
    ]:
        val = getattr(data, addr_field, None)
        if val is not None:
            setattr(obj, addr_field, val)

    if data.line_items is not None:
        await db.execute(delete(QuotationLineItem).where(QuotationLineItem.quotation_id == obj.id))
        subtotal, discount_total, tax_amount = calc_totals(data.line_items)
        for i, item in enumerate(data.line_items):
            line_total = item.quantity * item.unit_price
            disc_mode = getattr(item, 'discount_mode', 'percent') or 'percent'
            disc_val = min(item.discount, line_total) if disc_mode == 'amount' else line_total * item.discount / 100
            after_disc = line_total - disc_val
            db.add(QuotationLineItem(
                quotation_id=obj.id, line_type=item.line_type, description=item.description,
                quantity=item.quantity, unit_price=item.unit_price, tax_rate=item.tax_rate,
                tax_code_id=item.tax_code_id, discount=item.discount, discount_mode=disc_mode,
                account_id=item.account_id, amount=after_disc, sort_order=i,
            ))
        obj.subtotal = subtotal
        obj.discount_amount = discount_total
        obj.tax_amount = tax_amount
        obj.total = subtotal + tax_amount

    await db.commit()
    result2 = await db.execute(
        select(Quotation).options(selectinload(Quotation.line_items)).where(Quotation.id == obj.id)
    )
    return result2.scalar_one()


class ConvertQuotationRequest(PydanticBaseModel):
    targets: list[str]  # ["invoice", "delivery_order"] or either one


@router.post("/quotations/{qid}/convert")
async def convert_quotation(qid: UUID, body: ConvertQuotationRequest, current_user: dict = Depends(require_write()), db: AsyncSession = Depends(get_db)):
    """Convert quotation to invoice and/or delivery order. Copies all line items."""
    org_id = current_user["org_id"]
    result = await db.execute(
        select(Quotation).options(selectinload(Quotation.line_items))
        .where(Quotation.id == qid, Quotation.organization_id == org_id)
    )
    quote = result.scalar_one_or_none()
    if not quote:
        raise HTTPException(status_code=404, detail="Quotation not found")

    valid_targets = {"invoice", "delivery_order"}
    targets = [t for t in body.targets if t in valid_targets]
    if not targets:
        raise HTTPException(status_code=400, detail="targets must include 'invoice' and/or 'delivery_order'")

    now = datetime.now(timezone.utc)
    created = {}

    if "invoice" in targets:
        inv_number = await next_sequence_number(db, Invoice, Invoice.invoice_number, org_id, "INV")
        inv = Invoice(
            organization_id=org_id, contact_id=quote.contact_id,
            invoice_number=inv_number,
            issue_date=now, due_date=now + timedelta(days=30),
            subtotal=quote.subtotal, tax_amount=quote.tax_amount, total=quote.total,
            currency=quote.currency, notes=f"Converted from {quote.quotation_number}",
            terms=getattr(quote, 'terms', None),
            billing_address_line1=getattr(quote, 'billing_address_line1', None),
            billing_address_line2=getattr(quote, 'billing_address_line2', None),
            billing_city=getattr(quote, 'billing_city', None),
            billing_state=getattr(quote, 'billing_state', None),
            billing_postcode=getattr(quote, 'billing_postcode', None),
            billing_country=getattr(quote, 'billing_country', None),
        )
        db.add(inv)
        await db.flush()
        for i, li in enumerate(quote.line_items):
            db.add(InvoiceLineItem(
                invoice_id=inv.id, line_type=getattr(li, 'line_type', 'goods'),
                description=li.description, quantity=li.quantity,
                unit_price=li.unit_price, tax_rate=li.tax_rate,
                tax_code_id=getattr(li, 'tax_code_id', None),
                discount=getattr(li, 'discount', 0) or 0,
                amount=li.amount, account_id=li.account_id, sort_order=i,
            ))
        created["invoice"] = {"id": str(inv.id), "number": inv.invoice_number}

    if "delivery_order" in targets:
        do_number = await next_sequence_number(db, DeliveryOrder, DeliveryOrder.delivery_number, org_id, "DO")
        do = DeliveryOrder(
            organization_id=org_id, contact_id=quote.contact_id,
            quotation_id=quote.id,
            delivery_number=do_number,
            delivery_date=now, currency=quote.currency,
            subtotal=quote.subtotal, discount_amount=getattr(quote, 'discount_amount', 0) or 0,
            tax_amount=quote.tax_amount, total=quote.total,
            notes=f"Converted from {quote.quotation_number}",
        )
        db.add(do)
        await db.flush()
        for i, li in enumerate(quote.line_items):
            db.add(DeliveryOrderLineItem(
                delivery_order_id=do.id, line_type=getattr(li, 'line_type', 'goods'),
                description=li.description, quantity=li.quantity,
                unit_price=li.unit_price, discount=getattr(li, 'discount', 0) or 0,
                tax_rate=li.tax_rate,
                tax_code_id=getattr(li, 'tax_code_id', None),
                amount=li.amount, sort_order=i,
            ))
        created["delivery_order"] = {"id": str(do.id), "number": do.delivery_number}

    quote.status = "converted"
    await db.commit()

    return {"quotation_id": str(qid), "status": "converted", "created": created}


@router.patch("/quotations/{qid}/status")
async def update_quotation_status(qid: UUID, status: str, current_user: dict = Depends(require_write()), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Quotation).where(Quotation.id == qid, Quotation.organization_id == current_user["org_id"]))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Quotation not found")
    valid = {"draft", "sent", "accepted", "declined", "converted", "void"}
    if status not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid)}")
    obj.status = status
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "status_change", "quotation", qid)
    return {"id": str(qid), "status": status}


@router.delete("/quotations/{qid}", status_code=204)
async def delete_quotation(qid: UUID, current_user: dict = Depends(require_write()), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Quotation).where(Quotation.id == qid, Quotation.organization_id == current_user["org_id"]))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Quotation not found")
    if obj.status not in ("draft", "declined", "void"):
        raise HTTPException(status_code=400, detail="Only draft, declined or void quotations can be deleted")
    await db.delete(obj)
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "delete", "quotation", qid)


def _build_events(events: list[dict]) -> dict:
    events.sort(key=lambda e: (e.get("ts") or ""))
    running = 0.0
    for ev in events:
        running += ev.get("delta", 0.0)
        ev["balance"] = round(running, 2)
    return {"total": round(running, 2), "events": events}


@router.get("/quotations/{qid}/activity")
async def quotation_activity(qid: UUID, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    org_id = current_user["org_id"]
    result = await db.execute(select(Quotation).where(Quotation.id == qid, Quotation.organization_id == org_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Quotation not found")
    events: list[dict] = [{
        "ts": obj.issue_date.isoformat() if obj.issue_date else None,
        "type": "issued", "ref": obj.quotation_number, "ref_id": str(obj.id),
        "delta": float(obj.total or 0), "note": obj.notes or "", "status": obj.status,
    }]
    return _build_events(events)
