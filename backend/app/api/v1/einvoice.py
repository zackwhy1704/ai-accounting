"""
MyInvois (LHDN) e-Invoice endpoints for Malaysia.

Thin router: UBL construction lives in services/einvoice_ubl.py, the LHDN HTTP
client + submission lifecycle in services/einvoice_service.py, tracking rows in
models/einvoice.py (EInvoiceSubmission).

Doc types: invoice 01 · credit note 02 · debit note 03 · refund note 04.
Consolidated e-invoices aggregate a month's cash sales + no-TIN invoices under
the LHDN "General Public" buyer. Cancellation only within 72h of validation.
"""
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_audit
from app.core.database import get_db
from app.core.permissions import require_write
from app.core.security import get_current_user
from app.models.models import (
    Contact, CreditNote, DebitNote, EInvoiceSubmission, Invoice, Organization,
    SalesRefund,
)
from app.services import einvoice_service as svc
from app.services import einvoice_ubl as ubl

router = APIRouter(prefix="/einvoice", tags=["e-invoice"])

_ACTIVE = ("submitted", "valid")  # submission states that block a re-submit


async def _org(db: AsyncSession, org_id) -> Organization:
    org = (await db.execute(select(Organization).where(Organization.id == org_id))).scalar_one_or_none()
    return svc.require_einvoice_org(org)


async def _contact(db: AsyncSession, org_id, contact_id) -> Contact | None:
    if not contact_id:
        return None
    return (await db.execute(
        select(Contact).where(Contact.id == contact_id, Contact.organization_id == org_id)
    )).scalar_one_or_none()


async def _guard_not_already_submitted(db: AsyncSession, org_id, source_type: str, source_id) -> None:
    existing = (await db.execute(
        select(EInvoiceSubmission).where(
            EInvoiceSubmission.organization_id == org_id,
            EInvoiceSubmission.source_type == source_type,
            EInvoiceSubmission.source_id == source_id,
            EInvoiceSubmission.status.in_(_ACTIVE),
        )
    )).scalars().first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Document already submitted (status: {existing.status}). Cancel it first to resubmit.")


def _guard_not_future_dated(issue_date: datetime | None, label: str) -> None:
    """LHDN expects e-Invoices submitted close to the actual transaction date
    (within ~72h) — the issue_date recorded is what LHDN uses to assign the
    document's financial year. Block submitting a document dated in the
    future rather than silently sending a date that doesn't match reality."""
    if issue_date and issue_date.date() > datetime.now(timezone.utc).date():
        raise HTTPException(
            status_code=400,
            detail=f"Cannot submit this {label} to MyInvois — its date ({issue_date.date().isoformat()}) is in the future. "
                   f"LHDN requires the issue date to reflect the actual transaction date.",
        )


async def _invoice_billing_reference(db: AsyncSession, org_id, invoice_id) -> dict | None:
    """BillingReference for CN/DN/refund: original invoice number + LHDN UUID if known."""
    if not invoice_id:
        return None
    inv = (await db.execute(select(Invoice).where(Invoice.id == invoice_id, Invoice.organization_id == org_id))).scalar_one_or_none()
    if not inv:
        return None
    sub = (await db.execute(
        select(EInvoiceSubmission).where(
            EInvoiceSubmission.organization_id == org_id,
            EInvoiceSubmission.source_type == "invoice",
            EInvoiceSubmission.source_id == inv.id,
            EInvoiceSubmission.status == "valid",
        ).order_by(EInvoiceSubmission.created_at.desc())
    )).scalars().first()
    return {"number": inv.invoice_number, "uuid": sub.document_uuid if sub else None}


async def _submit_and_log(db, org, current_user, **kwargs) -> dict:
    sub = await svc.submit_document(db, org, **kwargs)
    await db.commit()
    await log_audit(db, org.id, current_user["sub"], "create", "einvoice_submission", sub.id)
    return {
        "submission_id": str(sub.id), "submission_uid": sub.submission_uid,
        "document_uuid": sub.document_uuid, "status": sub.status,
        "status_reason": sub.status_reason, "sandbox": sub.sandbox,
    }


@router.post("/submit/{invoice_id}")
async def submit_invoice(invoice_id: UUID, db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_write())):
    org = await _org(db, current_user["org_id"])
    inv = (await db.execute(
        select(Invoice).options(selectinload(Invoice.line_items))
        .where(Invoice.id == invoice_id, Invoice.organization_id == org.id)
    )).scalar_one_or_none()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if inv.status in ("draft", "void", "cancelled"):
        raise HTTPException(status_code=400, detail=f"Cannot submit a {inv.status} invoice")
    await _guard_not_already_submitted(db, org.id, "invoice", inv.id)
    _guard_not_future_dated(inv.issue_date, "invoice")
    return await _submit_and_log(
        db, org, current_user,
        source_type="invoice", source_id=inv.id, doc_type_code=ubl.DOC_TYPE_INVOICE,
        number=inv.invoice_number, issue_datetime=inv.issue_date or datetime.now(timezone.utc),
        currency=inv.currency or "MYR", exchange_rate=float(inv.exchange_rate or 1),
        buyer=svc.buyer_dict(await _contact(db, org.id, inv.contact_id)),
        lines=await svc.resolve_lines(db, org.id, inv.line_items),
        subtotal=float(inv.subtotal or 0), tax_amount=float(inv.tax_amount or 0), total=float(inv.total or 0),
    )


@router.post("/submit/credit-note/{cn_id}")
async def submit_credit_note(cn_id: UUID, db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_write())):
    org = await _org(db, current_user["org_id"])
    cn = (await db.execute(
        select(CreditNote).options(selectinload(CreditNote.line_items))
        .where(CreditNote.id == cn_id, CreditNote.organization_id == org.id)
    )).scalar_one_or_none()
    if not cn:
        raise HTTPException(status_code=404, detail="Credit note not found")
    if cn.status in ("draft", "void"):
        raise HTTPException(status_code=400, detail=f"Cannot submit a {cn.status} credit note")
    await _guard_not_already_submitted(db, org.id, "credit_note", cn.id)
    _guard_not_future_dated(cn.issue_date, "credit note")
    return await _submit_and_log(
        db, org, current_user,
        source_type="credit_note", source_id=cn.id, doc_type_code=ubl.DOC_TYPE_CREDIT_NOTE,
        number=cn.credit_note_number, issue_datetime=cn.issue_date or datetime.now(timezone.utc),
        currency=cn.currency or "MYR", exchange_rate=float(cn.exchange_rate or 1),
        buyer=svc.buyer_dict(await _contact(db, org.id, cn.contact_id)),
        lines=await svc.resolve_lines(db, org.id, cn.line_items),
        subtotal=float(cn.subtotal or 0), tax_amount=float(cn.tax_amount or 0), total=float(cn.total or 0),
        billing_reference=await _invoice_billing_reference(db, org.id, cn.invoice_id),
    )


@router.post("/submit/debit-note/{dn_id}")
async def submit_debit_note(dn_id: UUID, db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_write())):
    org = await _org(db, current_user["org_id"])
    dn = (await db.execute(
        select(DebitNote).options(selectinload(DebitNote.line_items))
        .where(DebitNote.id == dn_id, DebitNote.organization_id == org.id)
    )).scalar_one_or_none()
    if not dn:
        raise HTTPException(status_code=404, detail="Debit note not found")
    if dn.status in ("draft", "void"):
        raise HTTPException(status_code=400, detail=f"Cannot submit a {dn.status} debit note")
    await _guard_not_already_submitted(db, org.id, "debit_note", dn.id)
    _guard_not_future_dated(dn.issue_date, "debit note")
    return await _submit_and_log(
        db, org, current_user,
        source_type="debit_note", source_id=dn.id, doc_type_code=ubl.DOC_TYPE_DEBIT_NOTE,
        number=dn.debit_note_number, issue_datetime=dn.issue_date or datetime.now(timezone.utc),
        currency=dn.currency or "MYR", exchange_rate=float(dn.exchange_rate or 1),
        buyer=svc.buyer_dict(await _contact(db, org.id, dn.contact_id)),
        lines=await svc.resolve_lines(db, org.id, dn.line_items),
        subtotal=float(dn.subtotal or 0), tax_amount=float(dn.tax_amount or 0), total=float(dn.total or 0),
        billing_reference=await _invoice_billing_reference(db, org.id, dn.invoice_id),
    )


@router.post("/submit/refund/{refund_id}")
async def submit_refund(refund_id: UUID, db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_write())):
    org = await _org(db, current_user["org_id"])
    rf = (await db.execute(
        select(SalesRefund).where(SalesRefund.id == refund_id, SalesRefund.organization_id == org.id)
    )).scalar_one_or_none()
    if not rf:
        raise HTTPException(status_code=404, detail="Refund not found")
    if rf.status == "void":
        raise HTTPException(status_code=400, detail="Cannot submit a voided refund")
    await _guard_not_already_submitted(db, org.id, "refund", rf.id)
    _guard_not_future_dated(rf.refund_date, "refund")
    # Refund notes reference the credit note's original invoice when available
    billing_ref = None
    if rf.credit_note_id:
        cn = (await db.execute(select(CreditNote).where(CreditNote.id == rf.credit_note_id))).scalar_one_or_none()
        if cn:
            billing_ref = await _invoice_billing_reference(db, org.id, cn.invoice_id) or {"number": cn.credit_note_number}
    amount = float(rf.amount or 0)
    return await _submit_and_log(
        db, org, current_user,
        source_type="refund", source_id=rf.id, doc_type_code=ubl.DOC_TYPE_REFUND_NOTE,
        number=rf.refund_number, issue_datetime=rf.refund_date or datetime.now(timezone.utc),
        currency=rf.currency or "MYR", exchange_rate=float(rf.exchange_rate or 1),
        buyer=svc.buyer_dict(await _contact(db, org.id, rf.contact_id)),
        lines=[{"description": f"Refund {rf.refund_number}", "quantity": 1, "unit_price": amount,
                "amount": amount, "tax_rate": 0, "tax_amount": 0}],
        subtotal=amount, tax_amount=0.0, total=amount, billing_reference=billing_ref,
    )


@router.get("/status/{submission_uid}")
async def check_status(submission_uid: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Poll LHDN and sync our tracking rows (valid/invalid/cancelled, long ID, link)."""
    org = await _org(db, current_user["org_id"])
    body = await svc.refresh_submission_status(db, org, submission_uid)
    await db.commit()
    return body


class CancelRequest(BaseModel):
    reason: str


@router.post("/cancel/{submission_id}")
async def cancel_submission(submission_id: UUID, payload: CancelRequest, db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_write())):
    org = await _org(db, current_user["org_id"])
    sub = (await db.execute(select(EInvoiceSubmission).where(
        EInvoiceSubmission.id == submission_id, EInvoiceSubmission.organization_id == org.id
    ))).scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    await svc.cancel_document(db, org, sub, payload.reason)
    await db.commit()
    await log_audit(db, org.id, current_user["sub"], "void", "einvoice_submission", sub.id, {"reason": payload.reason})
    return {"submission_id": str(sub.id), "status": sub.status, "cancelled_at": sub.cancelled_at.isoformat()}
