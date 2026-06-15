from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from uuid import UUID
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import require_write
from app.core.pagination import PaginationParams, paginated_result, apply_sort
from app.core.audit import log_audit
from app.models.models import Contact
from app.schemas.schemas import ContactCreate, ContactUpdate, ContactResponse

router = APIRouter(prefix="/contacts", tags=["Contacts"])


@router.get("")
async def list_contacts(
    type: str | None = None,
    p: PaginationParams = Depends(),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = current_user["org_id"]
    base = select(Contact).where(
        Contact.organization_id == org_id,
        Contact.is_active.is_(True),
    )
    if type:
        base = base.where(Contact.type == type)
    if p.search:
        like = f"%{p.search}%"
        base = base.where(or_(
            Contact.name.ilike(like),
            Contact.email.ilike(like),
            Contact.company.ilike(like),
            Contact.phone.ilike(like),
        ))
    if p.date_from:
        base = base.where(Contact.created_at >= p.date_from)
    if p.date_to:
        base = base.where(Contact.created_at <= p.date_to)

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    query = apply_sort(base, Contact, p).offset(p.offset).limit(p.limit)
    items = (await db.execute(query)).scalars().all()
    items = [ContactResponse.model_validate(i) for i in items]
    return paginated_result(items, total, p)


@router.post("", response_model=ContactResponse, status_code=201)
async def create_contact(
    data: ContactCreate,
    current_user: dict = Depends(require_write()),
    db: AsyncSession = Depends(get_db),
):
    contact = Contact(organization_id=current_user["org_id"], **data.model_dump())
    db.add(contact)
    await db.flush()
    return contact


@router.get("/{contact_id}", response_model=ContactResponse)
async def get_contact(
    contact_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Contact).where(Contact.id == contact_id, Contact.organization_id == current_user["org_id"])
    )
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    return contact


@router.patch("/{contact_id}", response_model=ContactResponse)
@router.put("/{contact_id}", response_model=ContactResponse)
async def update_contact(
    contact_id: UUID,
    data: ContactUpdate,
    current_user: dict = Depends(require_write()),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Contact).where(Contact.id == contact_id, Contact.organization_id == current_user["org_id"])
    )
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(contact, key, value)
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "update", "contact", contact_id)
    await db.refresh(contact)
    return contact


@router.delete("/{contact_id}", status_code=204)
async def delete_contact(
    contact_id: UUID,
    current_user: dict = Depends(require_write()),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Contact).where(Contact.id == contact_id, Contact.organization_id == current_user["org_id"])
    )
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    contact.is_active = False  # Soft delete
