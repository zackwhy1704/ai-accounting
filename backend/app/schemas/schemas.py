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


# ── Quotation ──
class QuotationLineItemCreate(BaseModel):
    description: str
    quantity: float = 1.0
    unit_price: float
    tax_rate: float = 0.0
    discount: float = 0.0
    account_id: UUID | None = None

class QuotationCreate(BaseModel):
    contact_id: UUID
    issue_date: datetime
    expiry_date: datetime
    reference: str | None = None
    currency: str = "MYR"
    notes: str | None = None
    terms: str | None = None
    line_items: list[QuotationLineItemCreate]

class QuotationResponse(BaseModel):
    id: UUID
    quotation_number: str
    contact_id: UUID
    status: str
    issue_date: datetime
    expiry_date: datetime
    reference: str | None
    subtotal: float
    discount_amount: float
    tax_amount: float
    total: float
    currency: str
    notes: str | None
    terms: str | None
    created_at: datetime
    model_config = {"from_attributes": True}


# ── Sales Order ──
class SalesOrderCreate(BaseModel):
    contact_id: UUID
    quotation_id: UUID | None = None
    issue_date: datetime
    delivery_date: datetime | None = None
    reference: str | None = None
    currency: str = "MYR"
    notes: str | None = None
    line_items: list[QuotationLineItemCreate]

class SalesOrderResponse(BaseModel):
    id: UUID
    order_number: str
    contact_id: UUID
    quotation_id: UUID | None
    status: str
    issue_date: datetime
    delivery_date: datetime | None
    reference: str | None
    subtotal: float
    discount_amount: float
    tax_amount: float
    total: float
    currency: str
    notes: str | None
    created_at: datetime
    model_config = {"from_attributes": True}


# ── Delivery Order ──
class DeliveryOrderLineItemCreate(BaseModel):
    description: str
    quantity: float = 1.0
    unit_price: float
    tax_rate: float = 0.0

class DeliveryOrderCreate(BaseModel):
    contact_id: UUID
    invoice_id: UUID | None = None
    quotation_id: UUID | None = None
    sales_order_id: UUID | None = None
    delivery_date: datetime
    ship_to_address: str | None = None
    deliver_to_address: str | None = None
    reference: str | None = None
    currency: str = "MYR"
    notes: str | None = None
    line_items: list[DeliveryOrderLineItemCreate]

class DeliveryOrderResponse(BaseModel):
    id: UUID
    delivery_number: str
    contact_id: UUID
    invoice_id: UUID | None
    quotation_id: UUID | None
    sales_order_id: UUID | None
    status: str
    delivery_date: datetime
    ship_to_address: str | None
    deliver_to_address: str | None
    reference: str | None
    subtotal: float
    tax_amount: float
    total: float
    currency: str
    notes: str | None
    created_at: datetime
    model_config = {"from_attributes": True}


# ── Credit Note ──
class CreditNoteLineItemCreate(BaseModel):
    description: str
    quantity: float = 1.0
    unit_price: float
    tax_rate: float = 0.0
    discount: float = 0.0
    account_id: UUID | None = None

class CreditApplicationCreate(BaseModel):
    invoice_id: UUID
    amount: float

class CreditNoteCreate(BaseModel):
    contact_id: UUID
    invoice_id: UUID | None = None
    issue_date: datetime
    reference: str | None = None
    currency: str = "MYR"
    notes: str | None = None
    line_items: list[CreditNoteLineItemCreate]
    credit_applications: list[CreditApplicationCreate] = []

class CreditNoteResponse(BaseModel):
    id: UUID
    credit_note_number: str
    contact_id: UUID
    invoice_id: UUID | None
    status: str
    issue_date: datetime
    reference: str | None
    subtotal: float
    discount_amount: float
    tax_amount: float
    total: float
    credit_applied: float
    currency: str
    notes: str | None
    created_at: datetime
    model_config = {"from_attributes": True}


# ── Debit Note ──
class DebitNoteCreate(BaseModel):
    contact_id: UUID
    invoice_id: UUID
    issue_date: datetime
    reference: str | None = None
    currency: str = "MYR"
    notes: str | None = None
    line_items: list[CreditNoteLineItemCreate]

class DebitNoteResponse(BaseModel):
    id: UUID
    debit_note_number: str
    contact_id: UUID
    invoice_id: UUID
    status: str
    issue_date: datetime
    reference: str | None
    subtotal: float
    discount_amount: float
    tax_amount: float
    total: float
    currency: str
    notes: str | None
    created_at: datetime
    model_config = {"from_attributes": True}


# ── Sales Payment ──
class PaymentAllocationCreate(BaseModel):
    invoice_id: UUID
    amount: float

class SalesPaymentCreate(BaseModel):
    contact_id: UUID
    payment_date: datetime
    payment_method: str = "bank"
    reference: str | None = None
    amount: float
    bank_account_id: UUID | None = None
    currency: str = "MYR"
    notes: str | None = None
    allocations: list[PaymentAllocationCreate] = []

class SalesPaymentResponse(BaseModel):
    id: UUID
    payment_number: str
    contact_id: UUID
    status: str
    payment_date: datetime
    payment_method: str
    reference: str | None
    amount: float
    bank_account_id: UUID | None
    currency: str
    notes: str | None
    created_at: datetime
    model_config = {"from_attributes": True}


# ── Sales Refund ──
class SalesRefundCreate(BaseModel):
    contact_id: UUID
    credit_note_id: UUID | None = None
    refund_date: datetime
    refund_method: str = "bank"
    reference: str | None = None
    amount: float
    bank_account_id: UUID | None = None
    currency: str = "MYR"
    notes: str | None = None

class SalesRefundResponse(BaseModel):
    id: UUID
    refund_number: str
    contact_id: UUID
    credit_note_id: UUID | None
    status: str
    refund_date: datetime
    refund_method: str
    reference: str | None
    amount: float
    bank_account_id: UUID | None
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
