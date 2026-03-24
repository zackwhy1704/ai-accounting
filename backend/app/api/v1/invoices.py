from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from uuid import UUID
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import Invoice, InvoiceLineItem, Contact, Transaction, JournalEntry, Account
from app.schemas.schemas import InvoiceCreate, InvoiceResponse

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

    # Add line items
    for i, item in enumerate(data.line_items):
        amount = item.quantity * item.unit_price
        line = InvoiceLineItem(
            invoice_id=invoice.id,
            description=item.description,
            quantity=item.quantity,
            unit_price=item.unit_price,
            tax_rate=item.tax_rate,
            amount=amount,
            account_id=item.account_id,
            sort_order=i,
        )
        db.add(line)

    # Create double-entry journal transaction
    # Debit: Accounts Receivable, Credit: Revenue + GST Payable
    ar_account = await db.execute(
        select(Account).where(Account.organization_id == org_id, Account.code == "1100")
    )
    ar = ar_account.scalar_one_or_none()

    revenue_account = await db.execute(
        select(Account).where(Account.organization_id == org_id, Account.code == "4000")
    )
    rev = revenue_account.scalar_one_or_none()

    if ar and rev:
        txn = Transaction(
            organization_id=org_id,
            date=data.issue_date,
            description=f"Invoice {invoice_number}",
            reference=invoice_number,
            source="invoice",
            source_id=invoice.id,
        )
        db.add(txn)
        await db.flush()

        # Debit AR for total
        db.add(JournalEntry(transaction_id=txn.id, account_id=ar.id, debit=subtotal + tax_amount, credit=0))
        # Credit Revenue for subtotal
        db.add(JournalEntry(transaction_id=txn.id, account_id=rev.id, debit=0, credit=subtotal))
        # Credit GST Payable for tax
        if tax_amount > 0:
            gst_account = await db.execute(
                select(Account).where(Account.organization_id == org_id, Account.code == "2100")
            )
            gst = gst_account.scalar_one_or_none()
            if gst:
                db.add(JournalEntry(transaction_id=txn.id, account_id=gst.id, debit=0, credit=tax_amount))

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

    invoice.status = status

    # If paid, create payment journal entry
    if status == "paid" and invoice.amount_paid < invoice.total:
        invoice.amount_paid = invoice.total
        # Debit: Cash, Credit: AR
        org_id = current_user["org_id"]
        cash = (await db.execute(select(Account).where(Account.organization_id == org_id, Account.code == "1000"))).scalar_one_or_none()
        ar = (await db.execute(select(Account).where(Account.organization_id == org_id, Account.code == "1100"))).scalar_one_or_none()

        if cash and ar:
            txn = Transaction(
                organization_id=org_id,
                date=invoice.due_date,
                description=f"Payment received for {invoice.invoice_number}",
                reference=invoice.invoice_number,
                source="invoice",
                source_id=invoice.id,
            )
            db.add(txn)
            await db.flush()
            db.add(JournalEntry(transaction_id=txn.id, account_id=cash.id, debit=float(invoice.total), credit=0))
            db.add(JournalEntry(transaction_id=txn.id, account_id=ar.id, debit=0, credit=float(invoice.total)))

    return {"status": invoice.status}
