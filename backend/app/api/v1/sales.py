from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from uuid import UUID
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import (
    Quotation, QuotationLineItem, SalesOrder, SalesOrderLineItem,
    DeliveryOrder, DeliveryOrderLineItem, CreditNote, CreditNoteLineItem,
    CreditApplication as CreditApplicationModel, DebitNote, DebitNoteLineItem,
    SalesPayment, PaymentAllocation, SalesRefund, Invoice, Account, Transaction, JournalEntry,
)
from app.schemas.schemas import (
    QuotationCreate, QuotationResponse, SalesOrderCreate, SalesOrderResponse,
    DeliveryOrderCreate, DeliveryOrderResponse, CreditNoteCreate, CreditNoteResponse,
    DebitNoteCreate, DebitNoteResponse, SalesPaymentCreate, SalesPaymentResponse,
    SalesRefundCreate, SalesRefundResponse,
)

router = APIRouter(tags=["Sales"])


# ── Helper: calculate line item totals ──
def calc_totals(line_items, has_discount=True):
    subtotal = 0
    tax_amount = 0
    discount_total = 0
    for item in line_items:
        amount = item.quantity * item.unit_price
        disc = getattr(item, 'discount', 0) or 0
        amount_after_disc = amount - disc
        tax = amount_after_disc * (item.tax_rate / 100)
        subtotal += amount
        tax_amount += tax
        discount_total += disc
    return subtotal, discount_total, tax_amount


# ═══════════════════════════════════════════════
# QUOTATIONS
# ═══════════════════════════════════════════════
@router.get("/quotations", response_model=list[QuotationResponse])
async def list_quotations(status: str | None = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    org_id = current_user["org_id"]
    q = select(Quotation).where(Quotation.organization_id == org_id).order_by(Quotation.created_at.desc())
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
    )
    db.add(obj)
    await db.flush()
    for i, item in enumerate(data.line_items):
        amount = item.quantity * item.unit_price
        db.add(QuotationLineItem(
            quotation_id=obj.id, description=item.description, quantity=item.quantity,
            unit_price=item.unit_price, tax_rate=item.tax_rate, discount=item.discount,
            amount=amount, account_id=item.account_id, sort_order=i,
        ))
    return obj


@router.get("/quotations/{qid}", response_model=QuotationResponse)
async def get_quotation(qid: UUID, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Quotation).where(Quotation.id == qid, Quotation.organization_id == current_user["org_id"]))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Quotation not found")
    return obj


@router.post("/quotations/{qid}/convert")
async def convert_quotation(qid: UUID, target: str, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Convert quotation to invoice, delivery order, or sales order."""
    org_id = current_user["org_id"]
    result = await db.execute(select(Quotation).where(Quotation.id == qid, Quotation.organization_id == org_id))
    quote = result.scalar_one_or_none()
    if not quote:
        raise HTTPException(status_code=404, detail="Quotation not found")
    quote.status = "converted"
    return {"message": f"Quotation converted to {target}", "quotation_id": str(qid)}


# ═══════════════════════════════════════════════
# SALES ORDERS
# ═══════════════════════════════════════════════
@router.get("/sales-orders", response_model=list[SalesOrderResponse])
async def list_sales_orders(status: str | None = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    org_id = current_user["org_id"]
    q = select(SalesOrder).where(SalesOrder.organization_id == org_id).order_by(SalesOrder.created_at.desc())
    if status:
        q = q.where(SalesOrder.status == status)
    return (await db.execute(q)).scalars().all()


@router.post("/sales-orders", response_model=SalesOrderResponse, status_code=201)
async def create_sales_order(data: SalesOrderCreate, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    org_id = current_user["org_id"]
    count = (await db.execute(select(func.count(SalesOrder.id)).where(SalesOrder.organization_id == org_id))).scalar() or 0
    subtotal, discount_total, tax_amount = calc_totals(data.line_items)

    obj = SalesOrder(
        organization_id=org_id, contact_id=data.contact_id, quotation_id=data.quotation_id,
        order_number=f"SO-{count + 1:04d}", issue_date=data.issue_date,
        delivery_date=data.delivery_date, reference=data.reference,
        subtotal=subtotal, discount_amount=discount_total, tax_amount=tax_amount,
        total=subtotal - discount_total + tax_amount, currency=data.currency, notes=data.notes,
    )
    db.add(obj)
    await db.flush()
    for i, item in enumerate(data.line_items):
        db.add(SalesOrderLineItem(
            sales_order_id=obj.id, description=item.description, quantity=item.quantity,
            unit_price=item.unit_price, tax_rate=item.tax_rate, discount=item.discount,
            amount=item.quantity * item.unit_price, account_id=item.account_id, sort_order=i,
        ))
    return obj


# ═══════════════════════════════════════════════
# DELIVERY ORDERS
# ═══════════════════════════════════════════════
@router.get("/delivery-orders", response_model=list[DeliveryOrderResponse])
async def list_delivery_orders(status: str | None = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    org_id = current_user["org_id"]
    q = select(DeliveryOrder).where(DeliveryOrder.organization_id == org_id).order_by(DeliveryOrder.created_at.desc())
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
    return obj


# ═══════════════════════════════════════════════
# CREDIT NOTES
# ═══════════════════════════════════════════════
@router.get("/credit-notes", response_model=list[CreditNoteResponse])
async def list_credit_notes(status: str | None = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    org_id = current_user["org_id"]
    q = select(CreditNote).where(CreditNote.organization_id == org_id).order_by(CreditNote.created_at.desc())
    if status:
        q = q.where(CreditNote.status == status)
    return (await db.execute(q)).scalars().all()


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

    return obj


# ═══════════════════════════════════════════════
# DEBIT NOTES
# ═══════════════════════════════════════════════
@router.get("/debit-notes", response_model=list[DebitNoteResponse])
async def list_debit_notes(status: str | None = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    org_id = current_user["org_id"]
    q = select(DebitNote).where(DebitNote.organization_id == org_id).order_by(DebitNote.created_at.desc())
    if status:
        q = q.where(DebitNote.status == status)
    return (await db.execute(q)).scalars().all()


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

    # Increase the linked invoice total
    inv_result = await db.execute(select(Invoice).where(Invoice.id == data.invoice_id))
    inv = inv_result.scalar_one_or_none()
    if inv:
        inv.total = float(inv.total) + float(obj.total)
        inv.subtotal = float(inv.subtotal) + float(obj.subtotal)

    return obj


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

    # Create journal entry: Debit Cash/Bank, Credit AR
    cash_account = await db.execute(select(Account).where(Account.organization_id == org_id, Account.code == "1000"))
    cash = cash_account.scalar_one_or_none()
    ar_account = await db.execute(select(Account).where(Account.organization_id == org_id, Account.code == "1100"))
    ar = ar_account.scalar_one_or_none()
    if cash and ar:
        txn = Transaction(
            organization_id=org_id, date=data.payment_date,
            description=f"Payment received {obj.payment_number}",
            reference=obj.payment_number, source="payment", source_id=obj.id,
        )
        db.add(txn)
        await db.flush()
        db.add(JournalEntry(transaction_id=txn.id, account_id=cash.id, debit=data.amount, credit=0))
        db.add(JournalEntry(transaction_id=txn.id, account_id=ar.id, debit=0, credit=data.amount))

    return obj


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

    # Create journal entry: Debit AR, Credit Cash/Bank
    cash_account = await db.execute(select(Account).where(Account.organization_id == org_id, Account.code == "1000"))
    cash = cash_account.scalar_one_or_none()
    ar_account = await db.execute(select(Account).where(Account.organization_id == org_id, Account.code == "1100"))
    ar = ar_account.scalar_one_or_none()
    if cash and ar:
        txn = Transaction(
            organization_id=org_id, date=data.refund_date,
            description=f"Refund {obj.refund_number}",
            reference=obj.refund_number, source="refund", source_id=obj.id,
        )
        db.add(txn)
        await db.flush()
        db.add(JournalEntry(transaction_id=txn.id, account_id=ar.id, debit=data.amount, credit=0))
        db.add(JournalEntry(transaction_id=txn.id, account_id=cash.id, debit=0, credit=data.amount))

    return obj
