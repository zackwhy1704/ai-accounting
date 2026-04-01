import asyncio
import logging
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID
from datetime import datetime, timezone, timedelta
from app.core.database import get_db, async_session
from app.core.security import get_current_user
from app.models.models import Document, Organization, Bill, BillLineItem, Contact, Account, Transaction, JournalEntry, GoodsReceivedNote, GRNLineItem
from .gl_helpers import post_gl as do_post_gl
from .document_router import route_document_to_module, CONFIRM_LABELS
from app.schemas.schemas import DocumentResponse, BillResponse
from app.services.document_service import document_processor, storage_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["Documents"])

ALLOWED_TYPES = {
    "application/pdf", "image/jpeg", "image/png", "image/webp",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


@router.get("", response_model=list[DocumentResponse])
async def list_documents(
    status: str | None = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Document).where(
        Document.organization_id == current_user["org_id"]
    ).order_by(Document.uploaded_at.desc())
    if status:
        query = query.where(Document.status == status)
    result = await db.execute(query)
    return result.scalars().all()


async def _process_document_background(doc_id: UUID, org_id: UUID, file_content: bytes, content_type: str):
    """Background task: run OCR and update document status in its own DB session."""
    async with async_session() as db:
        try:
            result = await db.execute(select(Document).where(Document.id == doc_id))
            doc = result.scalar_one_or_none()
            if not doc:
                logger.error(f"Background OCR: document {doc_id} not found")
                return

            extracted = await document_processor.process_invoice(file_content, content_type)
            doc.ai_extracted_data = extracted
            confidence = float(extracted.get("confidence", 0))
            doc.ai_confidence = confidence
            doc.status = "unrecognized" if confidence < 0.4 else "processed"
            doc.processed_at = datetime.now(timezone.utc)

            # Increment org scan count
            org_result = await db.execute(select(Organization).where(Organization.id == org_id))
            org = org_result.scalar_one_or_none()
            if org:
                org.ai_scans_used += 1

            await db.commit()
            logger.info(f"Background OCR complete: {doc_id} → {doc.status} (confidence={confidence:.2f})")
        except Exception as e:
            await db.rollback()
            # Update document as failed
            try:
                result = await db.execute(select(Document).where(Document.id == doc_id))
                doc = result.scalar_one_or_none()
                if doc:
                    error_msg = str(e)
                    if "timed out" in error_msg.lower() or "timeout" in error_msg.lower():
                        doc.status = "failed"
                        doc.error_message = "OCR processing timed out. Try reprocessing or upload a clearer image."
                    else:
                        doc.status = "failed"
                        doc.error_message = error_msg[:500]
                    await db.commit()
            except Exception:
                logger.exception(f"Failed to update document {doc_id} status after OCR error")
            logger.exception(f"Background OCR failed for {doc_id}: {e}")


@router.post("", response_model=DocumentResponse, status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Validate file
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail=f"File type not allowed: {file.content_type}")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")

    # Check AI scan limits
    org_id = current_user["org_id"]
    org_result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = org_result.scalar_one_or_none()

    scans_remaining = (org.ai_scans_limit - org.ai_scans_used) if org else 0

    # Upload to storage
    file_url = await storage_service.upload_file(content, file.filename, file.content_type)

    # Create document record — return immediately with "processing" status
    doc = Document(
        organization_id=org_id,
        filename=file.filename,
        file_url=file_url,
        file_type=file.content_type,
        file_size=len(content),
        status="processing" if scans_remaining > 0 else "uploaded",
        uploaded_by=current_user["sub"],
    )
    db.add(doc)
    await db.flush()

    # Kick off OCR in background — user gets instant response
    if scans_remaining > 0:
        asyncio.create_task(_process_document_background(doc.id, org_id, content, file.content_type))

    return doc


@router.post("/{document_id}/reprocess", response_model=DocumentResponse)
async def reprocess_document(
    document_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Document).where(
            Document.id == document_id,
            Document.organization_id == current_user["org_id"],
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    doc.status = "processing"
    try:
        content = await storage_service.download_file(doc.file_url)
        extracted = await document_processor.process_invoice(content, doc.file_type)
        doc.ai_extracted_data = extracted
        doc.status = "processed"
    except Exception as e:
        doc.status = "failed"
        doc.error_message = str(e)

    return doc


@router.delete("/{document_id}", status_code=204)
async def delete_document(
    document_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Document).where(
            Document.id == document_id,
            Document.organization_id == current_user["org_id"],
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    await storage_service.delete_file(doc.file_url)
    await db.delete(doc)


@router.get("/{document_id}/file")
async def get_document_file(
    document_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from fastapi.responses import RedirectResponse

    result = await db.execute(
        select(Document).where(
            Document.id == document_id,
            Document.organization_id == current_user["org_id"],
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # S3/R2: redirect to a time-limited presigned URL (1 hour)
    if doc.file_url.startswith("s3://"):
        presigned = storage_service.get_presigned_url(doc.file_url, expires_in=3600)
        return RedirectResponse(url=presigned)

    # Local storage: serve file directly
    file_path = Path(doc.file_url)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on storage")

    return FileResponse(
        path=str(file_path),
        filename=doc.filename,
        media_type=doc.file_type,
    )


# ── Update extracted data ──
class ExtractedDataUpdate(BaseModel):
    ai_extracted_data: dict

@router.patch("/{document_id}/extracted-data", response_model=DocumentResponse)
async def update_extracted_data(
    document_id: UUID,
    body: ExtractedDataUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Document).where(Document.id == document_id, Document.organization_id == current_user["org_id"])
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    doc.ai_extracted_data = body.ai_extracted_data
    return doc


# ── Set category manually ──
class CategoryUpdate(BaseModel):
    category: str

@router.patch("/{document_id}", response_model=DocumentResponse)
async def update_document(
    document_id: UUID,
    body: CategoryUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    valid_categories = {
        "invoice", "receipt", "credit_note", "debit_note",
        "bill", "purchase_order", "delivery_note", "vendor_credit",
        "payment", "refund", "stock_adjustment", "stock_transfer",
        "stock_value", "bank_statement", "quotation", "other",
    }
    if body.category not in valid_categories:
        raise HTTPException(status_code=400, detail=f"Invalid category. Must be one of: {valid_categories}")

    result = await db.execute(
        select(Document).where(Document.id == document_id, Document.organization_id == current_user["org_id"])
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    doc.category = body.category
    await db.commit()
    await db.refresh(doc)
    return doc


# ── Mark as done ──
class StatusUpdate(BaseModel):
    status: str

@router.patch("/{document_id}/status", response_model=DocumentResponse)
async def update_document_status(
    document_id: UUID,
    body: StatusUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    valid = {"uploaded", "processing", "processed", "failed", "done", "unrecognized"}
    if body.status not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid}")

    result = await db.execute(
        select(Document).where(Document.id == document_id, Document.organization_id == current_user["org_id"])
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    doc.status = body.status
    return doc


# ── Attach to existing bill ──
class AttachBillRequest(BaseModel):
    bill_id: UUID

@router.post("/{document_id}/attach-to-bill", response_model=DocumentResponse)
async def attach_to_bill(
    document_id: UUID,
    body: AttachBillRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = current_user["org_id"]
    result = await db.execute(
        select(Document).where(Document.id == document_id, Document.organization_id == org_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    bill_result = await db.execute(
        select(Bill).where(Bill.id == body.bill_id, Bill.organization_id == org_id)
    )
    bill = bill_result.scalar_one_or_none()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")

    doc.linked_bill_id = bill.id
    doc.status = "done"
    return doc


# ── Create bill from extracted data ──
@router.post("/{document_id}/create-bill", response_model=BillResponse)
async def create_bill_from_document(
    document_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = current_user["org_id"]
    result = await db.execute(
        select(Document).where(Document.id == document_id, Document.organization_id == org_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if not doc.ai_extracted_data:
        raise HTTPException(status_code=400, detail="No AI extracted data available")

    data = doc.ai_extracted_data
    vendor_name = data.get("vendor_name", "Unknown Vendor")
    now = datetime.now(timezone.utc)

    # Find or create vendor contact
    contact_result = await db.execute(
        select(Contact).where(Contact.organization_id == org_id, Contact.name == vendor_name)
    )
    contact = contact_result.scalar_one_or_none()
    if not contact:
        contact = Contact(
            organization_id=org_id,
            name=vendor_name,
            type="vendor",
            address=data.get("vendor_address"),
        )
        db.add(contact)
        await db.flush()

    # Generate bill number
    from sqlalchemy import func
    count_result = await db.execute(
        select(func.count()).select_from(Bill).where(Bill.organization_id == org_id)
    )
    count = count_result.scalar() or 0
    bill_number = data.get("invoice_number", f"BILL-{count + 1:04d}")

    # Parse dates from extracted data
    def parse_date(val, fallback):
        if not val:
            return fallback
        try:
            return datetime.fromisoformat(val.replace("/", "-"))
        except (ValueError, AttributeError):
            return fallback

    issue_date = parse_date(data.get("invoice_date"), now)
    due_date = parse_date(data.get("due_date"), now + timedelta(days=30))

    # Build line items from extracted data
    extracted_items = data.get("line_items", [])
    subtotal = 0.0
    tax_amount = 0.0

    if extracted_items:
        for item in extracted_items:
            amt = float(item.get("amount", 0) or item.get("quantity", 1) * item.get("unit_price", 0))
            subtotal += amt
        tax_amount = float(data.get("tax_amount", 0) or 0)
    else:
        subtotal = float(data.get("subtotal", 0) or data.get("total", 0) or 0)
        tax_amount = float(data.get("tax_amount", 0) or 0)

    total = subtotal + tax_amount
    currency = data.get("currency", "SGD") or "SGD"

    bill = Bill(
        organization_id=org_id,
        contact_id=contact.id,
        bill_number=bill_number,
        issue_date=issue_date,
        due_date=due_date,
        subtotal=subtotal,
        tax_amount=tax_amount,
        total=total,
        currency=currency,
    )
    db.add(bill)
    await db.flush()

    # Create line items
    if extracted_items:
        for i, item in enumerate(extracted_items):
            amt = float(item.get("amount", 0) or item.get("quantity", 1) * item.get("unit_price", 0))
            line = BillLineItem(
                bill_id=bill.id,
                description=item.get("description", "Item"),
                quantity=float(item.get("quantity", 1) or 1),
                unit_price=float(item.get("unit_price", amt) or amt),
                amount=amt,
                sort_order=i,
            )
            db.add(line)
    else:
        db.add(BillLineItem(
            bill_id=bill.id,
            description=f"From document: {doc.filename}",
            quantity=1,
            unit_price=subtotal,
            amount=subtotal,
            sort_order=0,
        ))

    # Double-entry bookkeeping
    ap = (await db.execute(select(Account).where(Account.organization_id == org_id, Account.code == "2000"))).scalar_one_or_none()
    exp = (await db.execute(select(Account).where(Account.organization_id == org_id, Account.code == "5000"))).scalar_one_or_none()

    if ap and exp:
        txn = Transaction(
            organization_id=org_id, date=issue_date,
            description=f"Bill {bill_number} (from document)", reference=bill_number,
            source="bill", source_id=bill.id,
        )
        db.add(txn)
        await db.flush()
        db.add(JournalEntry(transaction_id=txn.id, account_id=exp.id, debit=subtotal, credit=0))
        db.add(JournalEntry(transaction_id=txn.id, account_id=ap.id, debit=0, credit=total))
        if tax_amount > 0:
            gst = (await db.execute(select(Account).where(Account.organization_id == org_id, Account.code == "1200"))).scalar_one_or_none()
            if gst:
                db.add(JournalEntry(transaction_id=txn.id, account_id=gst.id, debit=tax_amount, credit=0))

    # Link document to bill and mark done
    doc.linked_bill_id = bill.id
    doc.status = "done"

    return bill


# ── Suggest GRN from extracted data (no DB writes — preview only) ──
@router.get("/{document_id}/suggest-grn")
async def suggest_grn_from_document(
    document_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns a preview of the GRN + journal entries that would be created
    from this document's AI-extracted data. No side effects.
    """
    org_id = current_user["org_id"]
    result = await db.execute(
        select(Document).where(Document.id == document_id, Document.organization_id == org_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not doc.ai_extracted_data:
        raise HTTPException(status_code=400, detail="No AI extracted data available")

    data = doc.ai_extracted_data
    vendor_name = data.get("vendor_name", "Unknown Vendor")
    now = datetime.now(timezone.utc)

    def parse_date(val, fallback):
        if not val:
            return fallback
        try:
            return datetime.fromisoformat(str(val).replace("/", "-")).isoformat()
        except (ValueError, AttributeError):
            return fallback.isoformat()

    received_date = parse_date(data.get("invoice_date") or data.get("delivery_date"), now)
    currency = str(data.get("currency", "SGD") or "SGD")

    # Build suggested line items
    extracted_items = data.get("line_items", []) or []
    line_items = []
    subtotal = 0.0
    for item in extracted_items:
        qty = float(item.get("quantity", 1) or 1)
        unit_price = float(item.get("unit_price", 0) or item.get("amount", 0) or 0)
        if unit_price == 0 and item.get("amount"):
            unit_price = float(item["amount"]) / qty
        amt = qty * unit_price
        subtotal += amt
        line_items.append({
            "description": item.get("description", "Item"),
            "quantity_ordered": qty,
            "quantity_received": qty,
            "unit_price": round(unit_price, 2),
        })

    if not line_items:
        total = float(data.get("total", 0) or data.get("subtotal", 0) or 0)
        subtotal = total
        line_items.append({
            "description": f"Goods from {doc.filename}",
            "quantity_ordered": 1.0,
            "quantity_received": 1.0,
            "unit_price": round(total, 2),
        })

    tax_amount = float(data.get("tax_amount", 0) or 0)
    total = subtotal + tax_amount

    # Suggested journal entries for user to confirm
    journal_preview = [
        {
            "account_code": "5000",
            "account_name": "Purchases / Expense",
            "debit": round(subtotal, 2),
            "credit": 0.0,
            "description": "Goods/services received",
        },
        {
            "account_code": "2000",
            "account_name": "Accounts Payable",
            "debit": 0.0,
            "credit": round(total, 2),
            "description": "Amount owed to supplier",
        },
    ]
    if tax_amount > 0:
        journal_preview.insert(1, {
            "account_code": "1200",
            "account_name": "GST / SST Input Tax",
            "debit": round(tax_amount, 2),
            "credit": 0.0,
            "description": f"Input tax {round(tax_amount/subtotal*100 if subtotal else 0, 1)}%",
        })

    # Look up existing contact
    contact_result = await db.execute(
        select(Contact).where(Contact.organization_id == org_id, Contact.name == vendor_name)
    )
    existing_contact = contact_result.scalar_one_or_none()

    return {
        "document_id": str(document_id),
        "vendor_name": vendor_name,
        "contact_id": str(existing_contact.id) if existing_contact else None,
        "received_date": received_date,
        "currency": currency,
        "subtotal": round(subtotal, 2),
        "tax_amount": round(tax_amount, 2),
        "total": round(total, 2),
        "line_items": line_items,
        "journal_preview": journal_preview,
    }


class CreateGRNRequest(BaseModel):
    contact_id: UUID
    received_date: datetime
    currency: str = "SGD"
    notes: str | None = None
    line_items: list[dict]  # [{description, quantity_ordered, quantity_received, unit_price}]
    post_gl: bool = True


@router.post("/{document_id}/create-grn")
async def create_grn_from_document(
    document_id: UUID,
    body: CreateGRNRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a GRN from a document's extracted data.
    Optionally posts Dr Inventory/Expense + Dr GST Input / Cr AP.
    """
    import random

    org_id = current_user["org_id"]

    result = await db.execute(
        select(Document).where(Document.id == document_id, Document.organization_id == org_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc.linked_grn_id:
        raise HTTPException(status_code=409, detail="Document already linked to a GRN")

    now = datetime.now(timezone.utc)
    grn_number = f"GRN-{now.strftime('%Y%m')}-{random.randint(1000, 9999)}"

    grn = GoodsReceivedNote(
        organization_id=org_id,
        contact_id=body.contact_id,
        grn_number=grn_number,
        received_date=body.received_date,
        currency=body.currency,
        notes=body.notes,
        status="received",
    )
    db.add(grn)
    await db.flush()

    subtotal = 0.0
    for i, item in enumerate(body.line_items):
        qty_recv = float(item.get("quantity_received", item.get("quantity_ordered", 1)))
        unit_price = float(item.get("unit_price", 0))
        subtotal += qty_recv * unit_price

        line = GRNLineItem(
            grn_id=grn.id,
            description=item.get("description", "Item"),
            quantity_ordered=float(item.get("quantity_ordered", qty_recv)),
            quantity_received=qty_recv,
            unit_price=unit_price,
            sort_order=i,
        )
        db.add(line)

    # GL posting
    if body.post_gl:
        data = doc.ai_extracted_data or {}
        tax_amount = float(data.get("tax_amount", 0) or 0)
        total = subtotal + tax_amount

        entries = [
            ("5000", round(subtotal, 2), 0),   # Dr Purchases/Expense
            ("2000", 0, round(total, 2)),        # Cr Accounts Payable
        ]
        if tax_amount > 0:
            entries.append(("1200", round(tax_amount, 2), 0))  # Dr GST Input

        await do_post_gl(
            db, org_id, body.received_date,
            f"GRN {grn_number} — goods received",
            grn_number, "grn", grn.id, entries,
        )

    # Link document to GRN + mark done
    doc.linked_grn_id = grn.id
    doc.status = "done"

    await db.commit()
    await db.refresh(grn)

    return {
        "grn_id": str(grn.id),
        "grn_number": grn_number,
        "status": grn.status,
        "gl_posted": body.post_gl,
        "document_id": str(document_id),
    }


# ── Suggest journal entry from document category + extracted data ──

# Per-category double-entry templates.
# Placeholder values: "{subtotal}", "{total}", "{tax}" are replaced at runtime.
_JOURNAL_TEMPLATES: dict[str, list[dict]] = {
    "invoice": [
        {"account_code": "1100", "account_name": "Accounts Receivable",  "debit": "{total}",    "credit": 0,           "description": "Amount owed by customer"},
        {"account_code": "4000", "account_name": "Sales Revenue",        "debit": 0,            "credit": "{subtotal}", "description": "Revenue from sale"},
        {"account_code": "2100", "account_name": "GST / SST Output Tax", "debit": 0,            "credit": "{tax}",      "description": "Output tax collected", "tax_only": True},
    ],
    "receipt": [
        {"account_code": "1000", "account_name": "Cash / Bank",          "debit": "{total}",    "credit": 0,           "description": "Cash received"},
        {"account_code": "1100", "account_name": "Accounts Receivable",  "debit": 0,            "credit": "{total}",    "description": "Settlement of AR"},
    ],
    "credit_note": [
        {"account_code": "4000", "account_name": "Sales Revenue",        "debit": "{subtotal}", "credit": 0,           "description": "Sales reversal"},
        {"account_code": "2100", "account_name": "GST / SST Output Tax", "debit": "{tax}",      "credit": 0,           "description": "Output tax reversal", "tax_only": True},
        {"account_code": "1100", "account_name": "Accounts Receivable",  "debit": 0,            "credit": "{total}",    "description": "Customer credit note"},
    ],
    "debit_note": [
        {"account_code": "2000", "account_name": "Accounts Payable",     "debit": "{total}",    "credit": 0,           "description": "Debit note to supplier"},
        {"account_code": "5000", "account_name": "Purchases / Expense",  "debit": 0,            "credit": "{subtotal}", "description": "Purchase return"},
        {"account_code": "1200", "account_name": "GST / SST Input Tax",  "debit": 0,            "credit": "{tax}",      "description": "Input tax reversal", "tax_only": True},
    ],
    "bill": [
        {"account_code": "5000", "account_name": "Purchases / Expense",  "debit": "{subtotal}", "credit": 0,           "description": "Goods / services purchased"},
        {"account_code": "1200", "account_name": "GST / SST Input Tax",  "debit": "{tax}",      "credit": 0,           "description": "Input tax claimable", "tax_only": True},
        {"account_code": "2000", "account_name": "Accounts Payable",     "debit": 0,            "credit": "{total}",    "description": "Amount owed to supplier"},
    ],
    "purchase_order": [
        {"account_code": "5000", "account_name": "Purchases / Expense",  "debit": "{subtotal}", "credit": 0,           "description": "Goods / services ordered"},
        {"account_code": "1200", "account_name": "GST / SST Input Tax",  "debit": "{tax}",      "credit": 0,           "description": "Input tax claimable", "tax_only": True},
        {"account_code": "2000", "account_name": "Accounts Payable",     "debit": 0,            "credit": "{total}",    "description": "Amount owed to supplier"},
    ],
    "delivery_note": [
        {"account_code": "5000", "account_name": "Purchases / Expense",  "debit": "{subtotal}", "credit": 0,           "description": "Goods received"},
        {"account_code": "1200", "account_name": "GST / SST Input Tax",  "debit": "{tax}",      "credit": 0,           "description": "Input tax claimable", "tax_only": True},
        {"account_code": "2000", "account_name": "Accounts Payable",     "debit": 0,            "credit": "{total}",    "description": "Amount owed to supplier"},
    ],
    "vendor_credit": [
        {"account_code": "2000", "account_name": "Accounts Payable",     "debit": "{total}",    "credit": 0,           "description": "Vendor credit received"},
        {"account_code": "5000", "account_name": "Purchases / Expense",  "debit": 0,            "credit": "{subtotal}", "description": "Purchase reversal"},
        {"account_code": "1200", "account_name": "GST / SST Input Tax",  "debit": 0,            "credit": "{tax}",      "description": "Input tax reversal", "tax_only": True},
    ],
    "payment": [
        {"account_code": "2000", "account_name": "Accounts Payable",     "debit": "{total}",    "credit": 0,           "description": "Settlement of AP"},
        {"account_code": "1000", "account_name": "Cash / Bank",          "debit": 0,            "credit": "{total}",    "description": "Payment made"},
    ],
    "refund": [
        {"account_code": "1000", "account_name": "Cash / Bank",          "debit": "{total}",    "credit": 0,           "description": "Refund received"},
        {"account_code": "4000", "account_name": "Sales Revenue",        "debit": 0,            "credit": "{total}",    "description": "Refund adjustment"},
    ],
    "stock_adjustment": [
        {"account_code": "5100", "account_name": "Stock Adjustment",     "debit": "{total}",    "credit": 0,           "description": "Inventory write-off / adjustment"},
        {"account_code": "1500", "account_name": "Inventory / Stock",    "debit": 0,            "credit": "{total}",    "description": "Stock reduced"},
    ],
    "stock_transfer": [],   # No financial impact — memo only
    "stock_value":    [],
    "bank_statement": [],
    "quotation":      [],
    "other": [],
}


def _build_journal_lines(category: str, subtotal: float, tax: float, total: float) -> list[dict]:
    template = _JOURNAL_TEMPLATES.get(category, [])
    lines = []
    for t in template:
        if t.get("tax_only") and tax == 0:
            continue
        def _resolve(v):
            if v == "{subtotal}": return round(subtotal, 2)
            if v == "{total}":    return round(total, 2)
            if v == "{tax}":      return round(tax, 2)
            return v
        lines.append({
            "account_code": t["account_code"],
            "account_name": t["account_name"],
            "description":  t["description"],
            "debit":  _resolve(t["debit"]),
            "credit": _resolve(t["credit"]),
        })
    return lines


@router.get("/{document_id}/suggest-journal")
async def suggest_journal_from_document(
    document_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return a suggested journal entry based on the document's category and
    AI-extracted amounts. No side effects — preview only.
    """
    org_id = current_user["org_id"]
    result = await db.execute(
        select(Document).where(Document.id == document_id, Document.organization_id == org_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    data = doc.ai_extracted_data or {}
    subtotal = float(data.get("subtotal", 0) or 0)
    tax     = float(data.get("tax_amount", 0) or 0)
    total   = float(data.get("total", 0) or 0) or (subtotal + tax)
    if subtotal == 0:
        subtotal = total - tax

    category = doc.category or "other"
    lines = _build_journal_lines(category, subtotal, tax, total)

    return {
        "document_id": str(document_id),
        "category": category,
        "subtotal": round(subtotal, 2),
        "tax_amount": round(tax, 2),
        "total": round(total, 2),
        "journal_lines": lines,
        "memo_only": len(lines) == 0,
    }


class JournalLineIn(BaseModel):
    account_code: str
    account_name: str
    description: str
    debit: float
    credit: float


class CreateJournalRequest(BaseModel):
    journal_lines: list[JournalLineIn]
    date: datetime | None = None
    reference: str | None = None


@router.post("/{document_id}/create-journal")
async def create_journal_from_document(
    document_id: UUID,
    body: CreateJournalRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Route the confirmed journal entry to the correct accounting module:
    delivery_note → GRN, bill → Bill, credit_note → CreditNote, etc.
    Creates the module record, posts GL tied to it, marks document done.
    """
    org_id = current_user["org_id"]
    user_id = current_user.get("user_id")

    result = await db.execute(
        select(Document).where(Document.id == document_id, Document.organization_id == org_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    lines = [ln.model_dump() for ln in body.journal_lines]
    total_debit  = sum(ln.debit  for ln in body.journal_lines)
    total_credit = sum(ln.credit for ln in body.journal_lines)
    if lines and abs(total_debit - total_credit) > 0.01:
        raise HTTPException(
            status_code=400,
            detail=f"Journal does not balance: debit {total_debit:.2f} ≠ credit {total_credit:.2f}",
        )

    ref = body.reference or doc.filename or str(document_id)[:8]
    date = body.date or datetime.now(timezone.utc)
    category = doc.category or "other"
    data = doc.ai_extracted_data or {}

    result_info = await route_document_to_module(
        db, org_id, category, data, lines, date, ref, user_id
    )

    # Link the document to the created module record
    if category in ("bill", "purchase_order"):
        doc.linked_bill_id = result_info["record_id"]
    elif category == "delivery_note":
        doc.linked_grn_id = result_info["record_id"]
    elif category == "invoice":
        doc.linked_invoice_id = result_info["record_id"]
    else:
        doc.linked_record_id = result_info["record_id"]
        doc.linked_record_type = result_info["record_type"]

    doc.status = "done"
    await db.commit()

    return {
        "document_id": str(document_id),
        "record_id": result_info["record_id"],
        "record_number": result_info["record_number"],
        "record_type": result_info["record_type"],
        "module_url": result_info["module_url"],
        "friendly_name": result_info["friendly_name"],
        "gl_posted": True,
    }


# ── Auto-categorise ──
# Each key is a valid document category value stored in documents.category.
# Keywords are matched against filename + AI-extracted text (lowercased).
CATEGORY_KEYWORDS: dict[str, list[str]] = {
    # Sales-side
    "invoice":         ["invoice", "inv no", "tax invoice", "bill to", "payment terms", "due date", "invoice number", "invoice_number", "sold to"],
    "receipt":         ["receipt", "official receipt", "payment received", "paid", "thank you for your payment", "cash receipt"],
    "credit_note":     ["credit note", "credit memo", "cn no", "cn number", "adjustment note", "refund note"],
    "debit_note":      ["debit note", "debit memo", "dn no", "dn number"],
    # Purchase-side
    "bill":            ["bill", "amount due", "vendor invoice", "supplier invoice", "purchase invoice"],
    "purchase_order":  ["purchase order", "po number", "po no", "order no", "order number", "p.o.", "procurement order"],
    "delivery_note":   ["delivery note", "delivery order", "do number", "do no", "ship to", "deliver to", "despatch", "consignment", "goods received", "grn"],
    "vendor_credit":   ["vendor credit", "supplier credit", "credit received", "return to supplier", "supplier return"],
    # Payments & refunds
    "payment":         ["payment voucher", "payment advice", "remittance", "bank transfer", "payment confirmation", "receipt of payment"],
    "refund":          ["refund", "reimbursement", "return of payment", "money back"],
    # Inventory & stock
    "stock_adjustment":["stock adjustment", "inventory adjustment", "write-off", "stock count", "physical count", "variance report"],
    "stock_transfer":  ["stock transfer", "warehouse transfer", "inter-branch transfer", "transfer note"],
    "stock_value":     ["stock valuation", "inventory value", "costing report", "stock ledger"],
    # Bank / financial
    "bank_statement":  ["bank statement", "account statement", "account summary", "opening balance", "closing balance", "transaction history", "e-statement"],
    # Other
    "quotation":       ["quotation", "quote", "estimate", "proposal", "proforma", "pro forma"],
    "other":           [],
}

# Structural scoring hints — applied AFTER keyword scan
# Maps a field present in ai_extracted_data → (category, bonus_score)
STRUCTURAL_HINTS: list[tuple[str, str, int]] = [
    ("invoice_number",  "invoice",        3),
    ("po_number",       "purchase_order", 4),
    ("grn_number",      "delivery_note",  4),
    ("credit_note_no",  "credit_note",    4),
    ("debit_note_no",   "debit_note",     4),
    ("vendor_name",     "bill",           2),
    ("vendor_name",     "delivery_note",  1),
    ("line_items",      "invoice",        2),
    ("line_items",      "bill",           1),
    ("line_items",      "delivery_note",  1),
    ("bank_name",       "bank_statement", 3),
    ("account_number",  "bank_statement", 3),
    ("payment_method",  "payment",        3),
    ("sku",             "stock_adjustment", 2),
    ("product_code",    "stock_adjustment", 2),
]

# Filename pattern scoring — (substring, category, bonus_score)
FILENAME_HINTS: list[tuple[str, str, int]] = [
    ("invoice",   "invoice",        3),
    ("inv",       "invoice",        2),
    ("receipt",   "receipt",        3),
    ("credit",    "credit_note",    3),
    ("debit",     "debit_note",     3),
    ("bill",      "bill",           3),
    ("po",        "purchase_order", 2),
    ("purchase_order", "purchase_order", 4),
    ("delivery",  "delivery_note",  3),
    ("grn",       "delivery_note",  4),
    ("payment",   "payment",        3),
    ("refund",    "refund",         3),
    ("bank",      "bank_statement", 2),
    ("statement", "bank_statement", 2),
    ("stock",     "stock_adjustment", 2),
    ("inventory", "stock_adjustment", 2),
    ("quote",     "quotation",      3),
    ("quotation", "quotation",      4),
]

@router.post("/{document_id}/categorise", response_model=DocumentResponse)
async def categorise_document(
    document_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Document).where(Document.id == document_id, Document.organization_id == current_user["org_id"])
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    scores: dict[str, int] = {cat: 0 for cat in CATEGORY_KEYWORDS}
    filename_lower = doc.filename.lower()

    # 1. Keyword scan across filename + AI-extracted text
    search_text = filename_lower
    if doc.ai_extracted_data:
        search_text += " " + " ".join(
            str(v).lower() for v in doc.ai_extracted_data.values() if isinstance(v, str)
        )

    for cat, keywords in CATEGORY_KEYWORDS.items():
        for kw in keywords:
            if kw in search_text:
                scores[cat] += 1

    # 2. Structural hints — field presence in AI data
    if doc.ai_extracted_data:
        for field, cat, bonus in STRUCTURAL_HINTS:
            val = doc.ai_extracted_data.get(field)
            if val and (not isinstance(val, list) or len(val) > 0):
                scores[cat] = scores.get(cat, 0) + bonus

    # 3. Filename pattern hints
    for substr, cat, bonus in FILENAME_HINTS:
        if substr in filename_lower:
            scores[cat] = scores.get(cat, 0) + bonus

    best = max(scores, key=lambda k: scores[k])
    if scores[best] > 0:
        doc.category = best
    # If score is 0 (no matches at all), leave category as None so UI prompts user

    await db.commit()
    await db.refresh(doc)
    return doc
