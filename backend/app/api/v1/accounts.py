from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import Account
from app.schemas.schemas import AccountCreate, AccountResponse

router = APIRouter(prefix="/accounts", tags=["Chart of Accounts"])


@router.get("", response_model=list[AccountResponse])
async def list_accounts(
    type: str | None = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Account).where(
        Account.organization_id == current_user["org_id"],
        Account.is_active.is_(True),
    ).order_by(Account.code)
    if type:
        query = query.where(Account.type == type)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=AccountResponse, status_code=201)
async def create_account(
    data: AccountCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Check unique code within org
    existing = await db.execute(
        select(Account).where(
            Account.organization_id == current_user["org_id"],
            Account.code == data.code,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Account code {data.code} already exists")

    account = Account(organization_id=current_user["org_id"], **data.model_dump())
    db.add(account)
    await db.flush()
    return account
