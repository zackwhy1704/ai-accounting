from pydantic import BaseModel, EmailStr, Field, field_validator
from uuid import UUID
from datetime import datetime


# ── Auth ──
class UserRegister(BaseModel):
    email: str
    password: str = Field(min_length=8)
    full_name: str
    phone: str | None = None
    company_name: str

    @field_validator("email")
    @classmethod
    def email_lowercase(cls, v: str) -> str:
        return v.lower().strip()

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit")
        return v

class UserLogin(BaseModel):
    email: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

class UserResponse(BaseModel):
    id: UUID
    email: str
    full_name: str
    phone: str | None = None
    role: str
    organization_id: UUID
    model_config = {"from_attributes": True}


# ── Onboarding ──
class OnboardingRequest(BaseModel):
    """Step 2 of registration: business setup (Xero-style)."""
    org_type: str = "sme"  # sme, firm, individual, freelancer
    business_name: str
    industry: str | None = None
    country: str = "SG"
    timezone: str = "Asia/Singapore"
    currency: str = "SGD"
    fiscal_year_end_day: int = 31
    fiscal_year_end_month: int = 12
    has_employees: bool = False
    previous_tool: str | None = None

class OrganizationResponse(BaseModel):
    id: UUID
    name: str
    org_type: str
    country: str
    timezone: str
    currency: str
    fiscal_year_end_day: int
    fiscal_year_end_month: int
    has_employees: bool
    industry: str | None = None
    plan: str
    onboarding_completed: bool
    created_at: datetime
    model_config = {"from_attributes": True}

class UserOrgMembership(BaseModel):
    organization_id: UUID
    organization_name: str
    org_type: str
    role: str
    is_default: bool
    model_config = {"from_attributes": True}

class SwitchOrgRequest(BaseModel):
    organization_id: UUID

class CreateOrgRequest(BaseModel):
    """For accountants/firms adding a new client org."""
    name: str
    org_type: str = "sme"
    country: str = "SG"
    currency: str = "SGD"
    industry: str | None = None
