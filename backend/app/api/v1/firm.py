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
from pydantic import BaseModel, field_validator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from uuid import UUID
from app.core.database import get_db
from app.core.security import get_current_user, hash_password, create_access_token
from app.models.models import (
    Organization, User, UserOrganization, Account,
    Invoice, Bill, Document, ClientInvitation,
)
from sqlalchemy import desc
from app.services.document_service import storage_service
from datetime import datetime, timezone

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


async def _get_org(current_user: dict, db: AsyncSession) -> Organization:
    """Return the current user's organization (any org type)."""
    result = await db.execute(
        select(Organization).where(Organization.id == current_user["org_id"])
    )
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(404, "Organization not found")
    return org


# Alias kept for firm-specific endpoints that still exist
async def _require_firm(current_user: dict, db: AsyncSession) -> Organization:
    return await _get_org(current_user, db)


def _firm_settings_response(org: Organization) -> dict:
    """Build the org settings/branding response dict."""
    return {
        "slug": org.slug,
        "name": org.name,
        "logo_url": org.logo_url,
        "client_portal_enabled": org.client_portal_enabled,
        "custom_domain": org.custom_domain,
        "firm_description": org.firm_description,
        "firm_contact_email": org.firm_contact_email,
        "firm_website": org.firm_website,
        "firm_support_email": org.firm_support_email,
        "portal_url": f"/p/{org.slug}" if org.slug else None,
    }


# ──────────────────────────────────────────────
# White-label settings
# ──────────────────────────────────────────────
class WhiteLabelSettings(BaseModel):
    slug: str | None = None
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
    org = await _get_org(current_user, db)
    return _firm_settings_response(org)


@router.patch("/settings")
async def update_firm_settings(
    data: WhiteLabelSettings,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org = await _get_org(current_user, db)

    if data.slug is not None:
        slug = _validate_slug(data.slug)
        existing = await db.execute(
            select(Organization).where(Organization.slug == slug, Organization.id != org.id)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(400, f"Slug '{slug}' is already taken")
        org.slug = slug

    if data.client_portal_enabled is not None:
        org.client_portal_enabled = data.client_portal_enabled
    if data.custom_domain is not None:
        if data.custom_domain:
            existing = await db.execute(
                select(Organization).where(
                    Organization.custom_domain == data.custom_domain,
                    Organization.id != org.id,
                )
            )
            if existing.scalar_one_or_none():
                raise HTTPException(400, "This custom domain is already in use")
        org.custom_domain = data.custom_domain or None
    if data.firm_description is not None:
        org.firm_description = data.firm_description
    if data.firm_contact_email is not None:
        org.firm_contact_email = data.firm_contact_email
    if data.firm_website is not None:
        org.firm_website = data.firm_website
    if data.firm_support_email is not None:
        org.firm_support_email = data.firm_support_email

    await db.commit()
    await db.refresh(org)
    return _firm_settings_response(org)


# ──────────────────────────────────────────────
# Logo & Favicon upload
# ──────────────────────────────────────────────
@router.post("/logo")
async def upload_org_logo(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload organisation logo. Replaces existing logo."""
    org = await _get_org(current_user, db)

    allowed = {"image/jpeg", "image/png", "image/webp", "image/svg+xml"}
    if file.content_type not in allowed:
        raise HTTPException(400, f"Image type not allowed. Use JPEG, PNG, WebP or SVG.")

    content = await file.read()
    if len(content) > MAX_LOGO_SIZE:
        raise HTTPException(400, "Logo too large (max 2MB)")

    if org.logo_url:
        try:
            await storage_service.delete_file(org.logo_url)
        except Exception:
            logger.warning(f"Failed to delete old logo: {org.logo_url}")

    file_url = await storage_service.upload_file(content, f"logo_{file.filename}", file.content_type)
    org.logo_url = file_url
    await db.commit()
    await db.refresh(org)

    return {"logo_url": org.logo_url}


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
# Client invitations
# ──────────────────────────────────────────────
class InviteClientRequest(BaseModel):
    contact_name: str
    business_name: str
    email: str

    @field_validator("contact_name", "business_name")
    @classmethod
    def not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Field cannot be empty")
        return v.strip()

    @field_validator("email")
    @classmethod
    def valid_email(cls, v: str) -> str:
        v = v.strip().lower()
        if "@" not in v or "." not in v:
            raise ValueError("Invalid email address")
        return v


@router.post("/clients")
async def invite_client(
    data: InviteClientRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Invite a client via email. Creates an invitation and sends a branded invite email."""
    firm = await _require_firm(current_user, db)

    if not firm.slug or not firm.client_portal_enabled:
        raise HTTPException(400, "Please set up your portal slug and enable the client portal first (White-Label Settings)")

    # Check for existing pending invite to same email
    existing = await db.execute(
        select(ClientInvitation).where(
            ClientInvitation.firm_id == firm.id,
            ClientInvitation.email == data.email,
            ClientInvitation.status == "pending",
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(400, "An invitation has already been sent to this email")

    # Generate invite token (JWT with 7-day expiry)
    from datetime import timedelta
    invite_token = create_access_token(
        {"type": "client_invite", "firm_id": str(firm.id), "email": data.email},
        expires_delta=timedelta(days=7),
    )

    invitation = ClientInvitation(
        firm_id=firm.id,
        invited_by_user_id=current_user["sub"],
        contact_name=data.contact_name,
        business_name=data.business_name,
        email=data.email,
        token=invite_token,
        status="pending",
    )
    db.add(invitation)
    await db.commit()
    await db.refresh(invitation)

    # Send branded invite email
    from app.core.config import get_settings
    settings = get_settings()
    invite_url = f"{settings.FRONTEND_URL}/p/{firm.slug}/invite/{invite_token}"

    primary = firm.brand_primary_color or "#4D63FF"
    secondary = firm.brand_secondary_color or "#7C9DFF"
    firm_name = firm.name

    if settings.RESEND_API_KEY:
        try:
            import resend
            resend.api_key = settings.RESEND_API_KEY
            resend.Emails.send({
                "from": settings.EMAIL_FROM,
                "to": [data.email],
                "subject": f"{firm_name} has invited you to their client portal",
                "html": f"""
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
                        <div style="background: linear-gradient(135deg, {primary}, {secondary}); border-radius: 16px; padding: 32px; text-align: center; margin-bottom: 24px;">
                            <h1 style="color: white; margin: 0; font-size: 22px;">{firm_name}</h1>
                            <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0; font-size: 14px;">Client Portal Invitation</p>
                        </div>
                        <p style="color: #333; font-size: 15px;">Hi {data.contact_name},</p>
                        <p style="color: #555; font-size: 14px; line-height: 1.6;">
                            <strong>{firm_name}</strong> has invited you to join their client portal for <strong>{data.business_name}</strong>.
                            You'll be able to securely upload documents, view reports, and collaborate with your accounting team.
                        </p>
                        <div style="text-align: center; margin: 28px 0;">
                            <a href="{invite_url}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, {primary}, {secondary}); color: white; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 15px;">
                                Accept Invitation
                            </a>
                        </div>
                        <p style="color: #999; font-size: 12px; text-align: center;">This invitation expires in 7 days.</p>
                        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
                        <p style="color: #bbb; font-size: 11px; text-align: center;">Powered by Accruly</p>
                    </div>
                """,
            })
        except Exception as e:
            logger.error(f"Failed to send invite email to {data.email}: {e}")

    return {
        "id": str(invitation.id),
        "email": invitation.email,
        "contact_name": invitation.contact_name,
        "business_name": invitation.business_name,
        "status": invitation.status,
        "token": invite_token,
        "created_at": invitation.created_at.isoformat(),
    }


@router.get("/invitations")
async def list_invitations(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all client invitations for this firm."""
    firm = await _require_firm(current_user, db)
    result = await db.execute(
        select(ClientInvitation)
        .where(ClientInvitation.firm_id == firm.id)
        .order_by(ClientInvitation.created_at.desc())
    )
    invitations = result.scalars().all()
    return [
        {
            "id": str(inv.id),
            "email": inv.email,
            "contact_name": inv.contact_name,
            "business_name": inv.business_name,
            "status": inv.status,
            "client_org_id": str(inv.client_org_id) if inv.client_org_id else None,
            "created_at": inv.created_at.isoformat(),
            "accepted_at": inv.accepted_at.isoformat() if inv.accepted_at else None,
        }
        for inv in invitations
    ]


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


@router.get("/clients/{client_id}/documents")
async def get_client_documents(
    client_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Firm: list all documents belonging to a portal client org."""
    firm = await _require_firm(current_user, db)

    # Verify this client is a portal client under this firm
    client_result = await db.execute(
        select(Organization).where(
            Organization.id == client_id,
            Organization.parent_firm_id == firm.id,
        )
    )
    client_org = client_result.scalar_one_or_none()
    if not client_org:
        raise HTTPException(404, "Client organisation not found")

    docs_result = await db.execute(
        select(Document)
        .where(Document.organization_id == client_id)
        .order_by(desc(Document.uploaded_at))
    )
    docs = docs_result.scalars().all()

    return [
        {
            "id": str(d.id),
            "filename": d.filename,
            "file_url": d.file_url,
            "file_type": d.file_type,
            "file_size": d.file_size,
            "status": d.status,
            "category": d.category,
            "ai_confidence": float(d.ai_confidence) if d.ai_confidence is not None else None,
            "linked_bill_id": str(d.linked_bill_id) if d.linked_bill_id else None,
            "linked_invoice_id": str(d.linked_invoice_id) if d.linked_invoice_id else None,
            "uploaded_at": d.uploaded_at.isoformat(),
            "processed_at": d.processed_at.isoformat() if d.processed_at else None,
        }
        for d in docs
    ]


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

    logo_url = storage_service.get_presigned_url(firm.logo_url) if firm.logo_url else None
    favicon_url = storage_service.get_presigned_url(firm.favicon_url) if firm.favicon_url else None

    return {
        "firm_name": firm.name,
        "logo_url": logo_url,
        "favicon_url": favicon_url,
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


class ClientPortalLogin(BaseModel):
    email: str
    password: str


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
        onboarding_completed=True,
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


@router.post("/portal/{slug}/login")
async def client_portal_login(
    slug: str,
    data: ClientPortalLogin,
    db: AsyncSession = Depends(get_db),
):
    """Existing user logs in through a firm's portal.

    After authenticating, if their org is not already under the firm,
    we set parent_firm_id and grant the firm's accountants access — so
    existing customers who arrive via a white-label URL get properly linked.
    """
    from app.core.security import verify_password

    # Find firm
    firm_result = await db.execute(
        select(Organization).where(
            Organization.slug == slug,
            Organization.org_type == "firm",
            Organization.client_portal_enabled == True,
        )
    )
    firm = firm_result.scalar_one_or_none()
    if not firm:
        raise HTTPException(404, "Portal not found")

    # Authenticate user
    user_result = await db.execute(select(User).where(User.email == data.email.lower()))
    user = user_result.scalar_one_or_none()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(401, "Incorrect email or password")

    # Get the user's org
    org_result = await db.execute(select(Organization).where(Organization.id == user.organization_id))
    org = org_result.scalar_one_or_none()
    if not org:
        raise HTTPException(404, "Organisation not found")

    # If not already linked to this firm, link them now
    if org.parent_firm_id != firm.id:
        org.parent_firm_id = firm.id

        # Grant firm's owners/admins accountant access to this org (if not already)
        firm_members_result = await db.execute(
            select(UserOrganization).where(
                UserOrganization.organization_id == firm.id,
                UserOrganization.role.in_(["owner", "admin"]),
            )
        )
        for membership in firm_members_result.scalars().all():
            existing_access = await db.execute(
                select(UserOrganization).where(
                    UserOrganization.user_id == membership.user_id,
                    UserOrganization.organization_id == org.id,
                )
            )
            if not existing_access.scalar_one_or_none():
                db.add(UserOrganization(
                    user_id=membership.user_id,
                    organization_id=org.id,
                    role="accountant",
                    is_default=False,
                    invited_by=membership.user_id,
                ))

        await db.commit()

    access_token = create_access_token(
        {"sub": str(user.id), "org_id": str(org.id), "role": user.role}
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "firm_name": firm.name,
        "organization_id": str(org.id),
        "was_linked": True,
    }


# ──────────────────────────────────────────────
# Accept invitation — client sets password
# ──────────────────────────────────────────────
@router.get("/invite/{token}")
async def get_invite_info(token: str, db: AsyncSession = Depends(get_db)):
    """Public: validate an invitation token and return details."""
    result = await db.execute(
        select(ClientInvitation).where(ClientInvitation.token == token)
    )
    invitation = result.scalar_one_or_none()
    if not invitation:
        raise HTTPException(404, "Invitation not found")
    if invitation.status != "pending":
        raise HTTPException(400, f"Invitation has already been {invitation.status}")

    # Validate token hasn't expired
    from jose import jwt, JWTError
    from app.core.config import get_settings
    settings = get_settings()
    try:
        jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        invitation.status = "expired"
        await db.commit()
        raise HTTPException(400, "Invitation has expired. Please ask your bookkeeper to send a new one.")

    # Get firm info for branding
    firm_result = await db.execute(select(Organization).where(Organization.id == invitation.firm_id))
    firm = firm_result.scalar_one_or_none()

    return {
        "contact_name": invitation.contact_name,
        "business_name": invitation.business_name,
        "email": invitation.email,
        "firm_name": firm.name if firm else "Your Accounting Firm",
        "brand_primary_color": firm.brand_primary_color if firm else "#4D63FF",
        "brand_secondary_color": firm.brand_secondary_color if firm else "#7C9DFF",
        "logo_url": firm.logo_url if firm else None,
    }


class AcceptInviteRequest(BaseModel):
    token: str
    password: str
    phone: str | None = None


@router.post("/invite/accept")
async def accept_invite(
    data: AcceptInviteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Client accepts an invitation: sets password, creates org + user."""
    result = await db.execute(
        select(ClientInvitation).where(ClientInvitation.token == data.token)
    )
    invitation = result.scalar_one_or_none()
    if not invitation:
        raise HTTPException(404, "Invitation not found")
    if invitation.status != "pending":
        raise HTTPException(400, f"Invitation has already been {invitation.status}")

    if len(data.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")

    # Validate JWT hasn't expired
    from jose import jwt, JWTError
    from app.core.config import get_settings
    settings = get_settings()
    try:
        jwt.decode(data.token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        invitation.status = "expired"
        await db.commit()
        raise HTTPException(400, "Invitation has expired")

    # Check email not already registered
    existing_user = await db.execute(select(User).where(User.email == invitation.email))
    if existing_user.scalar_one_or_none():
        raise HTTPException(400, "Email already registered. Please sign in instead.")

    # Get firm
    firm_result = await db.execute(select(Organization).where(Organization.id == invitation.firm_id))
    firm = firm_result.scalar_one_or_none()
    if not firm:
        raise HTTPException(404, "Firm not found")

    # Create client org
    client_org = Organization(
        name=invitation.business_name,
        org_type="sme",
        country=firm.country,
        currency=firm.currency,
        parent_firm_id=firm.id,
        onboarding_completed=True,
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
        email=invitation.email,
        hashed_password=hash_password(data.password),
        full_name=invitation.contact_name,
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

    # Give all firm owners/admins access to this client org
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

    # Update invitation status
    invitation.status = "accepted"
    invitation.accepted_at = datetime.now(timezone.utc)
    invitation.client_org_id = client_org.id

    await db.commit()

    # Return access token
    access_token = create_access_token(
        {"sub": str(client_user.id), "org_id": str(client_org.id), "role": "admin"}
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "firm_name": firm.name,
        "organization_id": str(client_org.id),
    }
