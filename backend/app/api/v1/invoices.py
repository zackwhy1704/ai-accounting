from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from uuid import UUID
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import Invoice, InvoiceLineItem
from app.schemas.schemas import InvoiceCreate, InvoiceUpdate, InvoiceResponse
from .gl_helpers import post_gl, revert_gl

router = APIRouter(prefix="/invoices", tags=["Invoices"])


@router.get("", response_model=list[InvoiceResponse])
async def list_invoices(
    status: str | None = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = current_user["org_id"]
    query = select(Invoice).where(Invoice.organization_id == org_id).order_by(Invoice.created_at.desc())
    if status:
        query = query.where(Invoice.status == status)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=InvoiceResponse, status_code=201)
async def create_invoice(
    data: InvoiceCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = current_user["org_id"]

    # Generate invoice number
    count_result = await db.execute(
        select(func.count(Invoice.id)).where(Invoice.organization_id == org_id)
    )
    count = count_result.scalar() or 0
    invoice_number = f"INV-{count + 1:04d}"

    # Calculate totals
    subtotal = 0
    tax_amount = 0
    for item in data.line_items:
        amount = item.quantity * item.unit_price
        tax = amount * (item.tax_rate / 100)
        subtotal += amount
        tax_amount += tax

    invoice = Invoice(
        organization_id=org_id,
        contact_id=data.contact_id,
        invoice_number=invoice_number,
        issue_date=data.issue_date,
        due_date=data.due_date,
        subtotal=subtotal,
        tax_amount=tax_amount,
        total=subtotal + tax_amount,
        currency=data.currency,
        notes=data.notes,
    )
    db.add(invoice)
    await db.flush()

    # Add line items — no GL entries at draft stage
    for i, item in enumerate(data.line_items):
        db.add(InvoiceLineItem(
            invoice_id=invoice.id,
            description=item.description,
            quantity=item.quantity,
            unit_price=item.unit_price,
            tax_rate=item.tax_rate,
            amount=item.quantity * item.unit_price,
            account_id=item.account_id,
            sort_order=i,
        ))

    await db.commit()
    await db.refresh(invoice)
    return invoice


@router.get("/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(
    invoice_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Invoice).where(Invoice.id == invoice_id, Invoice.organization_id == current_user["org_id"])
    )
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return invoice


@router.patch("/{invoice_id}", response_model=InvoiceResponse)
async def update_invoice(
    invoice_id: UUID,
    data: InvoiceUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = current_user["org_id"]
    result = await db.execute(
        select(Invoice).where(Invoice.id == invoice_id, Invoice.organization_id == org_id)
    )
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    update_data = data.model_dump(exclude_unset=True)

    if "line_items" in update_data:
        line_items_data = update_data.pop("line_items")

        # Delete old line items
        old_items_result = await db.execute(
            select(InvoiceLineItem).where(InvoiceLineItem.invoice_id == invoice.id)
        )
        for old_item in old_items_result.scalars().all():
            await db.delete(old_item)

        # Calculate totals
        subtotal = 0
        tax_amount = 0
        for item in data.line_items:
            amount = item.quantity * item.unit_price
            tax = amount * (item.tax_rate / 100)
            subtotal += amount
            tax_amount += tax

        invoice.subtotal = subtotal
        invoice.tax_amount = tax_amount
        invoice.total = subtotal + tax_amount

        # Insert new line items
        for i, item in enumerate(data.line_items):
            db.add(InvoiceLineItem(
                invoice_id=invoice.id,
                description=item.description,
                quantity=item.quantity,
                unit_price=item.unit_price,
                tax_rate=item.tax_rate,
                amount=item.quantity * item.unit_price,
                account_id=item.account_id,
                sort_order=i,
            ))

    # Apply scalar field updates
    for field, value in update_data.items():
        setattr(invoice, field, value)

    await db.commit()
    await db.refresh(invoice)
    return invoice


@router.patch("/{invoice_id}/status")
async def update_invoice_status(
    invoice_id: UUID,
    status: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Invoice).where(Invoice.id == invoice_id, Invoice.organization_id == current_user["org_id"])
    )
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    valid_statuses = {"draft", "sent", "viewed", "paid", "overdue", "cancelled"}
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")

    prev_status = invoice.status
    invoice.status = status

    # draft → sent: post Dr AR / Cr Revenue (+ Cr GST Payable)
    if status == "sent" and prev_status == "draft":
        subtotal = float(invoice.subtotal)
        tax_amount = float(invoice.tax_amount)
        total = float(invoice.total)
        entries = [
            ("1100", total, 0),
            ("4000", 0, subtotal),
        ]
        if tax_amount > 0:
            entries.append(("2100", 0, tax_amount))
        await post_gl(
            db, org_id, invoice.issue_date,
            f"Invoice {invoice.invoice_number}",
            invoice.invoice_number, "invoice", invoice.id, entries,
        )

    # cancelled: reverse any previously posted GL entries
    elif status == "cancelled" and prev_status != "draft":
        await revert_gl(
            db, org_id, invoice.id, "invoice",
            invoice.issue_date,
            f"Reversal: Invoice {invoice.invoice_number} cancelled",
            invoice.invoice_number,
        )

    await db.commit()
    return {"status": invoice.status}
