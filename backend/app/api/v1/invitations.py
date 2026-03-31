"""
Firm ↔ Client linking via email invitations.

Flow:
  1. Firm calls POST /invitations  → creates FirmClientLink (pending) + emails the SME
  2. SME clicks link → GET /invitations/validate/{token}  (public, no auth)
  3. SME logs in and calls POST /invitations/accept/{token}  (authenticated)
  4. Status → active, client_org_id populated

Both sides can view their links and unlink at any time.
"""
import secrets
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import FirmClientLink, Organization, User

router = APIRouter(prefix="/invitations", tags=["invitations"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class SendInviteRequest(BaseModel):
    client_email: EmailStr
    note: str | None = None


class InviteInfoResponse(BaseModel):
    token: str
    firm_name: str
    firm_logo_url: str | None
    firm_email: str | None
    invited_email: str
    note: str | None
    status: str


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_link_or_404(db: AsyncSession, token: str) -> FirmClientLink:
    result = await db.execute(
        select(FirmClientLink).where(FirmClientLink.token == token)
    )
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Invitation not found or expired")
    return link


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("", status_code=201)
async def send_invite(
    data: SendInviteRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Firm sends an invitation to an SME's email."""
    org_id = UUID(current_user["org_id"])

    # Only firms can send invites
    org_result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = org_result.scalar_one_or_none()
    if not org or org.org_type != "firm":
        raise HTTPException(status_code=403, detail="Only accounting firms can send client invitations")

    # Check if already invited / linked
    existing = await db.execute(
        select(FirmClientLink).where(
            FirmClientLink.firm_org_id == org_id,
            FirmClientLink.invited_email == data.client_email.lower(),
            FirmClientLink.status.in_(["pending", "active"]),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Invitation already sent or client already linked")

    token = secrets.token_urlsafe(32)
    link = FirmClientLink(
        firm_org_id=org_id,
        status="pending",
        invited_email=data.client_email.lower(),
        invited_by=UUID(current_user["sub"]),
        token=token,
        note=data.note,
        created_at=datetime.now(timezone.utc),
    )
    db.add(link)
    await db.commit()
    await db.refresh(link)

    # TODO: send branded email with link
    # accept_url = f"{settings.FRONTEND_URL}/accept-client-invite?token={token}"
    # await send_invite_email(to=data.client_email, firm_name=org.name, url=accept_url, note=data.note)

    return {
        "status": "sent",
        "token": token,
        "invited_email": data.client_email,
        "link_id": str(link.id),
    }


@router.get("/validate/{token}", response_model=InviteInfoResponse)
async def validate_invite(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """Public — SME calls this to see who is inviting them before logging in."""
    link = await _get_link_or_404(db, token)
    if link.status not in ("pending",):
        raise HTTPException(status_code=410, detail="This invitation has already been used or revoked")

    firm_result = await db.execute(select(Organization).where(Organization.id == link.firm_org_id))
    firm = firm_result.scalar_one_or_none()

    return InviteInfoResponse(
        token=token,
        firm_name=firm.name if firm else "Unknown Firm",
        firm_logo_url=firm.logo_url if firm else None,
        firm_email=firm.firm_contact_email if firm else None,
        invited_email=link.invited_email,
        note=link.note,
        status=link.status,
    )


@router.post("/accept/{token}")
async def accept_invite(
    token: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Authenticated SME accepts the invitation — links their org to the firm."""
    link = await _get_link_or_404(db, token)

    if link.status != "pending":
        raise HTTPException(status_code=409, detail="Invitation already accepted or revoked")

    # Verify the logged-in user's email matches invited_email
    user_result = await db.execute(select(User).where(User.id == UUID(current_user["sub"])))
    user = user_result.scalar_one_or_none()
    if not user or user.email.lower() != link.invited_email:
        raise HTTPException(
            status_code=403,
            detail=f"This invitation was sent to {link.invited_email}. Please log in with that account."
        )

    link.client_org_id = UUID(current_user["org_id"])
    link.status = "active"
    link.accepted_at = datetime.now(timezone.utc)
    await db.commit()

    return {"status": "linked", "link_id": str(link.id)}


@router.post("/decline/{token}")
async def decline_invite(
    token: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """SME declines the invitation."""
    link = await _get_link_or_404(db, token)
    if link.status != "pending":
        raise HTTPException(status_code=409, detail="Invitation is not pending")

    user_result = await db.execute(select(User).where(User.id == UUID(current_user["sub"])))
    user = user_result.scalar_one_or_none()
    if not user or user.email.lower() != link.invited_email:
        raise HTTPException(status_code=403, detail="Not your invitation")

    link.status = "declined"
    await db.commit()
    return {"status": "declined"}


@router.get("/my-links")
async def get_my_linked_firms(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """SME: list all firms linked to their account."""
    org_id = UUID(current_user["org_id"])
    result = await db.execute(
        select(FirmClientLink).where(
            FirmClientLink.client_org_id == org_id,
            FirmClientLink.status == "active",
        )
    )
    links = result.scalars().all()

    out = []
    for link in links:
        firm_result = await db.execute(select(Organization).where(Organization.id == link.firm_org_id))
        firm = firm_result.scalar_one_or_none()
        out.append({
            "link_id": str(link.id),
            "firm_org_id": str(link.firm_org_id),
            "firm_name": firm.name if firm else "Unknown",
            "firm_logo_url": firm.logo_url if firm else None,
            "firm_email": firm.firm_contact_email if firm else None,
            "linked_at": link.accepted_at.isoformat() if link.accepted_at else None,
        })
    return out


@router.get("/pending-for-me")
async def get_pending_invites_for_me(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """SME: list pending invitations sent to their email (not yet accepted)."""
    user_result = await db.execute(select(User).where(User.id == UUID(current_user["sub"])))
    user = user_result.scalar_one_or_none()
    if not user:
        return []

    result = await db.execute(
        select(FirmClientLink).where(
            FirmClientLink.invited_email == user.email.lower(),
            FirmClientLink.status == "pending",
        )
    )
    links = result.scalars().all()

    out = []
    for link in links:
        firm_result = await db.execute(select(Organization).where(Organization.id == link.firm_org_id))
        firm = firm_result.scalar_one_or_none()
        out.append({
            "link_id": str(link.id),
            "token": link.token,
            "firm_name": firm.name if firm else "Unknown",
            "firm_logo_url": firm.logo_url if firm else None,
            "note": link.note,
            "created_at": link.created_at.isoformat(),
        })
    return out


@router.get("/firm-clients")
async def get_firm_clients(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Firm: list all linked client orgs."""
    org_id = UUID(current_user["org_id"])
    result = await db.execute(
        select(FirmClientLink).where(
            FirmClientLink.firm_org_id == org_id,
        ).order_by(FirmClientLink.created_at.desc())
    )
    links = result.scalars().all()

    out = []
    for link in links:
        client_org = None
        if link.client_org_id:
            c = await db.execute(select(Organization).where(Organization.id == link.client_org_id))
            client_org = c.scalar_one_or_none()
        out.append({
            "link_id": str(link.id),
            "status": link.status,
            "invited_email": link.invited_email,
            "client_org_id": str(link.client_org_id) if link.client_org_id else None,
            "client_name": client_org.name if client_org else None,
            "client_type": client_org.org_type if client_org else None,
            "note": link.note,
            "created_at": link.created_at.isoformat(),
            "accepted_at": link.accepted_at.isoformat() if link.accepted_at else None,
        })
    return out


@router.delete("/{link_id}")
async def unlink(
    link_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Either side can unlink — sets status to revoked."""
    org_id = UUID(current_user["org_id"])
    result = await db.execute(
        select(FirmClientLink).where(FirmClientLink.id == UUID(link_id))
    )
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")

    # Must be one of the two parties
    if link.firm_org_id != org_id and link.client_org_id != org_id:
        raise HTTPException(status_code=403, detail="Not authorised to remove this link")

    link.status = "revoked"
    await db.commit()
    return {"status": "unlinked"}
