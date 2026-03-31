"""Document sharing: SMEs share files with accountants/bookkeepers."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from pydantic import BaseModel
import uuid

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import Document, DocumentShare, User, Organization

router = APIRouter(prefix="/sharing", tags=["sharing"])


class ShareDocumentRequest(BaseModel):
    document_id: str
    accountant_email: str
    note: str | None = None


class RevokeShareRequest(BaseModel):
    document_id: str
    accountant_email: str


@router.post("/share")
async def share_document(
    data: ShareDocumentRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Owner shares a document with an accountant by email."""
    org_id = uuid.UUID(current_user["org_id"])

    # Verify document belongs to current org
    result = await db.execute(
        select(Document).where(
            Document.id == uuid.UUID(data.document_id),
            Document.organization_id == org_id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Look up accountant user (may not exist yet)
    user_result = await db.execute(
        select(User).where(User.email == data.accountant_email.lower())
    )
    accountant = user_result.scalar_one_or_none()

    share = DocumentShare(
        document_id=doc.id,
        owner_org_id=org_id,
        shared_with_email=data.accountant_email.lower(),
        shared_with_user_id=accountant.id if accountant else None,
        shared_by_user_id=uuid.UUID(current_user["sub"]),
        note=data.note,
    )
    db.add(share)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Document already shared with this email")

    return {"status": "shared", "document_id": data.document_id, "shared_with": data.accountant_email}


@router.delete("/share")
async def revoke_share(
    data: RevokeShareRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke a document share."""
    org_id = uuid.UUID(current_user["org_id"])
    result = await db.execute(
        select(DocumentShare).where(
            DocumentShare.document_id == uuid.UUID(data.document_id),
            DocumentShare.owner_org_id == org_id,
            DocumentShare.shared_with_email == data.accountant_email.lower(),
        )
    )
    share = result.scalar_one_or_none()
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")
    await db.delete(share)
    await db.commit()
    return {"status": "revoked"}


@router.get("/my-shared")
async def list_my_shared_documents(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """SME owner: list all documents they have shared with accountants, grouped by document."""
    org_id = uuid.UUID(current_user["org_id"])

    result = await db.execute(
        select(Document, DocumentShare)
        .join(DocumentShare, DocumentShare.document_id == Document.id)
        .where(DocumentShare.owner_org_id == org_id)
        .order_by(DocumentShare.shared_at.desc())
    )
    rows = result.all()

    # Group shares by document
    docs: dict[str, dict] = {}
    for doc, share in rows:
        doc_id = str(doc.id)
        if doc_id not in docs:
            docs[doc_id] = {
                "document_id": doc_id,
                "filename": doc.filename,
                "file_type": doc.file_type,
                "file_url": doc.file_url,
                "file_size": doc.file_size,
                "category": doc.category,
                "status": doc.status,
                "uploaded_at": doc.uploaded_at.isoformat(),
                "shares": [],
            }
        docs[doc_id]["shares"].append({
            "share_id": str(share.id),
            "shared_with_email": share.shared_with_email,
            "note": share.note,
            "shared_at": share.shared_at.isoformat(),
        })

    return list(docs.values())


@router.get("/shared-with-me")
async def get_documents_shared_with_me(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Accountant: list all documents shared with the current user's email."""
    user_result = await db.execute(
        select(User).where(User.id == uuid.UUID(current_user["sub"]))
    )
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    result = await db.execute(
        select(DocumentShare, Document).join(
            Document, DocumentShare.document_id == Document.id
        ).where(
            DocumentShare.shared_with_email == user.email
        )
    )
    rows = result.all()
    return [
        {
            "share_id": str(share.id),
            "document_id": str(doc.id),
            "filename": doc.filename,
            "file_type": doc.file_type,
            "file_url": doc.file_url,
            "category": doc.category,
            "shared_at": share.shared_at.isoformat(),
            "note": share.note,
        }
        for share, doc in rows
    ]


@router.get("/document/{document_id}/shares")
async def list_document_shares(
    document_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Owner: list all people a document has been shared with."""
    org_id = uuid.UUID(current_user["org_id"])
    result = await db.execute(
        select(DocumentShare).where(
            DocumentShare.document_id == uuid.UUID(document_id),
            DocumentShare.owner_org_id == org_id,
        )
    )
    shares = result.scalars().all()
    return [
        {
            "share_id": str(s.id),
            "shared_with_email": s.shared_with_email,
            "note": s.note,
            "shared_at": s.shared_at.isoformat(),
        }
        for s in shares
    ]


@router.get("/clients")
async def list_clients_who_shared_with_me(
    search: str = "",
    page: int = 1,
    limit: int = 50,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Accountant: list unique clients (by org) who have shared documents with me.
    Paginated, supports search by org name. Handles 100-1000+ clients.
    """
    user_result = await db.execute(
        select(User).where(User.id == uuid.UUID(current_user["sub"]))
    )
    me = user_result.scalar_one_or_none()
    if not me:
        raise HTTPException(status_code=401, detail="User not found")

    # Base subquery: distinct owner orgs that shared docs with this accountant's email
    base = (
        select(
            DocumentShare.owner_org_id,
            func.count(DocumentShare.id).label("doc_count"),
            func.max(DocumentShare.shared_at).label("last_shared"),
        )
        .where(DocumentShare.shared_with_email == me.email)
        .group_by(DocumentShare.owner_org_id)
        .subquery()
    )

    # Join with org for name/type, wrap as subquery for search filtering
    org_alias = (
        select(
            base.c.owner_org_id,
            base.c.doc_count,
            base.c.last_shared,
            Organization.name.label("org_name"),
            Organization.org_type,
        )
        .join(Organization, base.c.owner_org_id == Organization.id)
        .subquery()
    )

    count_q = select(func.count()).select_from(org_alias)
    if search:
        count_q = count_q.where(func.lower(org_alias.c.org_name).contains(search.lower()))

    total_result = await db.execute(count_q)
    total = total_result.scalar() or 0

    data_q = select(org_alias)
    if search:
        data_q = data_q.where(func.lower(org_alias.c.org_name).contains(search.lower()))
    data_q = data_q.order_by(desc(org_alias.c.last_shared)).offset((page - 1) * limit).limit(limit)

    rows = await db.execute(data_q)
    clients = rows.all()

    return {
        "clients": [
            {
                "org_id": str(c.owner_org_id),
                "org_name": c.org_name,
                "org_type": c.org_type,
                "document_count": c.doc_count,
                "last_shared_at": c.last_shared.isoformat() if c.last_shared else None,
            }
            for c in clients
        ],
        "total": total,
        "page": page,
        "pages": max(1, (total + limit - 1) // limit),
    }


@router.get("/client/{org_id}/documents")
async def get_documents_from_client(
    org_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Accountant: list all documents a specific client org has shared with me.
    """
    user_result = await db.execute(
        select(User).where(User.id == uuid.UUID(current_user["sub"]))
    )
    me = user_result.scalar_one_or_none()
    if not me:
        raise HTTPException(status_code=401, detail="User not found")

    result = await db.execute(
        select(DocumentShare, Document)
        .join(Document, DocumentShare.document_id == Document.id)
        .where(
            DocumentShare.shared_with_email == me.email,
            DocumentShare.owner_org_id == uuid.UUID(org_id),
        )
        .order_by(DocumentShare.shared_at.desc())
    )
    rows = result.all()
    return [
        {
            "share_id": str(share.id),
            "document_id": str(doc.id),
            "filename": doc.filename,
            "file_type": doc.file_type,
            "file_url": doc.file_url,
            "file_size": doc.file_size,
            "category": doc.category,
            "status": doc.status,
            "shared_at": share.shared_at.isoformat(),
            "note": share.note,
        }
        for share, doc in rows
    ]
