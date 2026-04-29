from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from sqlalchemy.orm import selectinload
from uuid import UUID
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import (
    Invoice, InvoiceLineItem, CreditNote, DebitNote,
    SalesPayment, PaymentAllocation, SalesRefund,
    Transaction, JournalEntry, Account,
)
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
    query = select(Invoice).options(selectinload(Invoice.line_items)).where(Invoice.organization_id == org_id).order_by(Invoice.created_at.desc())
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

    # Use provided invoice_number or auto-generate the next sequential one.
    # Parsing the trailing integer of existing INV-NNNN rows keeps numbers
    # contiguous even after deletes (count-based numbering re-uses values).
    if data.invoice_number:
        invoice_number = data.invoice_number
    else:
        existing = await db.execute(
            select(Invoice.invoice_number).where(
                Invoice.organization_id == org_id,
                Invoice.invoice_number.like("INV-%"),
            )
        )
        max_num = 0
        for (num,) in existing.all():
            try:
                n = int(str(num).split("-")[-1])
                if n > max_num:
                    max_num = n
            except (ValueError, IndexError):
                continue
        invoice_number = f"INV-{max_num + 1:04d}"

    # Calculate totals
    subtotal = 0
    tax_amount = 0
    for item in data.line_items:
        line_total = item.quantity * item.unit_price
        after_disc = line_total - (line_total * (item.discount or 0) / 100)
        tax = after_disc * (item.tax_rate / 100)
        subtotal += after_disc
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
        terms=data.terms,
        billing_address_line1=data.billing_address_line1,
        billing_address_line2=data.billing_address_line2,
        billing_city=data.billing_city,
        billing_state=data.billing_state,
        billing_postcode=data.billing_postcode,
        billing_country=data.billing_country,
    )
    db.add(invoice)
    await db.flush()

    # Add line items — no GL entries at draft stage
    for i, item in enumerate(data.line_items):
        line_total = item.quantity * item.unit_price
        after_disc = line_total - (line_total * (item.discount or 0) / 100)
        db.add(InvoiceLineItem(
            invoice_id=invoice.id,
            line_type=item.line_type,
            description=item.description,
            quantity=item.quantity,
            unit_price=item.unit_price,
            tax_rate=item.tax_rate,
            tax_code_id=item.tax_code_id,
            discount=item.discount or 0,
            amount=after_disc,
            account_id=item.account_id,
            sort_order=i,
        ))

    await db.commit()
    result = await db.execute(
        select(Invoice).options(selectinload(Invoice.line_items)).where(Invoice.id == invoice.id)
    )
    return result.scalar_one()


@router.get("/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(
    invoice_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Invoice).options(selectinload(Invoice.line_items)).where(Invoice.id == invoice_id, Invoice.organization_id == current_user["org_id"])
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
        select(Invoice).options(selectinload(Invoice.line_items)).where(Invoice.id == invoice_id, Invoice.organization_id == org_id)
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

        # Calculate totals (discount applied before tax)
        subtotal = 0
        tax_amount = 0
        for item in data.line_items:
            line_total = item.quantity * item.unit_price
            after_disc = line_total - (line_total * (item.discount or 0) / 100)
            tax = after_disc * (item.tax_rate / 100)
            subtotal += after_disc
            tax_amount += tax

        invoice.subtotal = subtotal
        invoice.tax_amount = tax_amount
        invoice.total = subtotal + tax_amount

        # Insert new line items
        for i, item in enumerate(data.line_items):
            line_total = item.quantity * item.unit_price
            after_disc = line_total - (line_total * (item.discount or 0) / 100)
            db.add(InvoiceLineItem(
                invoice_id=invoice.id,
                line_type=item.line_type,
                description=item.description,
                quantity=item.quantity,
                unit_price=item.unit_price,
                tax_rate=item.tax_rate,
                tax_code_id=item.tax_code_id,
                discount=item.discount or 0,
                amount=after_disc,
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
    org_id = current_user["org_id"]
    result = await db.execute(
        select(Invoice).where(Invoice.id == invoice_id, Invoice.organization_id == org_id)
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


@router.get("/{invoice_id}/activity")
async def invoice_activity(
    invoice_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return a chronological activity timeline for an invoice with running balance.

    Each event represents something that changed the invoice's outstanding balance
    or attached a note: issuance, credit notes, debit notes, payments (via
    PaymentAllocation), refunds (via the credit note that was refunded), and any
    raw GL transactions posted against the invoice (status changes, adjustments).
    """
    org_id = current_user["org_id"]
    result = await db.execute(
        select(Invoice).where(Invoice.id == invoice_id, Invoice.organization_id == org_id)
    )
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    events: list[dict] = []

    events.append({
        "ts": invoice.issue_date.isoformat() if invoice.issue_date else None,
        "type": "issued",
        "ref": invoice.invoice_number,
        "ref_id": str(invoice.id),
        "delta": float(invoice.total or 0),
        "note": invoice.notes or "",
        "status": invoice.status,
    })

    cn_result = await db.execute(
        select(CreditNote).where(CreditNote.invoice_id == invoice_id)
    )
    credit_notes = cn_result.scalars().all()
    for cn in credit_notes:
        events.append({
            "ts": cn.issue_date.isoformat() if cn.issue_date else None,
            "type": "credit_note",
            "ref": cn.credit_note_number,
            "ref_id": str(cn.id),
            "delta": -float(cn.total or 0),
            "note": cn.notes or "",
            "status": cn.status,
        })

    dn_result = await db.execute(
        select(DebitNote).where(DebitNote.invoice_id == invoice_id)
    )
    for dn in dn_result.scalars().all():
        events.append({
            "ts": dn.issue_date.isoformat() if dn.issue_date else None,
            "type": "debit_note",
            "ref": dn.debit_note_number,
            "ref_id": str(dn.id),
            "delta": float(dn.total or 0),
            "note": dn.notes or "",
            "status": dn.status,
        })

    pay_result = await db.execute(
        select(SalesPayment, PaymentAllocation)
        .join(PaymentAllocation, PaymentAllocation.payment_id == SalesPayment.id)
        .where(PaymentAllocation.invoice_id == invoice_id)
    )
    for payment, alloc in pay_result.all():
        events.append({
            "ts": payment.payment_date.isoformat() if payment.payment_date else None,
            "type": "payment",
            "ref": payment.payment_number,
            "ref_id": str(payment.id),
            "delta": -float(alloc.amount or 0),
            "note": payment.notes or "",
            "status": payment.status,
        })

    if credit_notes:
        cn_ids = [cn.id for cn in credit_notes]
        ref_result = await db.execute(
            select(SalesRefund).where(SalesRefund.credit_note_id.in_(cn_ids))
        )
        for refund in ref_result.scalars().all():
            events.append({
                "ts": refund.refund_date.isoformat() if refund.refund_date else None,
                "type": "refund",
                "ref": refund.refund_number,
                "ref_id": str(refund.id),
                "delta": float(refund.amount or 0),
                "note": refund.notes or "",
                "status": refund.status,
            })

    txn_result = await db.execute(
        select(Transaction)
        .where(Transaction.organization_id == org_id, Transaction.source_id == invoice_id)
        .order_by(Transaction.date)
    )
    for txn in txn_result.scalars().all():
        je_result = await db.execute(
            select(JournalEntry, Account)
            .join(Account, Account.id == JournalEntry.account_id)
            .where(JournalEntry.transaction_id == txn.id)
        )
        lines = [
            {
                "account_code": acct.code,
                "account_name": acct.name,
                "debit": float(je.debit or 0),
                "credit": float(je.credit or 0),
            }
            for je, acct in je_result.all()
        ]
        events.append({
            "ts": txn.date.isoformat() if txn.date else None,
            "type": "journal",
            "subtype": txn.source,
            "ref": txn.reference,
            "ref_id": str(txn.id),
            "delta": 0.0,
            "note": txn.description or "",
            "lines": lines,
        })

    events.sort(key=lambda e: (e.get("ts") or "", 0 if e["type"] == "issued" else 1))

    running = 0.0
    for ev in events:
        if ev["type"] != "journal":
            running += ev["delta"]
        ev["balance"] = round(running, 2)

    return {
        "invoice_id": str(invoice_id),
        "invoice_number": invoice.invoice_number,
        "total": float(invoice.total or 0),
        "outstanding": round(running, 2),
        "events": events,
    }


@router.delete("/{invoice_id}", status_code=204)
async def delete_invoice(
    invoice_id: UUID,
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
    if invoice.status in ("paid",):
        raise HTTPException(status_code=400, detail="Cannot delete a paid invoice")
    await db.execute(
        delete(InvoiceLineItem).where(InvoiceLineItem.invoice_id == invoice_id)
    )
    await db.delete(invoice)
    await db.commit()
