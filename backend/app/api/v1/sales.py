from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from sqlalchemy.orm import selectinload
from uuid import UUID
from app.core.database import get_db
from app.core.security import get_current_user
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel as PydanticBaseModel
from app.models.models import (
    Quotation, QuotationLineItem,
    DeliveryOrder, DeliveryOrderLineItem, CreditNote, CreditNoteLineItem,
    CreditApplication as CreditApplicationModel, DebitNote, DebitNoteLineItem,
    SalesPayment, PaymentAllocation, SalesRefund, Invoice, InvoiceLineItem,
)
from .gl_helpers import post_gl, revert_gl
from app.schemas.schemas import (
    QuotationCreate, QuotationUpdate, QuotationResponse,
    DeliveryOrderCreate, DeliveryOrderUpdate, DeliveryOrderResponse,
    CreditNoteCreate, CreditNoteUpdate, CreditNoteResponse,
    DebitNoteCreate, DebitNoteUpdate, DebitNoteResponse,
    SalesPaymentCreate, SalesPaymentUpdate, SalesPaymentResponse,
    SalesRefundCreate, SalesRefundUpdate, SalesRefundResponse,
)

router = APIRouter(tags=["Sales"])


# ── Helper: calculate line item totals ──
def calc_totals(line_items, has_discount=True):
    """Discount is a percentage (0-100) applied per line before tax."""
    subtotal = 0
    tax_amount = 0
    discount_total = 0
    for item in line_items:
        amount = item.quantity * item.unit_price
        disc_pct = getattr(item, 'discount', 0) or 0
        disc_value = amount * (disc_pct / 100)
        amount_after_disc = amount - disc_value
        tax = amount_after_disc * (item.tax_rate / 100)
        subtotal += amount
        tax_amount += tax
        discount_total += disc_value
    return subtotal, discount_total, tax_amount


# ═══════════════════════════════════════════════
# QUOTATIONS
# ═══════════════════════════════════════════════
@router.get("/quotations", response_model=list[QuotationResponse])
async def list_quotations(status: str | None = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    org_id = current_user["org_id"]
    q = select(Quotation).options(selectinload(Quotation.line_items)).where(Quotation.organization_id == org_id).order_by(Quotation.created_at.desc())
    if status:
        q = q.where(Quotation.status == status)
    return (await db.execute(q)).scalars().all()


@router.post("/quotations", response_model=QuotationResponse, status_code=201)
async def create_quotation(data: QuotationCreate, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    org_id = current_user["org_id"]
    count = (await db.execute(select(func.count(Quotation.id)).where(Quotation.organization_id == org_id))).scalar() or 0
    subtotal, discount_total, tax_amount = calc_totals(data.line_items)

    obj = Quotation(
        organization_id=org_id, contact_id=data.contact_id,
        quotation_number=f"QT-{count + 1:04d}", issue_date=data.issue_date,
        expiry_date=data.expiry_date, reference=data.reference,
        subtotal=subtotal, discount_amount=discount_total, tax_amount=tax_amount,
        total=subtotal - discount_total + tax_amount, currency=data.currency,
        notes=data.notes, terms=data.terms,
        billing_address_line1=data.billing_address_line1, billing_address_line2=data.billing_address_line2,
        billing_city=data.billing_city, billing_state=data.billing_state,
        billing_postcode=data.billing_postcode, billing_country=data.billing_country,
    )
    db.add(obj)
    await db.flush()
    for i, item in enumerate(data.line_items):
        amount = item.quantity * item.unit_price
        db.add(QuotationLineItem(
            quotation_id=obj.id, line_type=item.line_type, description=item.description,
            quantity=item.quantity, unit_price=item.unit_price, tax_rate=item.tax_rate,
            tax_code_id=item.tax_code_id, discount=item.discount,
            amount=amount, account_id=item.account_id, sort_order=i,
        ))
    await db.commit()
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
async def update_quotation(qid: UUID, data: QuotationUpdate, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Quotation)
        .options(selectinload(Quotation.line_items))
        .where(Quotation.id == qid, Quotation.organization_id == current_user["org_id"])
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Quotation not found")
    if obj.status not in ("draft",):
        raise HTTPException(status_code=400, detail="Only draft quotations can be edited")

    if data.contact_id is not None:
        obj.contact_id = data.contact_id
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
            amount = item.quantity * item.unit_price
            db.add(QuotationLineItem(
                quotation_id=obj.id, line_type=item.line_type, description=item.description,
                quantity=item.quantity, unit_price=item.unit_price, tax_rate=item.tax_rate,
                tax_code_id=item.tax_code_id, discount=item.discount,
                account_id=item.account_id, amount=amount, sort_order=i,
            ))
        obj.subtotal = subtotal
        obj.discount_amount = discount_total
        obj.tax_amount = tax_amount
        obj.total = subtotal - discount_total + tax_amount

    await db.commit()
    result2 = await db.execute(
        select(Quotation).options(selectinload(Quotation.line_items)).where(Quotation.id == obj.id)
    )
    return result2.scalar_one()


class ConvertQuotationRequest(PydanticBaseModel):
    targets: list[str]  # ["invoice", "delivery_order"] or either one


@router.post("/quotations/{qid}/convert")
async def convert_quotation(qid: UUID, body: ConvertQuotationRequest, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
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
        inv_count = (await db.execute(select(func.count(Invoice.id)).where(Invoice.organization_id == org_id))).scalar() or 0
        inv = Invoice(
            organization_id=org_id, contact_id=quote.contact_id,
            invoice_number=f"INV-{inv_count + 1:04d}",
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
        do_count = (await db.execute(select(func.count(DeliveryOrder.id)).where(DeliveryOrder.organization_id == org_id))).scalar() or 0
        do = DeliveryOrder(
            organization_id=org_id, contact_id=quote.contact_id,
            quotation_id=quote.id,
            delivery_number=f"DO-{do_count + 1:04d}",
            delivery_date=now, currency=quote.currency,
            subtotal=quote.subtotal, tax_amount=quote.tax_amount, total=quote.total,
            notes=f"Converted from {quote.quotation_number}",
        )
        db.add(do)
        await db.flush()
        for i, li in enumerate(quote.line_items):
            db.add(DeliveryOrderLineItem(
                delivery_order_id=do.id, line_type=getattr(li, 'line_type', 'goods'),
                description=li.description, quantity=li.quantity,
                unit_price=li.unit_price, tax_rate=li.tax_rate,
                tax_code_id=getattr(li, 'tax_code_id', None),
                amount=li.amount, account_id=getattr(li, 'account_id', None), sort_order=i,
            ))
        created["delivery_order"] = {"id": str(do.id), "number": do.delivery_number}

    quote.status = "converted"
    await db.commit()

    return {"quotation_id": str(qid), "status": "converted", "created": created}


# ═══════════════════════════════════════════════
# DELIVERY ORDERS
# ═══════════════════════════════════════════════
@router.get("/delivery-orders", response_model=list[DeliveryOrderResponse])
async def list_delivery_orders(status: str | None = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    org_id = current_user["org_id"]
    q = select(DeliveryOrder).options(selectinload(DeliveryOrder.line_items)).where(DeliveryOrder.organization_id == org_id).order_by(DeliveryOrder.created_at.desc())
    if status:
        q = q.where(DeliveryOrder.status == status)
    return (await db.execute(q)).scalars().all()


@router.post("/delivery-orders", response_model=DeliveryOrderResponse, status_code=201)
async def create_delivery_order(data: DeliveryOrderCreate, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    org_id = current_user["org_id"]
    count = (await db.execute(select(func.count(DeliveryOrder.id)).where(DeliveryOrder.organization_id == org_id))).scalar() or 0
    subtotal = sum(item.quantity * item.unit_price for item in data.line_items)
    tax_amount = sum(item.quantity * item.unit_price * (item.tax_rate / 100) for item in data.line_items)

    obj = DeliveryOrder(
        organization_id=org_id, contact_id=data.contact_id,
        invoice_id=data.invoice_id, quotation_id=data.quotation_id, sales_order_id=data.sales_order_id,
        delivery_number=f"DO-{count + 1:04d}", delivery_date=data.delivery_date,
        ship_to_address=data.ship_to_address, deliver_to_address=data.deliver_to_address,
        reference=data.reference, subtotal=subtotal, tax_amount=tax_amount,
        total=subtotal + tax_amount, currency=data.currency, notes=data.notes,
    )
    db.add(obj)
    await db.flush()
    for i, item in enumerate(data.line_items):
        db.add(DeliveryOrderLineItem(
            delivery_order_id=obj.id, description=item.description, quantity=item.quantity,
            unit_price=item.unit_price, tax_rate=item.tax_rate,
            amount=item.quantity * item.unit_price, sort_order=i,
        ))
    await db.commit()
    result = await db.execute(
        select(DeliveryOrder).options(selectinload(DeliveryOrder.line_items)).where(DeliveryOrder.id == obj.id)
    )
    return result.scalar_one()


@router.get("/delivery-orders/{do_id}", response_model=DeliveryOrderResponse)
async def get_delivery_order(do_id: UUID, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DeliveryOrder).options(selectinload(DeliveryOrder.line_items))
        .where(DeliveryOrder.id == do_id, DeliveryOrder.organization_id == current_user["org_id"])
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Delivery order not found")
    return obj


@router.patch("/delivery-orders/{do_id}", response_model=DeliveryOrderResponse)
async def update_delivery_order(do_id: UUID, data: DeliveryOrderUpdate, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DeliveryOrder)
        .options(selectinload(DeliveryOrder.line_items))
        .where(DeliveryOrder.id == do_id, DeliveryOrder.organization_id == current_user["org_id"])
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Delivery order not found")
    if obj.status not in ("draft",):
        raise HTTPException(status_code=400, detail="Only draft delivery orders can be edited")

    update_data = data.model_dump(exclude_unset=True)

    if "line_items" in update_data:
        line_items_data = update_data.pop("line_items")
        await db.execute(delete(DeliveryOrderLineItem).where(DeliveryOrderLineItem.delivery_order_id == obj.id))
        subtotal = sum(li["quantity"] * li["unit_price"] for li in line_items_data)
        tax_amount = sum(li["quantity"] * li["unit_price"] * (li["tax_rate"] / 100) for li in line_items_data)
        for i, item in enumerate(line_items_data):
            db.add(DeliveryOrderLineItem(
                delivery_order_id=obj.id, description=item["description"], quantity=item["quantity"],
                unit_price=item["unit_price"], tax_rate=item["tax_rate"],
                amount=item["quantity"] * item["unit_price"], sort_order=i,
            ))
        obj.subtotal = subtotal
        obj.tax_amount = tax_amount
        obj.total = subtotal + tax_amount

    for key, value in update_data.items():
        setattr(obj, key, value)

    await db.commit()
    result2 = await db.execute(
        select(DeliveryOrder).options(selectinload(DeliveryOrder.line_items)).where(DeliveryOrder.id == obj.id)
    )
    return result2.scalar_one()


# ═══════════════════════════════════════════════
# CREDIT NOTES
# ═══════════════════════════════════════════════
@router.get("/credit-notes", response_model=list[CreditNoteResponse])
async def list_credit_notes(status: str | None = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    org_id = current_user["org_id"]
    q = select(CreditNote).options(selectinload(CreditNote.line_items)).where(CreditNote.organization_id == org_id).order_by(CreditNote.created_at.desc())
    if status:
        q = q.where(CreditNote.status == status)
    return (await db.execute(q)).scalars().all()


@router.get("/credit-notes/{cn_id}", response_model=CreditNoteResponse)
async def get_credit_note(cn_id: UUID, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CreditNote).options(selectinload(CreditNote.line_items))
        .where(CreditNote.id == cn_id, CreditNote.organization_id == current_user["org_id"])
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Credit note not found")
    return obj


@router.post("/credit-notes", response_model=CreditNoteResponse, status_code=201)
async def create_credit_note(data: CreditNoteCreate, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    org_id = current_user["org_id"]
    count = (await db.execute(select(func.count(CreditNote.id)).where(CreditNote.organization_id == org_id))).scalar() or 0
    subtotal, discount_total, tax_amount = calc_totals(data.line_items)
    total = subtotal - discount_total + tax_amount

    obj = CreditNote(
        organization_id=org_id, contact_id=data.contact_id, invoice_id=data.invoice_id,
        credit_note_number=f"CN-{count + 1:04d}", issue_date=data.issue_date,
        reference=data.reference, subtotal=subtotal, discount_amount=discount_total,
        tax_amount=tax_amount, total=total, currency=data.currency, notes=data.notes,
    )
    db.add(obj)
    await db.flush()

    for i, item in enumerate(data.line_items):
        db.add(CreditNoteLineItem(
            credit_note_id=obj.id, description=item.description, quantity=item.quantity,
            unit_price=item.unit_price, tax_rate=item.tax_rate, discount=item.discount,
            amount=item.quantity * item.unit_price, account_id=item.account_id, sort_order=i,
        ))

    # Apply credit to invoices
    credit_applied = 0
    for app in data.credit_applications:
        db.add(CreditApplicationModel(credit_note_id=obj.id, invoice_id=app.invoice_id, amount=app.amount))
        credit_applied += app.amount
        # Reduce invoice balance
        inv_result = await db.execute(select(Invoice).where(Invoice.id == app.invoice_id))
        inv = inv_result.scalar_one_or_none()
        if inv:
            inv.amount_paid = float(inv.amount_paid or 0) + app.amount

    obj.credit_applied = credit_applied
    if credit_applied >= total:
        obj.status = "applied"
    else:
        obj.status = "issued"

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
        select(CreditNote).options(selectinload(CreditNote.line_items)).where(CreditNote.id == obj.id)
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
    if obj.status not in ("draft",) and editing_fields:
        raise HTTPException(status_code=400, detail="Only draft credit notes can have their details edited")

    update_data = data.model_dump(exclude_unset=True)

    if "line_items" in update_data:
        line_items_data = update_data.pop("line_items")
        await db.execute(delete(CreditNoteLineItem).where(CreditNoteLineItem.credit_note_id == obj.id))
        subtotal = sum(li["quantity"] * li["unit_price"] for li in line_items_data)
        discount_total = sum(li.get("discount", 0) or 0 for li in line_items_data)
        tax_amount = sum((li["quantity"] * li["unit_price"] - (li.get("discount", 0) or 0)) * (li["tax_rate"] / 100) for li in line_items_data)
        for i, item in enumerate(line_items_data):
            db.add(CreditNoteLineItem(
                credit_note_id=obj.id, description=item["description"], quantity=item["quantity"],
                unit_price=item["unit_price"], tax_rate=item["tax_rate"],
                discount=item.get("discount", 0),
                amount=item["quantity"] * item["unit_price"],
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

    for key, value in update_data.items():
        setattr(obj, key, value)

    await db.commit()
    result2 = await db.execute(
        select(CreditNote).options(selectinload(CreditNote.line_items), selectinload(CreditNote.credit_applications)).where(CreditNote.id == obj.id)
    )
    return result2.scalar_one()


# ═══════════════════════════════════════════════
# DEBIT NOTES
# ═══════════════════════════════════════════════
@router.get("/debit-notes", response_model=list[DebitNoteResponse])
async def list_debit_notes(status: str | None = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    org_id = current_user["org_id"]
    q = select(DebitNote).options(selectinload(DebitNote.line_items)).where(DebitNote.organization_id == org_id).order_by(DebitNote.created_at.desc())
    if status:
        q = q.where(DebitNote.status == status)
    return (await db.execute(q)).scalars().all()


@router.get("/debit-notes/{dn_id}", response_model=DebitNoteResponse)
async def get_debit_note(dn_id: UUID, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DebitNote).options(selectinload(DebitNote.line_items)).where(DebitNote.id == dn_id, DebitNote.organization_id == current_user["org_id"])
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Debit note not found")
    return obj


@router.post("/debit-notes", response_model=DebitNoteResponse, status_code=201)
async def create_debit_note(data: DebitNoteCreate, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    org_id = current_user["org_id"]
    count = (await db.execute(select(func.count(DebitNote.id)).where(DebitNote.organization_id == org_id))).scalar() or 0
    subtotal, discount_total, tax_amount = calc_totals(data.line_items)

    obj = DebitNote(
        organization_id=org_id, contact_id=data.contact_id, invoice_id=data.invoice_id,
        debit_note_number=f"DN-{count + 1:04d}", issue_date=data.issue_date,
        reference=data.reference, subtotal=subtotal, discount_amount=discount_total,
        tax_amount=tax_amount, total=subtotal - discount_total + tax_amount,
        currency=data.currency, notes=data.notes,
    )
    db.add(obj)
    await db.flush()

    for i, item in enumerate(data.line_items):
        db.add(DebitNoteLineItem(
            debit_note_id=obj.id, description=item.description, quantity=item.quantity,
            unit_price=item.unit_price, tax_rate=item.tax_rate, discount=item.discount,
            amount=item.quantity * item.unit_price, account_id=item.account_id, sort_order=i,
        ))

    # GL: Dr AR / Cr Revenue (debit note increases what customer owes)
    dn_total = float(subtotal - discount_total + tax_amount)
    dn_subtotal = float(subtotal - discount_total)
    entries = [
        ("1100", dn_total, 0),       # Dr AR
        ("4000", 0, dn_subtotal),    # Cr Revenue
    ]
    if tax_amount > 0:
        entries.append(("2100", 0, float(tax_amount)))  # Cr GST Payable
    await post_gl(
        db, org_id, data.issue_date,
        f"Debit Note {obj.debit_note_number}",
        obj.debit_note_number, "debit_note", obj.id, entries,
    )

    await db.commit()
    result2 = await db.execute(
        select(DebitNote).options(selectinload(DebitNote.line_items)).where(DebitNote.id == obj.id)
    )
    return result2.scalar_one()


@router.patch("/debit-notes/{dn_id}", response_model=DebitNoteResponse)
async def update_debit_note(dn_id: UUID, data: DebitNoteUpdate, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DebitNote)
        .options(selectinload(DebitNote.line_items))
        .where(DebitNote.id == dn_id, DebitNote.organization_id == current_user["org_id"])
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Debit note not found")
    if obj.status not in ("draft",):
        raise HTTPException(status_code=400, detail="Only draft debit notes can be edited")

    update_data = data.model_dump(exclude_unset=True)

    if "line_items" in update_data:
        line_items_data = update_data.pop("line_items")
        await db.execute(delete(DebitNoteLineItem).where(DebitNoteLineItem.debit_note_id == obj.id))
        subtotal = sum(li["quantity"] * li["unit_price"] for li in line_items_data)
        discount_total = sum(li.get("discount", 0) or 0 for li in line_items_data)
        tax_amount = sum((li["quantity"] * li["unit_price"] - (li.get("discount", 0) or 0)) * (li["tax_rate"] / 100) for li in line_items_data)
        for i, item in enumerate(line_items_data):
            db.add(DebitNoteLineItem(
                debit_note_id=obj.id, description=item["description"], quantity=item["quantity"],
                unit_price=item["unit_price"], tax_rate=item["tax_rate"],
                discount=item.get("discount", 0),
                amount=item["quantity"] * item["unit_price"],
                account_id=item.get("account_id"), sort_order=i,
            ))
        obj.subtotal = subtotal
        obj.discount_amount = discount_total
        obj.tax_amount = tax_amount
        obj.total = subtotal - discount_total + tax_amount

    for key, value in update_data.items():
        setattr(obj, key, value)

    await db.commit()
    result2 = await db.execute(
        select(DebitNote).options(selectinload(DebitNote.line_items)).where(DebitNote.id == obj.id)
    )
    return result2.scalar_one()


# ═══════════════════════════════════════════════
# SALES PAYMENTS
# ═══════════════════════════════════════════════
@router.get("/sales-payments", response_model=list[SalesPaymentResponse])
async def list_sales_payments(status: str | None = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    org_id = current_user["org_id"]
    q = select(SalesPayment).where(SalesPayment.organization_id == org_id).order_by(SalesPayment.created_at.desc())
    if status:
        q = q.where(SalesPayment.status == status)
    return (await db.execute(q)).scalars().all()


@router.get("/sales-payments/{sp_id}", response_model=SalesPaymentResponse)
async def get_sales_payment(sp_id: UUID, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SalesPayment).where(SalesPayment.id == sp_id, SalesPayment.organization_id == current_user["org_id"])
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Sales payment not found")
    return obj


@router.post("/sales-payments", response_model=SalesPaymentResponse, status_code=201)
async def create_sales_payment(data: SalesPaymentCreate, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    org_id = current_user["org_id"]
    count = (await db.execute(select(func.count(SalesPayment.id)).where(SalesPayment.organization_id == org_id))).scalar() or 0

    obj = SalesPayment(
        organization_id=org_id, contact_id=data.contact_id,
        payment_number=f"PMT-{count + 1:04d}", payment_date=data.payment_date,
        payment_method=data.payment_method, reference=data.reference,
        amount=data.amount, bank_account_id=data.bank_account_id,
        currency=data.currency, notes=data.notes, status="completed",
    )
    db.add(obj)
    await db.flush()

    # Allocate to invoices and update balances
    for alloc in data.allocations:
        db.add(PaymentAllocation(payment_id=obj.id, invoice_id=alloc.invoice_id, amount=alloc.amount))
        inv_result = await db.execute(select(Invoice).where(Invoice.id == alloc.invoice_id))
        inv = inv_result.scalar_one_or_none()
        if inv:
            inv.amount_paid = float(inv.amount_paid or 0) + alloc.amount
            if inv.amount_paid >= float(inv.total):
                inv.status = "paid"

    # GL: Dr Cash/Bank / Cr AR
    await post_gl(
        db, org_id, data.payment_date,
        f"Payment received {obj.payment_number}",
        obj.payment_number, "payment", obj.id,
        [("1000", float(data.amount), 0), ("1100", 0, float(data.amount))],
    )

    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/sales-payments/{sp_id}", response_model=SalesPaymentResponse)
async def update_sales_payment(sp_id: UUID, data: SalesPaymentUpdate, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SalesPayment)
        .options(selectinload(SalesPayment.allocations))
        .where(SalesPayment.id == sp_id, SalesPayment.organization_id == current_user["org_id"])
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Sales payment not found")
    if obj.status in ("void",):
        raise HTTPException(status_code=400, detail="Voided payments cannot be edited")

    update_data = data.model_dump(exclude_unset=True)

    if "allocations" in update_data:
        allocs_data = update_data.pop("allocations")
        # Revert old allocations on invoices
        for existing_alloc in obj.allocations:
            inv_result = await db.execute(select(Invoice).where(Invoice.id == existing_alloc.invoice_id))
            inv = inv_result.scalar_one_or_none()
            if inv:
                inv.amount_paid = float(inv.amount_paid or 0) - existing_alloc.amount
                if inv.status == "paid":
                    inv.status = "sent"
        await db.execute(delete(PaymentAllocation).where(PaymentAllocation.payment_id == obj.id))
        for alloc in allocs_data:
            db.add(PaymentAllocation(payment_id=obj.id, invoice_id=alloc["invoice_id"], amount=alloc["amount"]))
            inv_result = await db.execute(select(Invoice).where(Invoice.id == alloc["invoice_id"]))
            inv = inv_result.scalar_one_or_none()
            if inv:
                inv.amount_paid = float(inv.amount_paid or 0) + alloc["amount"]
                if inv.amount_paid >= float(inv.total):
                    inv.status = "paid"

    for key, value in update_data.items():
        setattr(obj, key, value)

    await db.commit()
    result2 = await db.execute(
        select(SalesPayment).options(selectinload(SalesPayment.allocations)).where(SalesPayment.id == obj.id)
    )
    return result2.scalar_one()


# ═══════════════════════════════════════════════
# SALES REFUNDS
# ═══════════════════════════════════════════════
@router.get("/sales-refunds", response_model=list[SalesRefundResponse])
async def list_sales_refunds(status: str | None = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    org_id = current_user["org_id"]
    q = select(SalesRefund).where(SalesRefund.organization_id == org_id).order_by(SalesRefund.created_at.desc())
    if status:
        q = q.where(SalesRefund.status == status)
    return (await db.execute(q)).scalars().all()


@router.get("/sales-refunds/{sr_id}", response_model=SalesRefundResponse)
async def get_sales_refund(sr_id: UUID, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SalesRefund).where(SalesRefund.id == sr_id, SalesRefund.organization_id == current_user["org_id"])
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Sales refund not found")
    return obj


@router.post("/sales-refunds", response_model=SalesRefundResponse, status_code=201)
async def create_sales_refund(data: SalesRefundCreate, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    org_id = current_user["org_id"]
    count = (await db.execute(select(func.count(SalesRefund.id)).where(SalesRefund.organization_id == org_id))).scalar() or 0

    obj = SalesRefund(
        organization_id=org_id, contact_id=data.contact_id, credit_note_id=data.credit_note_id,
        refund_number=f"REF-{count + 1:04d}", refund_date=data.refund_date,
        refund_method=data.refund_method, reference=data.reference,
        amount=data.amount, bank_account_id=data.bank_account_id,
        currency=data.currency, notes=data.notes, status="completed",
    )
    db.add(obj)
    await db.flush()

    # GL: Dr AR / Cr Cash/Bank (refund reduces cash, reinstates AR)
    await post_gl(
        db, org_id, data.refund_date,
        f"Refund {obj.refund_number}",
        obj.refund_number, "refund", obj.id,
        [("1100", float(data.amount), 0), ("1000", 0, float(data.amount))],
    )

    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/sales-refunds/{sr_id}", response_model=SalesRefundResponse)
async def update_sales_refund(sr_id: UUID, data: SalesRefundUpdate, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SalesRefund)
        .where(SalesRefund.id == sr_id, SalesRefund.organization_id == current_user["org_id"])
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Sales refund not found")
    if obj.status not in ("draft",):
        raise HTTPException(status_code=400, detail="Only draft refunds can be edited")

    update_data = data.model_dump(exclude_unset=True)

    for key, value in update_data.items():
        setattr(obj, key, value)

    await db.commit()
    await db.refresh(obj)
    return obj


# ═══════════════════════════════════════════════
# STATUS-ONLY ENDPOINTS (allow transitions from any status)
# ═══════════════════════════════════════════════

@router.patch("/quotations/{qid}/status")
async def update_quotation_status(qid: UUID, status: str, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Quotation).where(Quotation.id == qid, Quotation.organization_id == current_user["org_id"]))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Quotation not found")
    valid = {"draft", "sent", "accepted", "declined", "converted", "void"}
    if status not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid)}")
    obj.status = status
    await db.commit()
    return {"id": str(qid), "status": status}


@router.patch("/delivery-orders/{do_id}/status")
async def update_delivery_order_status(do_id: UUID, status: str, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DeliveryOrder).where(DeliveryOrder.id == do_id, DeliveryOrder.organization_id == current_user["org_id"]))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Delivery order not found")
    valid = {"draft", "sent", "delivered", "cancelled"}
    if status not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid)}")
    obj.status = status
    await db.commit()
    return {"id": str(do_id), "status": status}


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


@router.patch("/debit-notes/{dn_id}/status")
async def update_debit_note_status(dn_id: UUID, status: str, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DebitNote).where(DebitNote.id == dn_id, DebitNote.organization_id == current_user["org_id"]))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Debit note not found")
    valid = {"draft", "issued", "applied", "void"}
    if status not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid)}")
    obj.status = status
    await db.commit()
    return {"id": str(dn_id), "status": status}


@router.patch("/sales-payments/{sp_id}/status")
async def update_sales_payment_status(sp_id: UUID, status: str, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SalesPayment).where(SalesPayment.id == sp_id, SalesPayment.organization_id == current_user["org_id"]))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Sales payment not found")
    valid = {"draft", "completed", "void"}
    if status not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid)}")
    obj.status = status
    await db.commit()
    return {"id": str(sp_id), "status": status}


@router.patch("/sales-refunds/{sr_id}/status")
async def update_sales_refund_status(sr_id: UUID, status: str, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SalesRefund).where(SalesRefund.id == sr_id, SalesRefund.organization_id == current_user["org_id"]))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Sales refund not found")
    valid = {"draft", "completed", "void"}
    if status not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid)}")
    obj.status = status
    await db.commit()
    return {"id": str(sr_id), "status": status}


# ═══════════════════════════════════════════════
# DELETE ENDPOINTS
# ═══════════════════════════════════════════════

@router.delete("/quotations/{qid}", status_code=204)
async def delete_quotation(qid: UUID, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Quotation).where(Quotation.id == qid, Quotation.organization_id == current_user["org_id"]))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Quotation not found")
    if obj.status not in ("draft", "declined", "void"):
        raise HTTPException(status_code=400, detail="Only draft, declined or void quotations can be deleted")
    await db.delete(obj)
    await db.commit()


@router.delete("/delivery-orders/{do_id}", status_code=204)
async def delete_delivery_order(do_id: UUID, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DeliveryOrder).where(DeliveryOrder.id == do_id, DeliveryOrder.organization_id == current_user["org_id"]))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Delivery order not found")
    if obj.status not in ("draft", "cancelled"):
        raise HTTPException(status_code=400, detail="Only draft or cancelled delivery orders can be deleted")
    await db.delete(obj)
    await db.commit()


@router.delete("/credit-notes/{cn_id}", status_code=204)
async def delete_credit_note(cn_id: UUID, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CreditNote).where(CreditNote.id == cn_id, CreditNote.organization_id == current_user["org_id"]))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Credit note not found")
    if obj.status not in ("draft", "void"):
        raise HTTPException(status_code=400, detail="Only draft or void credit notes can be deleted")
    await db.delete(obj)
    await db.commit()


@router.delete("/debit-notes/{dn_id}", status_code=204)
async def delete_debit_note(dn_id: UUID, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DebitNote).where(DebitNote.id == dn_id, DebitNote.organization_id == current_user["org_id"]))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Debit note not found")
    if obj.status not in ("draft", "void"):
        raise HTTPException(status_code=400, detail="Only draft or void debit notes can be deleted")
    await db.delete(obj)
    await db.commit()


@router.delete("/sales-payments/{sp_id}", status_code=204)
async def delete_sales_payment(sp_id: UUID, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SalesPayment).where(SalesPayment.id == sp_id, SalesPayment.organization_id == current_user["org_id"]))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Sales payment not found")
    await db.delete(obj)
    await db.commit()


@router.delete("/sales-refunds/{sr_id}", status_code=204)
async def delete_sales_refund(sr_id: UUID, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SalesRefund).where(SalesRefund.id == sr_id, SalesRefund.organization_id == current_user["org_id"]))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Sales refund not found")
    await db.delete(obj)
    await db.commit()


@router.post("/debit-notes/{dn_id}/pay", status_code=201)
async def pay_debit_note(
    dn_id: UUID,
    data: SalesPaymentCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a sales payment for a debit note and mark it as applied."""
    org_id = current_user["org_id"]
    result = await db.execute(
        select(DebitNote).where(DebitNote.id == dn_id, DebitNote.organization_id == org_id)
    )
    dn = result.scalar_one_or_none()
    if not dn:
        raise HTTPException(status_code=404, detail="Debit note not found")
    if dn.status == "void":
        raise HTTPException(status_code=400, detail="Cannot pay a voided debit note")

    # Auto-generate payment number
    count = (await db.execute(
        select(func.count(SalesPayment.id)).where(SalesPayment.organization_id == org_id)
    )).scalar() or 0
    payment_number = f"PAY-{count + 1:04d}"

    payment = SalesPayment(
        organization_id=org_id,
        contact_id=data.contact_id,
        payment_number=payment_number,
        payment_date=data.payment_date,
        payment_method=data.payment_method,
        reference=data.reference,
        amount=data.amount,
        bank_account_id=data.bank_account_id,
        currency=data.currency,
        notes=data.notes,
        status="completed",
    )
    db.add(payment)
    await db.flush()

    # Allocate to linked invoice if provided
    for alloc in data.allocations:
        db.add(PaymentAllocation(
            payment_id=payment.id,
            invoice_id=alloc.invoice_id,
            amount=alloc.amount,
        ))
        # Update invoice amount_paid
        inv_result = await db.execute(select(Invoice).where(Invoice.id == alloc.invoice_id))
        inv = inv_result.scalar_one_or_none()
        if inv:
            inv.amount_paid = float(inv.amount_paid or 0) + float(alloc.amount)
            if inv.amount_paid >= inv.total:
                inv.status = "paid"

    # Mark debit note as applied
    dn.status = "applied"

    await db.commit()
    return {"id": str(payment.id), "payment_number": payment_number, "status": "completed"}
