"""Plan-limit enforcement helpers (seats, scans)."""
from fastapi import HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auth import Organization, UserOrganization


async def assert_seat_available(db: AsyncSession, org_id) -> None:
    """Raise 402 if the org has no free user seat under its plan's users_limit.

    users_limit == -1 means unlimited. Counts distinct users currently linked to
    the org. Call this before adding a new UserOrganization membership.
    """
    org = (await db.execute(
        select(Organization).where(Organization.id == org_id)
    )).scalar_one_or_none()
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    limit = getattr(org, "users_limit", -1)
    if limit == -1:
        return
    current = (await db.execute(
        select(func.count(func.distinct(UserOrganization.user_id)))
        .where(UserOrganization.organization_id == org_id)
    )).scalar() or 0
    if current >= limit:
        raise HTTPException(
            status_code=402,
            detail="User limit reached for your plan. Upgrade to add more users.",
        )
