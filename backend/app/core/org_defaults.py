"""Fetch org-configured default GL account IDs."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.models import Organization

async def get_default_accounts(db: AsyncSession, org_id) -> dict:
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if not org:
        return {}
    return {
        "ar": org.default_ar_account_id,
        "ap": org.default_ap_account_id,
        "bank": org.default_bank_account_id,
        "revenue": org.default_revenue_account_id,
        "expense": org.default_expense_account_id,
    }
