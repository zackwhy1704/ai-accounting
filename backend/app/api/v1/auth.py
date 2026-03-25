from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import hash_password, verify_password, create_access_token, get_current_user
from app.models.models import User, Organization, Account
from app.schemas.schemas import UserRegister, UserLogin, TokenResponse, UserResponse

router = APIRouter(prefix="/auth", tags=["Authentication"])

# Default chart of accounts for new organizations
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


@router.post("/register", response_model=TokenResponse)
async def register(data: UserRegister, db: AsyncSession = Depends(get_db)):
    # Check existing user
    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    # Create organization
    org = Organization(name=data.company_name)
    db.add(org)
    await db.flush()

    # Create default chart of accounts
    for code, name, acc_type, subtype in DEFAULT_ACCOUNTS:
        account = Account(
            organization_id=org.id,
            code=code,
            name=name,
            type=acc_type,
            subtype=subtype,
            is_system=True,
        )
        db.add(account)

    # Create user
    user = User(
        organization_id=org.id,
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        role="admin",
    )
    db.add(user)
    await db.flush()

    token = create_access_token(
        {"sub": str(user.id), "org_id": str(org.id), "role": user.role}
    )
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    token = create_access_token(
        {"sub": str(user.id), "org_id": str(user.organization_id), "role": user.role}
    )
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == current_user["sub"]))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get("/org-settings")
async def get_org_settings(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.models.models import Organization
    result = await db.execute(select(Organization).where(Organization.id == current_user["org_id"]))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return {"currency": org.currency, "name": org.name}


class CurrencyUpdate(BaseModel):
    currency: str

@router.patch("/org-settings/currency")
async def update_org_currency(
    body: CurrencyUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.currency not in ("SGD", "MYR", "USD"):
        raise HTTPException(status_code=400, detail="Currency must be SGD, MYR, or USD")
    from app.models.models import Organization
    result = await db.execute(select(Organization).where(Organization.id == current_user["org_id"]))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    org.currency = body.currency
    await db.commit()
    return {"currency": org.currency}
