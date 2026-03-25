import asyncio
import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID
from datetime import datetime, timezone, timedelta
from app.core.database import get_db, async_session
from app.core.security import get_current_user
from app.models.models import Document, Organization, Bill, BillLineItem, Contact, Account, Transaction, JournalEntry
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
        with open(doc.file_url, "rb") as f:
            content = f.read()
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


# ── Auto-categorise ──
CATEGORY_KEYWORDS = {
    "invoice": ["invoice", "inv", "bill to", "payment terms", "due date", "invoice number", "invoice_number"],
    "receipt": ["receipt", "paid", "payment received", "thank you for your payment", "transaction"],
    "bill": ["bill", "amount due", "payable", "supplier", "vendor"],
    "bank_statement": ["bank", "statement", "account summary", "opening balance", "closing balance"],
}

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

    # Score based on extracted data + filename
    scores: dict[str, int] = {cat: 0 for cat in CATEGORY_KEYWORDS}
    search_text = doc.filename.lower()

    if doc.ai_extracted_data:
        search_text += " " + " ".join(
            str(v).lower() for v in doc.ai_extracted_data.values() if isinstance(v, str)
        )
        # Structural hints
        if doc.ai_extracted_data.get("invoice_number"):
            scores["invoice"] += 3
        if doc.ai_extracted_data.get("vendor_name"):
            scores["bill"] += 2
        if doc.ai_extracted_data.get("line_items"):
            scores["invoice"] += 2
            scores["bill"] += 1

    for cat, keywords in CATEGORY_KEYWORDS.items():
        for kw in keywords:
            if kw in search_text:
                scores[cat] += 1

    best = max(scores, key=lambda k: scores[k])
    doc.category = best if scores[best] > 0 else "other"

    return doc
