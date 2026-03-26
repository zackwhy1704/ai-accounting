from pydantic import BaseModel, EmailStr, Field
from uuid import UUID
from datetime import datetime


# ── Auth ──
class UserRegister(BaseModel):
    email: str
    password: str = Field(min_length=8)
    full_name: str
    phone: str | None = None
    company_name: str

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


# ── Contact ──
class ContactCreate(BaseModel):
    name: str
    email: str | None = None
    phone: str | None = None
    type: str = "customer"
    company: str | None = None
    address: str | None = None
    tax_number: str | None = None

class ContactResponse(BaseModel):
    id: UUID
    name: str
    email: str | None
    phone: str | None
    type: str
    company: str | None
    address: str | None
    tax_number: str | None
    created_at: datetime
    model_config = {"from_attributes": True}


# ── Invoice ──
class LineItemCreate(BaseModel):
    description: str
    quantity: float = 1.0
    unit_price: float
    tax_rate: float = 0.0
    account_id: UUID | None = None

class InvoiceCreate(BaseModel):
    contact_id: UUID
    issue_date: datetime
    due_date: datetime
    currency: str = "SGD"
    notes: str | None = None
    line_items: list[LineItemCreate]

class InvoiceResponse(BaseModel):
    id: UUID
    invoice_number: str
    contact_id: UUID
    status: str
    issue_date: datetime
    due_date: datetime
    subtotal: float
    tax_amount: float
    total: float
    amount_paid: float
    currency: str
    notes: str | None
    created_at: datetime
    model_config = {"from_attributes": True}


# ── Bill ──
class BillCreate(BaseModel):
    contact_id: UUID
    bill_number: str
    issue_date: datetime
    due_date: datetime
    currency: str = "SGD"
    notes: str | None = None
    line_items: list[LineItemCreate]

class BillResponse(BaseModel):
    id: UUID
    bill_number: str
    contact_id: UUID
    status: str
    issue_date: datetime
    due_date: datetime
    subtotal: float
    tax_amount: float
    total: float
    amount_paid: float
    currency: str
    notes: str | None
    created_at: datetime
    model_config = {"from_attributes": True}


# ── Account ──
class AccountCreate(BaseModel):
    code: str
    name: str
    type: str
    subtype: str | None = None
    description: str | None = None
    currency: str = "SGD"

class AccountResponse(BaseModel):
    id: UUID
    code: str
    name: str
    type: str
    subtype: str | None
    currency: str
    is_system: bool
    created_at: datetime
    model_config = {"from_attributes": True}


# ── Transaction / Journal ──
class JournalEntryCreate(BaseModel):
    account_id: UUID
    debit: float = 0.0
    credit: float = 0.0

class TransactionCreate(BaseModel):
    date: datetime
    description: str
    reference: str | None = None
    entries: list[JournalEntryCreate]

class TransactionResponse(BaseModel):
    id: UUID
    date: datetime
    description: str
    reference: str | None
    source: str
    is_posted: bool
    created_at: datetime
    model_config = {"from_attributes": True}


# ── Document ──
class DocumentResponse(BaseModel):
    id: UUID
    filename: str
    file_url: str
    file_type: str
    file_size: int
    status: str
    category: str | None = None
    ai_extracted_data: dict | None
    ai_confidence: float | None = None
    linked_bill_id: UUID | None = None
    linked_invoice_id: UUID | None = None
    uploaded_at: datetime
    processed_at: datetime | None
    model_config = {"from_attributes": True}


# ── Dashboard ──
class DashboardResponse(BaseModel):
    total_revenue: float
    total_expenses: float
    net_income: float
    accounts_receivable: float
    accounts_payable: float
    cash_balance: float
    overdue_invoices: int
    pending_documents: int
