"""
MyInvois batch + consolidated submission endpoints.

Split from einvoice.py (300-line router rule). Consolidated e-invoices bundle a
month's cash sales and no-TIN invoices under the LHDN General Public buyer;
batch submit loops individual invoices and reports per-invoice results.
"""
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import require_write
from app.models.models import Contact, EInvoiceSubmission, Invoice, SaleReceipt
from app.services import einvoice_ubl as ubl

from .einvoice import _ACTIVE, _org, _submit_and_log, submit_invoice

router = APIRouter(prefix="/einvoice", tags=["e-invoice"])


class ConsolidatedRequest(BaseModel):
    year: int
    month: int  # 1-12


@router.post("/submit/consolidated")
async def submit_consolidated(payload: ConsolidatedRequest, db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_write())):
    """Monthly consolidated e-invoice: cash sales + invoices whose buyer has no TIN,
    excluding documents already individually submitted. Buyer = LHDN General Public."""
    org = await _org(db, current_user["org_id"])
    if not (1 <= payload.month <= 12):
        raise HTTPException(status_code=400, detail="month must be 1-12")
    start = datetime(payload.year, payload.month, 1, tzinfo=timezone.utc)
    end = datetime(payload.year + (payload.month == 12), (payload.month % 12) + 1, 1, tzinfo=timezone.utc)

    submitted_ids = {r[0] for r in (await db.execute(
        select(EInvoiceSubmission.source_id).where(
            EInvoiceSubmission.organization_id == org.id, EInvoiceSubmission.status.in_(_ACTIVE)
        )
    )).all()}

    receipts = (await db.execute(select(SaleReceipt).where(
        SaleReceipt.organization_id == org.id, SaleReceipt.status == "completed",
        SaleReceipt.receipt_date >= start, SaleReceipt.receipt_date < end,
    ))).scalars().all()
    no_tin_contacts = select(Contact.id).where(Contact.organization_id == org.id, Contact.tin.is_(None))
    invoices = (await db.execute(select(Invoice).where(
        Invoice.organization_id == org.id,
        Invoice.status.notin_(["draft", "void", "cancelled"]),
        Invoice.issue_date >= start, Invoice.issue_date < end,
        Invoice.contact_id.in_(no_tin_contacts),
    ))).scalars().all()

    lines, subtotal, tax_total, total = [], 0.0, 0.0, 0.0
    for doc, num in [(r, r.receipt_number) for r in receipts] + [(i, i.invoice_number) for i in invoices]:
        if doc.id in submitted_ids:
            continue
        lines.append({"description": num, "quantity": 1, "unit_price": float(doc.total or 0),
                      "amount": float(doc.subtotal or 0), "tax_rate": 0, "tax_amount": float(doc.tax_amount or 0),
                      "classification": ubl.CONSOLIDATED_ITEM_CLASSIFICATION})
        subtotal += float(doc.subtotal or 0)
        tax_total += float(doc.tax_amount or 0)
        total += float(doc.total or 0)
    if not lines:
        raise HTTPException(status_code=400, detail="No consolidatable documents in that month")

    seq = (await db.execute(select(EInvoiceSubmission).where(
        EInvoiceSubmission.organization_id == org.id, EInvoiceSubmission.source_type == "consolidated",
        EInvoiceSubmission.doc_number.like(f"CONS-{payload.year}{payload.month:02d}%"),
    ))).scalars().all()
    number = f"CONS-{payload.year}{payload.month:02d}-{len(seq) + 1:03d}"
    return await _submit_and_log(
        db, org, current_user,
        source_type="consolidated", source_id=None, doc_type_code=ubl.DOC_TYPE_INVOICE,
        number=number, issue_datetime=datetime.now(timezone.utc), currency="MYR", exchange_rate=1.0,
        buyer=dict(ubl.CONSOLIDATED_BUYER), lines=lines,
        subtotal=round(subtotal, 2), tax_amount=round(tax_total, 2), total=round(total, 2),
        classification=ubl.CONSOLIDATED_ITEM_CLASSIFICATION,
    )


class BatchSubmitRequest(BaseModel):
    invoice_ids: list[UUID]


@router.post("/submit/batch")
async def submit_batch(payload: BatchSubmitRequest, db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_write())):
    """Submit many invoices in one call; per-invoice success/failure in the result."""
    results = []
    for inv_id in payload.invoice_ids:
        try:
            results.append({"invoice_id": str(inv_id), **(await submit_invoice(inv_id, db, current_user))})
        except HTTPException as e:
            await db.rollback()
            results.append({"invoice_id": str(inv_id), "status": "error", "detail": e.detail})
    return {"results": results, "submitted": sum(1 for r in results if r.get("status") == "submitted")}
