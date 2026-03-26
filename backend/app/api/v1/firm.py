"""
Firm / Practice management API.
- Practice dashboard (all client orgs summary)
- Client org CRUD (create, list, archive)
- White-label settings (slug, logo, favicon, brand colors, custom domain)
- Firm profile (description, contact email, website, support email)
- Logo & favicon file upload
- Slug availability check (public)
- Client portal signup
"""
import re
import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from uuid import UUID
from app.core.database import get_db
from app.core.security import get_current_user, hash_password, create_access_token
from app.models.models import (
    Organization, User, UserOrganization, Account,
    Invoice, Bill, Document,
)
from app.services.document_service import storage_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/firm", tags=["Firm / Practice"])

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon"}
MAX_LOGO_SIZE = 2 * 1024 * 1024  # 2MB
MAX_FAVICON_SIZE = 512 * 1024  # 512KB

# Default chart of accounts (same as auth.py)
DEFAULT_ACCOUNTS = [
    ("1000", "Cash at Bank", "asset", "bank"),
    ("1100", "Accounts Receivable", "asset", "current"),
    ("1200", "Prepaid Expenses", "asset", "current"),
    ("2000", "Accounts Payable", "liability", "current"),
    ("2100", "GST Payable", "liability", "current"),
    ("2200", "Accrued Expenses", "liability", "current"),
    ("3000", "Owner's Equity", "equity", "owner"),
    ("3100", "Retained Earnings", "equity", "retained"),
    ("4000", "Sales Revenue", "revenue", "operating"),
    ("4100", "Service Revenue", "revenue", "operating"),
    ("5000", "Cost of Goods Sold", "expense", "cogs"),
    ("5100", "Payroll Expense", "expense", "operating"),
    ("5200", "Rent Expense", "expense", "operating"),
    ("5300", "Utilities Expense", "expense", "operating"),
    ("5400", "Marketing Expense", "expense", "operating"),
    ("5500", "Cloud & IT Expense", "expense", "operating"),
    ("5600", "Travel Expense", "expense", "operating"),
    ("5700", "Office Supplies", "expense", "operating"),
]


def _validate_slug(slug: str) -> str:
    """Normalize and validate a slug."""
    slug = slug.lower().strip()
    slug = re.sub(r'[^a-z0-9-]', '-', slug)
    slug = re.sub(r'-+', '-', slug).strip('-')
    if len(slug) < 3:
        raise HTTPException(400, "Slug must be at least 3 characters")
    if len(slug) > 50:
        raise HTTPException(400, "Slug must be at most 50 characters")
    reserved = {'admin', 'api', 'login', 'register', 'onboarding', 'dashboard',
                'settings', 'billing', 'firm', 'health', 'docs', 'static', 'assets'}
    if slug in reserved:
        raise HTTPException(400, f"'{slug}' is reserved, choose another")
    return slug


async def _require_firm(current_user: dict, db: AsyncSession) -> Organization:
    """Verify current user's org is a firm."""
    result = await db.execute(
        select(Organization).where(Organization.id == current_user["org_id"])
    )
    org = result.scalar_one_or_none()
    if not org or org.org_type != "firm":
        raise HTTPException(403, "This feature is only available to accounting firms")
    return org


def _firm_settings_response(firm: Organization) -> dict:
    """Build the standard firm settings response dict."""
    return {
        "slug": firm.slug,
        "name": firm.name,
        "logo_url": firm.logo_url,
        "favicon_url": firm.favicon_url,
        "brand_primary_color": firm.brand_primary_color,
        "brand_secondary_color": firm.brand_secondary_color,
        "client_portal_enabled": firm.client_portal_enabled,
        "custom_domain": firm.custom_domain,
        "firm_description": firm.firm_description,
        "firm_contact_email": firm.firm_contact_email,
        "firm_website": firm.firm_website,
        "firm_support_email": firm.firm_support_email,
        "portal_url": f"/p/{firm.slug}" if firm.slug else None,
    }


# ──────────────────────────────────────────────
# White-label settings
# ──────────────────────────────────────────────
class WhiteLabelSettings(BaseModel):
    slug: str | None = None
    logo_url: str | None = None
    brand_primary_color: str | None = None
    brand_secondary_color: str | None = None
    client_portal_enabled: bool | None = None
    custom_domain: str | None = None
    firm_description: str | None = None
    firm_contact_email: str | None = None
    firm_website: str | None = None
    firm_support_email: str | None = None


@router.get("/settings")
async def get_firm_settings(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    firm = await _require_firm(current_user, db)
    return _firm_settings_response(firm)


@router.patch("/settings")
async def update_firm_settings(
    data: WhiteLabelSettings,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    firm = await _require_firm(current_user, db)

    if data.slug is not None:
        slug = _validate_slug(data.slug)
        existing = await db.execute(
            select(Organization).where(Organization.slug == slug, Organization.id != firm.id)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(400, f"Slug '{slug}' is already taken")
        firm.slug = slug

    if data.logo_url is not None:
        firm.logo_url = data.logo_url
    if data.brand_primary_color is not None:
        firm.brand_primary_color = data.brand_primary_color
    if data.brand_secondary_color is not None:
        firm.brand_secondary_color = data.brand_secondary_color
    if data.client_portal_enabled is not None:
        firm.client_portal_enabled = data.client_portal_enabled
    if data.custom_domain is not None:
        # Validate uniqueness
        if data.custom_domain:
            existing = await db.execute(
                select(Organization).where(
                    Organization.custom_domain == data.custom_domain,
                    Organization.id != firm.id,
                )
            )
            if existing.scalar_one_or_none():
                raise HTTPException(400, "This custom domain is already in use")
        firm.custom_domain = data.custom_domain or None
    if data.firm_description is not None:
        firm.firm_description = data.firm_description
    if data.firm_contact_email is not None:
        firm.firm_contact_email = data.firm_contact_email
    if data.firm_website is not None:
        firm.firm_website = data.firm_website
    if data.firm_support_email is not None:
        firm.firm_support_email = data.firm_support_email

    await db.commit()
    await db.refresh(firm)
    return _firm_settings_response(firm)


# ──────────────────────────────────────────────
# Logo & Favicon upload
# ──────────────────────────────────────────────
@router.post("/logo")
async def upload_firm_logo(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload firm logo image. Replaces existing logo."""
    firm = await _require_firm(current_user, db)

    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(400, f"Image type not allowed: {file.content_type}. Allowed: JPEG, PNG, WebP, SVG, ICO")

    content = await file.read()
    if len(content) > MAX_LOGO_SIZE:
        raise HTTPException(400, "Logo too large (max 2MB)")

    # Delete old logo if stored
    if firm.logo_url:
        try:
            await storage_service.delete_file(firm.logo_url)
        except Exception:
            logger.warning(f"Failed to delete old logo: {firm.logo_url}")

    file_url = await storage_service.upload_file(content, f"logo_{file.filename}", file.content_type)
    firm.logo_url = file_url
    await db.commit()
    await db.refresh(firm)

    return {"logo_url": firm.logo_url}


@router.post("/favicon")
async def upload_firm_favicon(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload firm favicon. Replaces existing favicon."""
    firm = await _require_firm(current_user, db)

    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(400, f"Image type not allowed: {file.content_type}")

    content = await file.read()
    if len(content) > MAX_FAVICON_SIZE:
        raise HTTPException(400, "Favicon too large (max 512KB)")

    if firm.favicon_url:
        try:
            await storage_service.delete_file(firm.favicon_url)
        except Exception:
            logger.warning(f"Failed to delete old favicon: {firm.favicon_url}")

    file_url = await storage_service.upload_file(content, f"favicon_{file.filename}", file.content_type)
    firm.favicon_url = file_url
    await db.commit()
    await db.refresh(firm)

    return {"favicon_url": firm.favicon_url}


# ──────────────────────────────────────────────
# Slug availability check (public)
# ──────────────────────────────────────────────
@router.get("/check-slug/{slug}")
async def check_slug_availability(slug: str, db: AsyncSession = Depends(get_db)):
    """Public: check if a firm slug is available."""
    try:
        normalized = _validate_slug(slug)
    except HTTPException as e:
        return {"slug": slug, "available": False, "reason": e.detail}

    existing = await db.execute(
        select(Organization.id).where(Organization.slug == normalized)
    )
    taken = existing.scalar_one_or_none() is not None
    return {"slug": normalized, "available": not taken}


# ──────────────────────────────────────────────
# Practice dashboard — all client orgs overview
# ──────────────────────────────────────────────
@router.get("/dashboard")
async def practice_dashboard(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Control tower: overview of all client organisations under this firm."""
    firm = await _require_firm(current_user, db)

    # Get all non-archived client orgs under this firm
    result = await db.execute(
        select(Organization).where(
            Organization.parent_firm_id == firm.id,
            Organization.is_archived == False,
        )
    )
    client_orgs = result.scalars().all()

    clients = []
    for org in client_orgs:
        inv_count = await db.execute(
            select(func.count(Invoice.id)).where(Invoice.organization_id == org.id)
        )
        bill_count = await db.execute(
            select(func.count(Bill.id)).where(Bill.organization_id == org.id)
        )
        doc_count = await db.execute(
            select(func.count(Document.id)).where(Document.organization_id == org.id)
        )
        pending_docs = await db.execute(
            select(func.count(Document.id)).where(
                Document.organization_id == org.id,
                Document.status.in_(["uploaded", "processing"])
            )
        )
        user_count = await db.execute(
            select(func.count(UserOrganization.id)).where(
                UserOrganization.organization_id == org.id
            )
        )
        inv_total = await db.execute(
            select(func.coalesce(func.sum(Invoice.total), 0)).where(
                Invoice.organization_id == org.id, Invoice.status != "draft"
            )
        )
        bill_total = await db.execute(
            select(func.coalesce(func.sum(Bill.total), 0)).where(
                Bill.organization_id == org.id, Bill.status != "draft"
            )
        )

        clients.append({
            "id": str(org.id),
            "name": org.name,
            "org_type": org.org_type,
            "country": org.country,
            "currency": org.currency,
            "industry": org.industry,
            "logo_url": org.logo_url,
            "onboarding_completed": org.onboarding_completed,
            "created_at": org.created_at.isoformat(),
            "metrics": {
                "invoices": inv_count.scalar() or 0,
                "bills": bill_count.scalar() or 0,
                "documents": doc_count.scalar() or 0,
                "pending_documents": pending_docs.scalar() or 0,
                "users": user_count.scalar() or 0,
                "total_revenue": float(inv_total.scalar() or 0),
                "total_expenses": float(bill_total.scalar() or 0),
            },
        })

    return {
        "firm_name": firm.name,
        "firm_slug": firm.slug,
        "total_clients": len(clients),
        "clients": clients,
    }


# ──────────────────────────────────────────────
# Client org management
# ──────────────────────────────────────────────
class CreateClientOrg(BaseModel):
    name: str
    org_type: str = "sme"  # sme, individual, freelancer
    country: str = "SG"
    currency: str = "SGD"
    industry: str | None = None


@router.post("/clients")
async def create_client_org(
    data: CreateClientOrg,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new client organisation under the firm."""
    firm = await _require_firm(current_user, db)

    org = Organization(
        name=data.name,
        org_type=data.org_type,
        country=data.country,
        currency=data.currency,
        industry=data.industry,
        parent_firm_id=firm.id,
    )
    db.add(org)
    await db.flush()

    # Create default chart of accounts
    for code, name, acc_type, subtype in DEFAULT_ACCOUNTS:
        db.add(Account(
            organization_id=org.id, code=code, name=name,
            type=acc_type, subtype=subtype, is_system=True,
        ))

    # Add the current accountant user to the client org
    db.add(UserOrganization(
        user_id=current_user["sub"],
        organization_id=org.id,
        role="accountant",
        is_default=False,
    ))
    await db.flush()
    await db.refresh(org)

    return {
        "id": str(org.id),
        "name": org.name,
        "org_type": org.org_type,
        "country": org.country,
        "currency": org.currency,
        "parent_firm_id": str(firm.id),
    }


@router.get("/clients")
async def list_client_orgs(
    include_archived: bool = False,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all client organisations under the firm."""
    firm = await _require_firm(current_user, db)

    query = select(Organization).where(
        Organization.parent_firm_id == firm.id
    ).order_by(Organization.name)

    if not include_archived:
        query = query.where(Organization.is_archived == False)

    result = await db.execute(query)
    orgs = result.scalars().all()

    return [
        {
            "id": str(org.id),
            "name": org.name,
            "org_type": org.org_type,
            "country": org.country,
            "currency": org.currency,
            "industry": org.industry,
            "onboarding_completed": org.onboarding_completed,
            "is_archived": org.is_archived,
            "created_at": org.created_at.isoformat(),
        }
        for org in orgs
    ]


@router.delete("/clients/{client_id}")
async def archive_client_org(
    client_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Archive a client organisation (soft delete)."""
    firm = await _require_firm(current_user, db)

    result = await db.execute(
        select(Organization).where(
            Organization.id == client_id,
            Organization.parent_firm_id == firm.id,
        )
    )
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(404, "Client organisation not found")

    org.is_archived = True
    await db.commit()
    return {"id": str(org.id), "name": org.name, "is_archived": True}


@router.post("/clients/{client_id}/restore")
async def restore_client_org(
    client_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Restore an archived client organisation."""
    firm = await _require_firm(current_user, db)

    result = await db.execute(
        select(Organization).where(
            Organization.id == client_id,
            Organization.parent_firm_id == firm.id,
        )
    )
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(404, "Client organisation not found")

    org.is_archived = False
    await db.commit()
    return {"id": str(org.id), "name": org.name, "is_archived": False}


# ──────────────────────────────────────────────
# Client portal — public endpoints (no auth for portal info)
# ──────────────────────────────────────────────
@router.get("/portal/{slug}")
async def get_portal_info(slug: str, db: AsyncSession = Depends(get_db)):
    """Public: get firm's branding for the client portal login page."""
    result = await db.execute(
        select(Organization).where(
            Organization.slug == slug,
            Organization.org_type == "firm",
            Organization.client_portal_enabled == True,
        )
    )
    firm = result.scalar_one_or_none()
    if not firm:
        raise HTTPException(404, "Portal not found")

    return {
        "firm_name": firm.name,
        "logo_url": firm.logo_url,
        "favicon_url": firm.favicon_url,
        "brand_primary_color": firm.brand_primary_color or "#4D63FF",
        "brand_secondary_color": firm.brand_secondary_color or "#7C9DFF",
        "slug": firm.slug,
        "firm_description": firm.firm_description,
        "firm_website": firm.firm_website,
        "firm_support_email": firm.firm_support_email,
    }


class ClientPortalSignup(BaseModel):
    email: str
    password: str
    full_name: str
    company_name: str
    phone: str | None = None


@router.post("/portal/{slug}/signup")
async def client_portal_signup(
    slug: str,
    data: ClientPortalSignup,
    db: AsyncSession = Depends(get_db),
):
    """Client signs up through the firm's branded portal."""
    # Find firm
    result = await db.execute(
        select(Organization).where(
            Organization.slug == slug,
            Organization.org_type == "firm",
            Organization.client_portal_enabled == True,
        )
    )
    firm = result.scalar_one_or_none()
    if not firm:
        raise HTTPException(404, "Portal not found")

    # Check if email already exists
    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(400, "Email already registered. Please sign in instead.")

    # Create client org under the firm
    client_org = Organization(
        name=data.company_name,
        org_type="sme",
        country=firm.country,
        currency=firm.currency,
        parent_firm_id=firm.id,
    )
    db.add(client_org)
    await db.flush()

    # Create default chart of accounts
    for code, name, acc_type, subtype in DEFAULT_ACCOUNTS:
        db.add(Account(
            organization_id=client_org.id, code=code, name=name,
            type=acc_type, subtype=subtype, is_system=True,
        ))

    # Create client user
    client_user = User(
        organization_id=client_org.id,
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        phone=data.phone,
        role="admin",
    )
    db.add(client_user)
    await db.flush()

    # Add client user as owner of their org
    db.add(UserOrganization(
        user_id=client_user.id,
        organization_id=client_org.id,
        role="owner",
        is_default=True,
    ))

    # Also give the firm's accountants access to this client org
    firm_members = await db.execute(
        select(UserOrganization).where(
            UserOrganization.organization_id == firm.id,
            UserOrganization.role.in_(["owner", "admin"]),
        )
    )
    for membership in firm_members.scalars().all():
        db.add(UserOrganization(
            user_id=membership.user_id,
            organization_id=client_org.id,
            role="accountant",
            is_default=False,
            invited_by=membership.user_id,
        ))

    await db.flush()

    # Return token for the new client user
    token = create_access_token(
        {"sub": str(client_user.id), "org_id": str(client_org.id), "role": "admin"}
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "firm_name": firm.name,
        "organization_id": str(client_org.id),
    }
