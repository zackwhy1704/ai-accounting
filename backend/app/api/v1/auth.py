from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import hash_password, verify_password, create_access_token, get_current_user
from app.models.models import User, Organization, Account, UserOrganization, TaxRate
from app.schemas.schemas import (
    UserRegister, UserLogin, TokenResponse, UserResponse,
    OnboardingRequest, OrganizationResponse,
)

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

# Default tax codes seeded for every new organization
DEFAULT_TAX_CODES = [
    ("SR", "Standard Rate (6%)", 6.0, "SST", True, "sales_tax"),
    ("SR-S", "Service Tax (6%)", 6.0, "SST", False, "service_tax"),
    ("SR-10", "Sales Tax (10%)", 10.0, "SST", False, "sales_tax"),
    ("ZR", "Zero Rated", 0.0, "SST", False, None),
    ("ES", "Exempt Supply", 0.0, "NONE", False, None),
    ("OS", "Out of Scope", 0.0, "NONE", False, None),
    ("RS", "Relief Supply", 0.0, "NONE", False, None),
    ("GS", "GST Standard (8%)", 8.0, "GST", False, None),
    ("GS9", "GST 9%", 9.0, "GST", False, None),
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

    # Create default tax codes
    for code, name, rate, tax_type, is_default, sst_cat in DEFAULT_TAX_CODES:
        db.add(TaxRate(
            organization_id=org.id,
            code=code, name=name, rate=rate,
            tax_type=tax_type, is_default=is_default,
            sst_category=sst_cat,
        ))

    # Create user
    user = User(
        organization_id=org.id,
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        phone=data.phone,
        role="admin",
    )
    db.add(user)
    await db.flush()

    # Create user↔org membership
    membership = UserOrganization(
        user_id=user.id,
        organization_id=org.id,
        role="owner",
        is_default=True,
    )
    db.add(membership)
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


@router.get("/me")
async def get_me(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User, Organization)
        .join(Organization, User.organization_id == Organization.id)
        .where(User.id == current_user["sub"])
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    user, org = row
    return {
        "id": str(user.id),
        "email": user.email,
        "full_name": user.full_name,
        "phone": user.phone,
        "role": user.role,
        "organization_id": str(user.organization_id),
        "onboarding_completed": org.onboarding_completed,
        "org_type": org.org_type,
        "country": org.country,
        "parent_firm_id": str(org.parent_firm_id) if org.parent_firm_id else None,
    }


class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Send a password reset email. Always returns success to prevent email enumeration."""
    from app.core.config import get_settings
    settings = get_settings()

    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if user and settings.RESEND_API_KEY:
        # Generate a reset token (JWT, 1 hour expiry)
        from datetime import timedelta
        reset_token = create_access_token(
            {"sub": str(user.id), "type": "password_reset"},
            expires_delta=timedelta(hours=1),
        )
        reset_url = f"{settings.FRONTEND_URL}/login?reset_token={reset_token}"

        try:
            import resend
            resend.api_key = settings.RESEND_API_KEY
            resend.Emails.send({
                "from": settings.EMAIL_FROM,
                "to": [user.email],
                "subject": "Reset your Accruly password",
                "html": f"""
                    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
                        <h2 style="color: #1a0b2e;">Reset your password</h2>
                        <p>Hi {user.full_name},</p>
                        <p>We received a request to reset your password. Click the button below to set a new one:</p>
                        <a href="{reset_url}" style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #7C9DFF, #4D63FF); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 16px 0;">Reset Password</a>
                        <p style="color: #666; font-size: 14px;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
                        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
                        <p style="color: #999; font-size: 12px;">Accruly — AI-powered accounting</p>
                    </div>
                """,
            })
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Failed to send reset email: {e}")

    return {"message": "If an account with that email exists, a reset link has been sent."}


@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Reset password using a valid reset token."""
    from jose import jwt, JWTError
    from app.core.config import get_settings
    settings = get_settings()

    try:
        payload = jwt.decode(body.token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("type") != "password_reset":
            raise HTTPException(status_code=400, detail="Invalid reset token")
        user_id = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.hashed_password = hash_password(body.new_password)
    await db.commit()
    return {"message": "Password reset successfully. You can now log in."}


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
    return {"currency": org.currency, "name": org.name, "country": org.country, "tax_regime": getattr(org, "tax_regime", "MY_SST"), "einvoice_enabled": getattr(org, "einvoice_enabled", False), "einvoice_supplier_tin": getattr(org, "einvoice_supplier_tin", None), "einvoice_sandbox": getattr(org, "einvoice_sandbox", True), "sst_registration_no": getattr(org, "sst_registration_no", None)}


class CurrencyUpdate(BaseModel):
    currency: str

@router.patch("/org-settings/currency")
async def update_org_currency(
    body: CurrencyUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.currency not in ("SGD", "MYR", "USD", "HKD", "GBP", "AUD", "EUR"):
        raise HTTPException(status_code=400, detail="Unsupported currency")
    from app.models.models import Organization
    result = await db.execute(select(Organization).where(Organization.id == current_user["org_id"]))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    org.currency = body.currency
    await db.commit()
    return {"currency": org.currency}


# ──────────────────────────────────────────────
# Onboarding (Step 2: after register, set up business)
# ──────────────────────────────────────────────
@router.post("/onboarding", response_model=OrganizationResponse)
async def complete_onboarding(
    data: OnboardingRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Complete onboarding: set org type, country, fiscal year, etc."""
    result = await db.execute(select(Organization).where(Organization.id == current_user["org_id"]))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    org.name = data.business_name
    org.org_type = data.org_type
    org.industry = data.industry
    org.country = data.country
    org.timezone = data.timezone
    org.currency = data.currency
    org.fiscal_year_end_day = data.fiscal_year_end_day
    org.fiscal_year_end_month = data.fiscal_year_end_month
    org.has_employees = data.has_employees
    org.previous_tool = data.previous_tool
    org.onboarding_completed = True
    await db.commit()
    await db.refresh(org)
    return org
