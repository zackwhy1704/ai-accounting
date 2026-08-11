"""
In-org team management: list members, invite colleagues by email, change
roles, remove members. Distinct from invitations.py (firm↔client linking).

Safety rules: invites can never grant "owner"; the last owner can neither be
demoted nor removed; seats respect Organization.users_limit (-1 = unlimited).
Invite emails go via Resend when configured — the invite link is always
returned so admins can share it manually either way.
"""
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_audit
from app.core.database import get_db
from app.core.permissions import require_admin
from app.core.security import get_current_user, hash_password
from app.models.auth import Organization, OrgUserInvite, User, UserOrganization

router = APIRouter(prefix="/org/users", tags=["org-users"])

INVITABLE_ROLES = {"admin", "accountant", "bookkeeper", "viewer"}
INVITE_TTL_DAYS = 14


async def _member_count(db: AsyncSession, org_id) -> int:
    return (await db.execute(
        select(func.count()).select_from(UserOrganization).where(UserOrganization.organization_id == org_id)
    )).scalar() or 0


async def _assert_seat_available(db: AsyncSession, org_id) -> None:
    org = (await db.execute(select(Organization).where(Organization.id == org_id))).scalar_one_or_none()
    limit = int(getattr(org, "users_limit", 1) or 1)
    if limit == -1:
        return
    if await _member_count(db, org_id) >= limit:
        raise HTTPException(
            status_code=400,
            detail=f"All {limit} seat(s) on your plan are in use. Upgrade the plan to add more team members.",
        )


async def _owner_count(db: AsyncSession, org_id) -> int:
    return (await db.execute(
        select(func.count()).select_from(UserOrganization).where(
            UserOrganization.organization_id == org_id, UserOrganization.role == "owner"
        )
    )).scalar() or 0


@router.get("")
async def list_org_users(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    org_id = current_user["org_id"]
    rows = (await db.execute(
        select(UserOrganization, User)
        .join(User, User.id == UserOrganization.user_id)
        .where(UserOrganization.organization_id == org_id)
        .order_by(UserOrganization.joined_at)
    )).all()
    return [{
        "user_id": str(u.id), "email": u.email, "full_name": u.full_name,
        "role": m.role, "is_active": u.is_active,
        "joined_at": m.joined_at.isoformat() if m.joined_at else None,
        "is_you": str(u.id) == str(current_user["sub"]),
    } for m, u in rows]


class InviteRequest(BaseModel):
    email: str
    role: str = "viewer"

    @field_validator("email")
    @classmethod
    def _email(cls, v):
        v = (v or "").strip().lower()
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("invalid email address")
        return v

    @field_validator("role")
    @classmethod
    def _role(cls, v):
        if v not in INVITABLE_ROLES:
            raise ValueError(f"role must be one of {sorted(INVITABLE_ROLES)}")
        return v


@router.post("/invite", status_code=201)
async def invite_user(payload: InviteRequest, db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_admin())):
    from app.core.config import get_settings
    settings = get_settings()
    org_id = current_user["org_id"]
    email = payload.email.lower().strip()

    existing_user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if existing_user:
        member = (await db.execute(
            select(UserOrganization.id).where(
                UserOrganization.user_id == existing_user.id,
                UserOrganization.organization_id == org_id,
            )
        )).first()
        if member:
            raise HTTPException(status_code=409, detail=f"{email} is already a member of this organization")
    pending = (await db.execute(
        select(OrgUserInvite.id).where(
            OrgUserInvite.organization_id == org_id, OrgUserInvite.email == email,
            OrgUserInvite.status == "pending",
        )
    )).first()
    if pending:
        raise HTTPException(status_code=409, detail=f"There is already a pending invite for {email}")

    await _assert_seat_available(db, org_id)

    invite = OrgUserInvite(
        organization_id=org_id, email=email, role=payload.role,
        token=secrets.token_urlsafe(32)[:64], invited_by=current_user["sub"],
        expires_at=datetime.now(timezone.utc) + timedelta(days=INVITE_TTL_DAYS),
    )
    db.add(invite)
    await db.commit()
    await log_audit(db, org_id, current_user["sub"], "invite", "org_user", invite.id, {"email": email, "role": payload.role})

    invite_link = f"{settings.FRONTEND_URL}/accept-team-invite?token={invite.token}"
    emailed = False
    if settings.RESEND_API_KEY:
        org = (await db.execute(select(Organization).where(Organization.id == org_id))).scalar_one_or_none()
        try:
            import resend
            resend.api_key = settings.RESEND_API_KEY
            resend.Emails.send({
                "from": settings.EMAIL_FROM,
                "to": [email],
                "subject": f"You're invited to join {getattr(org, 'name', 'an organization')} on Accruly",
                "html": (f"<p>You've been invited to join <b>{getattr(org, 'name', '')}</b> as {payload.role}.</p>"
                         f'<p><a href="{invite_link}">Accept the invitation</a> (expires in {INVITE_TTL_DAYS} days).</p>'),
            })
            emailed = True
        except Exception:
            emailed = False  # link is still returned; admin can share it manually

    return {"invite_id": str(invite.id), "email": email, "role": payload.role,
            "invite_link": invite_link, "emailed": emailed,
            "expires_at": invite.expires_at.isoformat()}


@router.get("/invites")
async def list_invites(db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_admin())):
    rows = (await db.execute(
        select(OrgUserInvite).where(
            OrgUserInvite.organization_id == current_user["org_id"],
            OrgUserInvite.status == "pending",
        ).order_by(OrgUserInvite.created_at.desc())
    )).scalars().all()
    now = datetime.now(timezone.utc)
    return [{
        "id": str(i.id), "email": i.email, "role": i.role,
        "expires_at": i.expires_at.isoformat() if i.expires_at else None,
        "expired": bool(i.expires_at and i.expires_at < now),
        "created_at": i.created_at.isoformat() if i.created_at else None,
    } for i in rows]


@router.delete("/invites/{invite_id}", status_code=204)
async def cancel_invite(invite_id: UUID, db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_admin())):
    invite = (await db.execute(
        select(OrgUserInvite).where(
            OrgUserInvite.id == invite_id, OrgUserInvite.organization_id == current_user["org_id"]
        )
    )).scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")
    invite.status = "cancelled"
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "cancel_invite", "org_user", invite_id)


class AcceptInviteRequest(BaseModel):
    token: str
    full_name: str | None = None
    password: str | None = None


@router.post("/accept-invite")
async def accept_invite(payload: AcceptInviteRequest, db: AsyncSession = Depends(get_db)):
    """Public: join the org. Existing accounts just gain a membership; new
    emails must supply full_name + password (8+ chars with a digit)."""
    invite = (await db.execute(
        select(OrgUserInvite).where(OrgUserInvite.token == payload.token, OrgUserInvite.status == "pending")
    )).scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found or already used")
    if invite.expires_at and invite.expires_at < datetime.now(timezone.utc):
        invite.status = "expired"
        await db.commit()
        raise HTTPException(status_code=400, detail="This invite has expired — ask for a new one")

    await _assert_seat_available(db, invite.organization_id)

    user = (await db.execute(select(User).where(User.email == invite.email))).scalar_one_or_none()
    created = False
    if user is None:
        if not payload.password or len(payload.password) < 8 or not any(c.isdigit() for c in payload.password):
            raise HTTPException(status_code=422, detail="Set a password of at least 8 characters including a digit")
        if not (payload.full_name or "").strip():
            raise HTTPException(status_code=422, detail="full_name is required for a new account")
        user = User(
            email=invite.email, full_name=payload.full_name.strip(),
            hashed_password=hash_password(payload.password),
            organization_id=invite.organization_id,
        )
        db.add(user)
        await db.flush()
        created = True

    member = (await db.execute(
        select(UserOrganization.id).where(
            UserOrganization.user_id == user.id,
            UserOrganization.organization_id == invite.organization_id,
        )
    )).first()
    if not member:
        db.add(UserOrganization(
            user_id=user.id, organization_id=invite.organization_id,
            role=invite.role, invited_by=invite.invited_by, is_default=created,
        ))
    invite.status = "accepted"
    await db.commit()
    await log_audit(db, invite.organization_id, user.id, "accept_invite", "org_user", invite.id)
    return {"status": "accepted", "user_created": created, "role": invite.role}


@router.patch("/{user_id}")
async def change_member_role(
    user_id: UUID,
    role: str = Body(..., embed=True),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_admin()),
):
    if role not in INVITABLE_ROLES | {"owner"}:
        raise HTTPException(status_code=400, detail=f"role must be one of {sorted(INVITABLE_ROLES | {'owner'})}")
    org_id = current_user["org_id"]
    member = (await db.execute(
        select(UserOrganization).where(
            UserOrganization.user_id == user_id, UserOrganization.organization_id == org_id
        )
    )).scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    if member.role == "owner" and role != "owner" and await _owner_count(db, org_id) <= 1:
        raise HTTPException(status_code=400, detail="Cannot demote the only owner — assign another owner first")
    member.role = role
    await db.commit()
    await log_audit(db, org_id, current_user["sub"], "change_role", "org_user", user_id, {"role": role})
    return {"user_id": str(user_id), "role": role}


@router.delete("/{user_id}", status_code=204)
async def remove_member(user_id: UUID, db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_admin())):
    org_id = current_user["org_id"]
    if str(user_id) == str(current_user["sub"]):
        raise HTTPException(status_code=400, detail="You cannot remove yourself — ask another admin")
    member = (await db.execute(
        select(UserOrganization).where(
            UserOrganization.user_id == user_id, UserOrganization.organization_id == org_id
        )
    )).scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    if member.role == "owner" and await _owner_count(db, org_id) <= 1:
        raise HTTPException(status_code=400, detail="Cannot remove the only owner")
    await db.delete(member)
    await db.commit()
    await log_audit(db, org_id, current_user["sub"], "remove_member", "org_user", user_id)
