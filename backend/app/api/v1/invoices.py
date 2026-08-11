from fastapi import APIRouter, Depends, HTTPException, Query, Body, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, update
from sqlalchemy.orm import selectinload
from uuid import UUID
from datetime import datetime, timezone
from pydantic import BaseModel
from sqlalchemy import func, or_
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import require_write
from app.core.pagination import PaginationParams, paginated_result, apply_sort
from app.models.models import (
    Invoice, InvoiceLineItem, CreditNote, DebitNote, CreditApplication,
    SalesPayment, PaymentAllocation, SalesRefund,
    Transaction, JournalEntry, Account, DeliveryOrder, Document, Contact,
)
from app.schemas.schemas import InvoiceCreate, InvoiceUpdate, InvoiceResponse
from app.core.line_items import calculate_line_items
from app.core.audit import log_audit
from app.services.pricing import line_after_discount, line_tax
from .gl_helpers import post_gl, post_gl_by_id, revert_gl
from app.core.org_defaults import get_default_accounts
from app.services.gl_posting import post_invoice_gl
from app.services.fx import document_rate
from app.core.list_helpers import with_contact_name

router = APIRouter(prefix="/invoices", tags=["Invoices"])


@router.get("")
async def list_invoices(
    status: str | None = None,
    contact_id: UUID | None = None,
    p: PaginationParams = Depends(),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = current_user["org_id"]
    base = select(Invoice).where(Invoice.organization_id == org_id)
    if status:
        base = base.where(Invoice.status == status)
    if contact_id:
        base = base.where(Invoice.contact_id == contact_id)
    if p.search:
        like = f"%{p.search}%"
        contact_match = select(Contact.id).where(
            Contact.organization_id == org_id, Contact.name.ilike(like)
        )
        base = base.where(or_(
            Invoice.invoice_number.ilike(like),
            Invoice.contact_id.in_(contact_match),
        ))
    if p.date_from:
        base = base.where(Invoice.issue_date >= p.date_from)
    if p.date_to:
        base = base.where(Invoice.issue_date <= p.date_to)

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    query = apply_sort(base, Invoice, p).options(
        selectinload(Invoice.line_items), selectinload(Invoice.contact)
    ).offset(p.offset).limit(p.limit)
    items = (await db.execute(query)).scalars().all()
    items = [with_contact_name(InvoiceResponse, i) for i in items]
    return paginated_result(items, total, p)


@router.post("", response_model=InvoiceResponse, status_code=201)
async def create_invoice(
    data: InvoiceCreate,
    current_user: dict = Depends(require_write()),
    db: AsyncSession = Depends(get_db),
):
    org_id = current_user["org_id"]

    # Validate the referenced contact exists in this org BEFORE inserting, so a
    # bad/foreign contact_id returns a clean 404 instead of leaking a raw FK
    # IntegrityError 500 to the toast.
    if data.contact_id:
        exists = (await db.execute(
            select(Contact.id).where(Contact.id == data.contact_id, Contact.organization_id == org_id)
        )).scalar_one_or_none()
        if exists is None:
            raise HTTPException(status_code=404, detail="Contact not found")

    if data.invoice_number:
        invoice_number = data.invoice_number
    else:
        from app.core.sequences import next_sequence_number
        invoice_number = await next_sequence_number(db, Invoice, Invoice.invoice_number, org_id, "INV")

    # Calculate totals
    items = [li.model_dump() for li in data.line_items]
    subtotal, tax_amount, _, total = calculate_line_items(items)

    # Payment terms automation: if the contact has default terms and no explicit
    # later due date was given, derive due_date = issue_date + terms days.
    due_date = data.due_date
    if data.contact_id and data.issue_date:
        from datetime import timedelta as _td
        contact = (await db.execute(
            select(Contact).where(Contact.id == data.contact_id, Contact.organization_id == org_id)
        )).scalar_one_or_none()
        terms_days = getattr(contact, "default_payment_terms_days", None) if contact else None
        if terms_days and (due_date is None or due_date <= data.issue_date):
            due_date = data.issue_date + _td(days=int(terms_days))

    invoice = Invoice(
        organization_id=org_id,
        contact_id=data.contact_id,
        invoice_number=invoice_number,
        issue_date=data.issue_date,
        due_date=due_date,
        subtotal=subtotal,
        tax_amount=tax_amount,
        total=total,
        currency=data.currency,
        exchange_rate=await document_rate(db, org_id, data.currency, data.issue_date),
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
    for i, item in enumerate(items):
        db.add(InvoiceLineItem(invoice_id=invoice.id, sort_order=i, **item))

    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "create", "invoice", invoice.id)
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
    current_user: dict = Depends(require_write()),
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
        await db.execute(delete(InvoiceLineItem).where(InvoiceLineItem.invoice_id == invoice.id))

        # Calculate totals
        new_items = [li.model_dump() for li in data.line_items]
        subtotal, tax_amount, _, total = calculate_line_items(new_items)
        invoice.subtotal = subtotal
        invoice.tax_amount = tax_amount
        invoice.total = total

        # Insert new line items
        for i, item in enumerate(new_items):
            db.add(InvoiceLineItem(invoice_id=invoice.id, sort_order=i, **item))

    # Apply scalar field updates
    for field, value in update_data.items():
        setattr(invoice, field, value)

    # Re-snapshot the FX rate while still draft (currency/date may have changed);
    # once posted the booked rate is frozen.
    if invoice.status == "draft":
        invoice.exchange_rate = await document_rate(db, org_id, invoice.currency, invoice.issue_date)

    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "update", "invoice", invoice_id)
    result2 = await db.execute(
        select(Invoice).options(selectinload(Invoice.line_items)).where(Invoice.id == invoice_id)
    )
    return result2.scalar_one()


@router.patch("/{invoice_id}/status")
async def update_invoice_status(
    invoice_id: UUID,
    status: str,
    current_user: dict = Depends(require_write()),
    db: AsyncSession = Depends(get_db),
):
    org_id = current_user["org_id"]
    result = await db.execute(
        select(Invoice).where(Invoice.id == invoice_id, Invoice.organization_id == org_id)
    )
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Include outstanding/partially_paid: the system already sets these internally
    # (via payments / credit notes) and reports depend on them, so the manual
    # endpoint's valid set must recognise them rather than reject the app's own
    # lifecycle vocabulary.
    valid_statuses = {"draft", "sent", "viewed", "outstanding", "partially_paid", "paid", "overdue", "cancelled", "void"}
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")

    # Block voiding an invoice that still has payments applied
    if status in ("void", "cancelled") and invoice.status not in ("void", "cancelled"):
        if float(invoice.amount_paid or 0) > 0:
            raise HTTPException(status_code=400, detail="This invoice has payments applied. Remove or void the payments first before voiding the invoice.")

    prev_status = invoice.status
    invoice.status = status

    # draft → finalized (sent/outstanding/...): post Dr AR / Cr Revenue (+ Cr GST
    # Payable). Any non-draft target finalizes the invoice and must post the GL
    # once, so a user finalizing straight to 'outstanding' doesn't leave the books
    # unbalanced.
    _POSTED = {"sent", "viewed", "outstanding", "partially_paid", "overdue"}
    if status in _POSTED and prev_status == "draft":
        # Use the stored doc-date rate; drafts created before a rate was on file
        # (snapshot 1.0) get one last lookup at posting time.
        rate = float(invoice.exchange_rate or 1.0)
        if rate == 1.0:
            rate = await document_rate(db, org_id, invoice.currency, invoice.issue_date)
            invoice.exchange_rate = rate
        await post_invoice_gl(
            db, org_id,
            issue_date=invoice.issue_date,
            number=invoice.invoice_number,
            invoice_id=invoice.id,
            subtotal=float(invoice.subtotal),
            tax_amount=float(invoice.tax_amount),
            total=float(invoice.total),
            rate=rate,
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
    action = "void" if status in ("void", "cancelled") else "status_change"
    await log_audit(db, current_user["org_id"], current_user["sub"], action, "invoice", invoice_id, {"status": status})
    return {"status": invoice.status}


@router.get("/{invoice_id}/journal-entries")
async def invoice_journal_entries(
    invoice_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all GL transactions posted against this invoice, formatted for display."""
    org_id = current_user["org_id"]
    result = await db.execute(
        select(Invoice).where(Invoice.id == invoice_id, Invoice.organization_id == org_id)
    )
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    txn_result = await db.execute(
        select(Transaction)
        .where(Transaction.organization_id == org_id, Transaction.source_id == invoice_id)
        .order_by(Transaction.date)
    )
    journal_events = []
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
        journal_events.append({
            "ts": txn.date.isoformat() if txn.date else None,
            "type": "journal",
            "subtype": txn.source,
            "ref": txn.reference,
            "ref_id": str(txn.id),
            "description": txn.description or "",
            "lines": lines,
        })
    return {"invoice_id": str(invoice_id), "journal_entries": journal_events}


async def _load_invoice_for_pdf(db, org_id, invoice_id):
    from app.models.auth import Organization
    inv = (await db.execute(
        select(Invoice).options(selectinload(Invoice.line_items)).where(
            Invoice.id == invoice_id, Invoice.organization_id == org_id)
    )).scalar_one_or_none()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    org = (await db.execute(select(Organization).where(Organization.id == org_id))).scalar_one_or_none()
    contact = (await db.execute(select(Contact).where(Contact.id == inv.contact_id))).scalar_one_or_none() if inv.contact_id else None
    line_items = sorted(inv.line_items, key=lambda li: getattr(li, "sort_order", 0))
    return inv, org, contact, line_items


@router.get("/{invoice_id}/pdf")
async def get_invoice_pdf(
    invoice_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate the invoice as a PDF (inline)."""
    from app.services.invoice_pdf import render_invoice_pdf
    inv, org, contact, line_items = await _load_invoice_for_pdf(db, current_user["org_id"], invoice_id)
    pdf = render_invoice_pdf(inv, org, contact, line_items)
    return Response(
        content=pdf, media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{inv.invoice_number}.pdf"'},
    )


@router.post("/{invoice_id}/send-email")
async def send_invoice_email(
    invoice_id: UUID,
    body: dict = Body(...),
    current_user: dict = Depends(require_write()),
    db: AsyncSession = Depends(get_db),
):
    """Email the invoice PDF to a recipient via Resend. body: {to, subject, message}."""
    import base64
    from app.core.config import get_settings
    from app.services.invoice_pdf import render_invoice_pdf
    settings = get_settings()

    inv, org, contact, line_items = await _load_invoice_for_pdf(db, current_user["org_id"], invoice_id)
    to = (body.get("to") or (contact.email if contact else None) or "").strip()
    if not to:
        raise HTTPException(status_code=400, detail="No recipient email. Provide 'to' or set the contact's email.")
    if not settings.RESEND_API_KEY:
        raise HTTPException(status_code=503, detail="Email is not configured (RESEND_API_KEY missing)")

    subject = body.get("subject") or f"Invoice {inv.invoice_number} from {getattr(org, 'name', '')}"
    message = body.get("message") or f"Please find attached invoice {inv.invoice_number}."
    pdf = render_invoice_pdf(inv, org, contact, line_items)

    try:
        import resend
        resend.api_key = settings.RESEND_API_KEY
        resend.Emails.send({
            "from": settings.EMAIL_FROM,
            "to": [to],
            "subject": subject,
            "html": f"<p>{message}</p>",
            "attachments": [{
                "filename": f"{inv.invoice_number}.pdf",
                "content": base64.b64encode(pdf).decode("ascii"),
            }],
        })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to send email: {e}")

    await log_audit(db, current_user["org_id"], current_user["sub"], "email_sent", "invoice", invoice_id, {"to": to})
    return {"status": "sent", "to": to, "invoice_number": inv.invoice_number}


@router.get("/{invoice_id}/activity")
async def invoice_activity(
    invoice_id: UUID,
    include_journals: bool = Query(False, description="Include GL journal entries in timeline (default off)"),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return a chronological activity timeline for an invoice with running balance.

    Each event represents something that changed the invoice's outstanding balance
    or attached a note: issuance, credit notes, debit notes, payments (via
    PaymentAllocation), refunds (via the credit note that was refunded).
    Use /journal-entries for the GL double-entry view.
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

    # Credit notes affect this invoice in two ways:
    #  1. Raised directly against it (CreditNote.invoice_id == this invoice), or
    #  2. Created standalone then APPLIED to it via the CreditApplication table.
    # Collect both so the activity timeline (and the refund lookup below) is complete.
    app_result = await db.execute(
        select(CreditApplication).where(CreditApplication.invoice_id == invoice_id)
    )
    applications = app_result.scalars().all()
    applied_cn_ids = [app.credit_note_id for app in applications]

    direct_cn_result = await db.execute(
        select(CreditNote).where(CreditNote.invoice_id == invoice_id)
    )
    direct_cns = direct_cn_result.scalars().all()
    direct_cn_ids = [cn.id for cn in direct_cns]

    all_cn_ids = list({*applied_cn_ids, *direct_cn_ids})
    if all_cn_ids:
        cn_full_result = await db.execute(
            select(CreditNote).where(CreditNote.id.in_(all_cn_ids))
        )
        credit_notes = list(cn_full_result.scalars().all())
    else:
        credit_notes = []
    cn_by_id = {cn.id: cn for cn in credit_notes}

    # Directly-raised CNs: show the CN issuance event.
    for cn in direct_cns:
        events.append({
            "ts": cn.issue_date.isoformat() if cn.issue_date else None,
            "type": "credit_note",
            "ref": cn.credit_note_number,
            "ref_id": str(cn.id),
            "delta": -float(cn.total or 0),
            "note": cn.notes or "",
            "status": cn.status,
        })

    # Applied CNs: show the application event (date + amount applied, which may
    # differ from the CN's own issue date/total).
    for app in applications:
        cn = cn_by_id.get(app.credit_note_id)
        events.append({
            "ts": app.applied_at.isoformat() if app.applied_at else None,
            "type": "credit_applied",
            "ref": cn.credit_note_number if cn else str(app.credit_note_id),
            "ref_id": str(app.credit_note_id),
            "delta": -float(app.amount or 0),
            "note": "Credit note applied",
            "status": cn.status if cn else "unknown",
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

    if include_journals:
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
    current_user: dict = Depends(require_write()),
    db: AsyncSession = Depends(get_db),
):
    org_id = current_user["org_id"]
    result = await db.execute(
        select(Invoice).where(Invoice.id == invoice_id, Invoice.organization_id == org_id)
    )
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if float(invoice.amount_paid or 0) > 0:
        raise HTTPException(status_code=400, detail="This invoice has payments applied. Void it first to remove the payments before deleting.")
    if invoice.status not in ("draft", "void", "cancelled"):
        raise HTTPException(status_code=400, detail="Only draft, void, or cancelled invoices can be deleted. Void the invoice first.")
    # Null out nullable FKs on related tables so the delete isn't blocked
    await db.execute(update(CreditNote).where(CreditNote.invoice_id == invoice_id).values(invoice_id=None))
    await db.execute(update(DebitNote).where(DebitNote.invoice_id == invoice_id).values(invoice_id=None))
    await db.execute(update(DeliveryOrder).where(DeliveryOrder.invoice_id == invoice_id).values(invoice_id=None))
    await db.execute(update(Document).where(Document.linked_invoice_id == invoice_id).values(linked_invoice_id=None))
    await db.execute(delete(InvoiceLineItem).where(InvoiceLineItem.invoice_id == invoice_id))
    await db.delete(invoice)
    await db.commit()
    await log_audit(db, org_id, current_user["sub"], "delete", "invoice", invoice_id)


class ApplyCreditRequest(BaseModel):
    target_invoice_id: UUID
    amount: float


@router.post("/{invoice_id}/apply-overpaid")
async def apply_overpaid_to_invoice(
    invoice_id: UUID,
    body: ApplyCreditRequest,
    current_user: dict = Depends(require_write()),
    db: AsyncSession = Depends(get_db),
):
    """Apply the overpaid credit from one invoice to reduce the balance of another."""
    org_id = current_user["org_id"]

    src = (await db.execute(
        select(Invoice).where(Invoice.id == invoice_id, Invoice.organization_id == org_id)
    )).scalar_one_or_none()
    if not src:
        raise HTTPException(status_code=404, detail="Source invoice not found")

    overpaid = float(src.amount_paid or 0) - float(src.total or 0)
    if overpaid <= 0:
        raise HTTPException(status_code=400, detail="Invoice is not overpaid")
    if body.amount <= 0 or body.amount > overpaid:
        raise HTTPException(status_code=400, detail=f"Amount must be between 0 and {overpaid:.2f}")

    tgt = (await db.execute(
        select(Invoice).where(Invoice.id == body.target_invoice_id, Invoice.organization_id == org_id)
    )).scalar_one_or_none()
    if not tgt:
        raise HTTPException(status_code=404, detail="Target invoice not found")
    if tgt.id == src.id:
        raise HTTPException(status_code=400, detail="Cannot apply to the same invoice")

    # Deduct from source's overpaid amount by reducing amount_paid
    src.amount_paid = float(src.amount_paid or 0) - body.amount
    src.mark_paid()

    # Apply to target invoice
    tgt.amount_paid = float(tgt.amount_paid or 0) + body.amount
    tgt.mark_paid()

    await db.commit()
    return {"applied": body.amount, "source_invoice_id": str(invoice_id), "target_invoice_id": str(body.target_invoice_id)}


class RefundOverpaidRequest(BaseModel):
    amount: float
    payment_date: str | None = None
    notes: str | None = None
    bank_account_id: str | None = None


@router.post("/{invoice_id}/refund-overpaid")
async def refund_overpaid(
    invoice_id: UUID,
    body: RefundOverpaidRequest,
    current_user: dict = Depends(require_write()),
    db: AsyncSession = Depends(get_db),
):
    """Issue a refund for the overpaid amount on an invoice."""
    org_id = current_user["org_id"]

    inv = (await db.execute(
        select(Invoice).where(Invoice.id == invoice_id, Invoice.organization_id == org_id)
    )).scalar_one_or_none()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    overpaid = float(inv.amount_paid or 0) - float(inv.total or 0)
    if overpaid <= 0:
        raise HTTPException(status_code=400, detail="Invoice is not overpaid")
    if body.amount <= 0 or body.amount > overpaid:
        raise HTTPException(status_code=400, detail=f"Amount must be between 0 and {overpaid:.2f}")

    from app.core.sequences import next_sequence_number
    from app.models.models import SalesRefund
    ref_number = await next_sequence_number(db, SalesRefund, SalesRefund.refund_number, org_id, "REF")
    if body.payment_date:
        refund_date = datetime.fromisoformat(body.payment_date).replace(tzinfo=timezone.utc)
    else:
        refund_date = datetime.now(timezone.utc)

    bank_account_uuid = None
    if body.bank_account_id:
        try:
            from uuid import UUID as _UUID
            bank_account_uuid = _UUID(body.bank_account_id)
        except ValueError:
            pass

    refund = SalesRefund(
        organization_id=org_id,
        contact_id=inv.contact_id,
        refund_number=ref_number,
        refund_date=refund_date,
        amount=body.amount,
        bank_account_id=bank_account_uuid,
        status="completed",
        refund_method="bank_transfer",
        notes=body.notes or f"Refund of overpayment on invoice {inv.invoice_number}",
        currency=inv.currency or "MYR",
    )
    db.add(refund)
    await db.flush()

    # Deduct from invoice amount_paid and update status
    inv.amount_paid = float(inv.amount_paid or 0) - body.amount
    inv.mark_paid()

    # GL: Dr AR (1100) / Cr Cash/Bank (1000)
    from .gl_helpers import post_gl
    await post_gl(
        db, org_id, refund_date,
        f"Refund {ref_number}",
        ref_number, "refund", refund.id,
        [("1100", body.amount, 0), ("1000", 0, body.amount)],
    )

    await db.commit()
    return {"refund_number": ref_number, "amount": body.amount}
