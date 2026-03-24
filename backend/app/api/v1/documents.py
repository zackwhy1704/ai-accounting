from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import Document, Organization
from app.schemas.schemas import DocumentResponse
from app.services.document_service import document_processor, storage_service

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

    # Create document record
    doc = Document(
        organization_id=org_id,
        filename=file.filename,
        file_url=file_url,
        file_type=file.content_type,
        file_size=len(content),
        status="uploaded",
        uploaded_by=current_user["sub"],
    )
    db.add(doc)
    await db.flush()

    # If AI scans available, process immediately (Phase 2: queue via Celery)
    if scans_remaining > 0:
        doc.status = "processing"
        try:
            # Phase 2: Replace with Celery task
            # from app.tasks.document_tasks import process_document_task
            # process_document_task.delay(str(doc.id), file_url, file.content_type)

            # For now, process synchronously
            extracted = await document_processor.process_invoice(content)
            doc.ai_extracted_data = extracted
            doc.status = "processed"
            org.ai_scans_used += 1
        except Exception as e:
            doc.status = "failed"
            doc.error_message = str(e)

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
        extracted = await document_processor.process_invoice(content)
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
