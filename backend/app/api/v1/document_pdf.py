"""
PDF + email for every sales/purchase document (invoices have their own
endpoints; this covers the other nine document types with one registry):

  GET  /pdf/{kind}/{doc_id}             — inline PDF
  POST /pdf/{kind}/{doc_id}/send-email  — email it via Resend {to?, subject?, message?}
  GET  /pdf/statement/{contact_id}      — statement of account PDF

kinds: quotations · sales-orders · delivery-orders · credit-notes ·
debit-notes · sale-receipts · purchase-orders · goods-received-notes ·
purchase-credit-notes · purchase-debit-notes
"""
import base64
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_audit
from app.core.database import get_db
from app.core.permissions import require_write
from app.core.security import get_current_user
from app.models.auth import Organization
from app.models.models import (
    Contact, CreditNote, DebitNote, DeliveryOrder, GoodsReceivedNote,
    PurchaseCreditNote, PurchaseDebitNote, PurchaseOrder, Quotation,
    SaleReceipt, SalesOrder,
)
from app.services.document_pdf import (
    render_document_pdf, render_statement_pdf, standard_line_rows, standard_totals,
)

router = APIRouter(prefix="/pdf", tags=["document-pdf"])

# kind -> (model, title, number_attr, date_attr, date_label, contact_label, qty_attr)
REGISTRY: dict[str, tuple] = {
    "quotations": (Quotation, "QUOTATION", "quotation_number", "issue_date", "Issue date", "BILL TO", "quantity"),
    "sales-orders": (SalesOrder, "SALES ORDER", "order_number", "issue_date", "Order date", "BILL TO", "quantity"),
    "delivery-orders": (DeliveryOrder, "DELIVERY ORDER", "delivery_number", "delivery_date", "Delivery date", "DELIVER TO", "quantity"),
    "credit-notes": (CreditNote, "CREDIT NOTE", "credit_note_number", "issue_date", "Issue date", "BILL TO", "quantity"),
    "debit-notes": (DebitNote, "DEBIT NOTE", "debit_note_number", "issue_date", "Issue date", "BILL TO", "quantity"),
    "sale-receipts": (SaleReceipt, "RECEIPT", "receipt_number", "receipt_date", "Receipt date", "RECEIVED FROM", "quantity"),
    "purchase-orders": (PurchaseOrder, "PURCHASE ORDER", "po_number", "issue_date", "Order date", "VENDOR", "quantity"),
    "goods-received-notes": (GoodsReceivedNote, "GOODS RECEIVED NOTE", "grn_number", "received_date", "Received date", "VENDOR", "quantity_received"),
    "purchase-credit-notes": (PurchaseCreditNote, "PURCHASE CREDIT NOTE", "pcn_number", "issue_date", "Issue date", "VENDOR", "quantity"),
    "purchase-debit-notes": (PurchaseDebitNote, "PURCHASE DEBIT NOTE", "debit_note_number", "issue_date", "Issue date", "VENDOR", "quantity"),
}


async def _load(db: AsyncSession, kind: str, doc_id: UUID, org_id):
    entry = REGISTRY.get(kind)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Unknown document type '{kind}'")
    model, title, number_attr, date_attr, date_label, contact_label, qty_attr = entry

    q = select(model).where(model.id == doc_id, model.organization_id == org_id)
    if hasattr(model, "line_items") and not isinstance(getattr(model, "line_items", None), property):
        try:
            q = q.options(selectinload(model.line_items))
        except Exception:
            pass
    doc = (await db.execute(q)).scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")

    org = (await db.execute(select(Organization).where(Organization.id == org_id))).scalar_one_or_none()
    contact = None
    if getattr(doc, "contact_id", None):
        contact = (await db.execute(select(Contact).where(Contact.id == doc.contact_id))).scalar_one_or_none()
    return entry, doc, org, contact


def _build_pdf(entry, doc, org, contact) -> tuple[bytes, str]:
    model, title, number_attr, date_attr, date_label, contact_label, qty_attr = entry
    number = getattr(doc, number_attr, "") or ""
    date_val = getattr(doc, date_attr, None)
    meta = [f"{date_label}: {date_val.strftime('%Y-%m-%d')}" if date_val else f"{date_label}: —"]
    status = getattr(doc, "status", None)
    if status:
        meta.append(f"Status: {status}")

    raw_lines = getattr(doc, "line_items", None) or []
    line_rows = standard_line_rows(raw_lines, qty_attr=qty_attr) if raw_lines else []
    currency = getattr(doc, "currency", "MYR") or "MYR"
    totals = standard_totals(doc, currency)

    pdf = render_document_pdf(
        title=title, number=number, org=org, contact=contact,
        meta_rows=meta, line_rows=line_rows, totals_rows=totals,
        notes=getattr(doc, "notes", None), status=status, contact_label=contact_label,
    )
    return pdf, number


@router.get("/statement/{contact_id}")
async def statement_pdf(
    contact_id: UUID,
    start_date: str = Query(...),
    end_date: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Statement of account PDF, built from the contact-statement report."""
    from app.api.v1.reports.ageing import contact_statement
    org_id = current_user["org_id"]
    report = await contact_statement(contact_id=contact_id, start_date=start_date,
                                     end_date=end_date, db=db, current_user=current_user)
    org = (await db.execute(select(Organization).where(Organization.id == org_id))).scalar_one_or_none()
    contact = (await db.execute(
        select(Contact).where(Contact.id == contact_id, Contact.organization_id == org_id)
    )).scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    events = report.get("events") or report.get("lines") or []
    closing = report.get("closing_balance") or report.get("total") or 0.0
    pdf = render_statement_pdf(org, contact, start_date, end_date, events, float(closing))
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="statement-{contact.name}.pdf"'})


@router.get("/{kind}/{doc_id}")
async def document_pdf(
    kind: str,
    doc_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    entry, doc, org, contact = await _load(db, kind, doc_id, current_user["org_id"])
    pdf, number = _build_pdf(entry, doc, org, contact)
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{number or kind}.pdf"'})


@router.post("/{kind}/{doc_id}/send-email")
async def send_document_email(
    kind: str,
    doc_id: UUID,
    body: dict = Body(default={}),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    from app.core.config import get_settings
    settings = get_settings()
    entry, doc, org, contact = await _load(db, kind, doc_id, current_user["org_id"])
    to = (body.get("to") or (contact.email if contact else None) or "").strip()
    if not to:
        raise HTTPException(status_code=400, detail="No recipient email. Provide 'to' or set the contact's email.")
    if not settings.RESEND_API_KEY:
        raise HTTPException(status_code=503, detail="Email is not configured (RESEND_API_KEY missing)")

    pdf, number = _build_pdf(entry, doc, org, contact)
    title = entry[1].title()
    subject = body.get("subject") or f"{title} {number} from {getattr(org, 'name', '')}"
    message = body.get("message") or f"Please find attached {title.lower()} {number}."
    try:
        import resend
        resend.api_key = settings.RESEND_API_KEY
        resend.Emails.send({
            "from": settings.EMAIL_FROM,
            "to": [to],
            "subject": subject,
            "html": f"<p>{message}</p>",
            "attachments": [{
                "filename": f"{number or kind}.pdf",
                "content": base64.b64encode(pdf).decode("ascii"),
            }],
        })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to send email: {e}")

    await log_audit(db, current_user["org_id"], current_user["sub"], "email_sent",
                    kind.replace("-", "_").rstrip("s"), doc_id, {"to": to})
    return {"status": "sent", "to": to, "number": number}
