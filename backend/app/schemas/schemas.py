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

class QuotationLineItemResponse(BaseModel):
    id: UUID
    description: str
    quantity: float
    unit_price: float
    tax_rate: float
    discount: float
    account_id: UUID | None
    amount: float
    model_config = {"from_attributes": True}

class QuotationCreate(BaseModel):
    contact_id: UUID
    issue_date: datetime
    expiry_date: datetime
    reference: str | None = None
    currency: str = "MYR"
    notes: str | None = None
    terms: str | None = None
    line_items: list[QuotationLineItemCreate]

class QuotationUpdate(BaseModel):
    contact_id: UUID | None = None
    issue_date: datetime | None = None
    expiry_date: datetime | None = None
    reference: str | None = None
    currency: str | None = None
    notes: str | None = None
    terms: str | None = None
    line_items: list[QuotationLineItemCreate] | None = None

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
    line_items: list[QuotationLineItemResponse] = []
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
    linked_grn_id: UUID | None = None
    linked_record_id: UUID | None = None
    linked_record_type: str | None = None
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


# ── Organization Settings (Country/Tax) ──
class OrganizationSettingsUpdate(BaseModel):
    tax_regime: str | None = None          # MY_SST | SG_GST | AU_GST | EU_VAT | NONE
    sst_registration_no: str | None = None
    einvoice_enabled: bool | None = None
    einvoice_supplier_tin: str | None = None
    einvoice_sandbox: bool | None = None
    base_currency: str | None = None
    fx_auto_update: bool | None = None

class OrganizationSettingsResponse(BaseModel):
    id: UUID
    name: str
    country: str
    currency: str
    tax_regime: str
    sst_registration_no: str | None
    einvoice_enabled: bool
    einvoice_supplier_tin: str | None
    einvoice_sandbox: bool
    base_currency: str
    fx_auto_update: bool
    model_config = {"from_attributes": True}


# ── Tax Rates ──
class TaxRateCreate(BaseModel):
    name: str
    code: str
    rate: float
    tax_type: str                          # SST | GST | VAT | NONE
    is_default: bool = False
    sst_category: str | None = None        # service_tax | sales_tax

class TaxRateUpdate(BaseModel):
    name: str | None = None
    rate: float | None = None
    is_default: bool | None = None
    is_active: bool | None = None
    sst_category: str | None = None

class TaxRateResponse(BaseModel):
    id: UUID
    organization_id: UUID
    name: str
    code: str
    rate: float
    tax_type: str
    is_default: bool
    is_active: bool
    sst_category: str | None
    created_at: datetime
    model_config = {"from_attributes": True}


# ── Exchange Rates ──
class ExchangeRateCreate(BaseModel):
    from_currency: str
    to_currency: str
    rate: float
    rate_date: datetime
    source: str = "manual"

class ExchangeRateResponse(BaseModel):
    id: UUID
    organization_id: UUID
    from_currency: str
    to_currency: str
    rate: float
    rate_date: datetime
    source: str
    created_at: datetime
    model_config = {"from_attributes": True}


# ── Products ──
class ProductCreate(BaseModel):
    code: str | None = None
    name: str
    description: str | None = None
    product_type: str = "service"          # service | inventory | non_inventory
    unit: str | None = None
    unit_price: float = 0.0
    cost_price: float = 0.0
    currency: str = "MYR"
    tax_rate_id: UUID | None = None
    income_account_id: UUID | None = None
    expense_account_id: UUID | None = None
    inventory_account_id: UUID | None = None
    track_inventory: bool = False
    qty_on_hand: float = 0.0
    reorder_point: float | None = None
    image_url: str | None = None

class ProductUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    description: str | None = None
    product_type: str | None = None
    unit: str | None = None
    unit_price: float | None = None
    cost_price: float | None = None
    currency: str | None = None
    tax_rate_id: UUID | None = None
    income_account_id: UUID | None = None
    expense_account_id: UUID | None = None
    inventory_account_id: UUID | None = None
    track_inventory: bool | None = None
    qty_on_hand: float | None = None
    reorder_point: float | None = None
    is_active: bool | None = None
    image_url: str | None = None

class ProductResponse(BaseModel):
    id: UUID
    organization_id: UUID
    code: str | None
    name: str
    description: str | None
    product_type: str
    unit: str | None
    unit_price: float
    cost_price: float
    currency: str
    tax_rate_id: UUID | None
    income_account_id: UUID | None
    expense_account_id: UUID | None
    inventory_account_id: UUID | None
    track_inventory: bool
    qty_on_hand: float
    reorder_point: float | None
    is_active: bool
    image_url: str | None
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


# ── Manual Journals ──
class ManualJournalLineCreate(BaseModel):
    account_id: UUID
    description: str | None = None
    debit: float = 0.0
    credit: float = 0.0
    contact_id: UUID | None = None

class ManualJournalLineResponse(BaseModel):
    id: UUID
    journal_id: UUID
    account_id: UUID
    description: str | None
    debit: float
    credit: float
    contact_id: UUID | None
    model_config = {"from_attributes": True}

class ManualJournalCreate(BaseModel):
    journal_number: str | None = None
    date: datetime
    reference: str | None = None
    description: str | None = None
    currency: str = "MYR"
    lines: list[ManualJournalLineCreate]

class ManualJournalResponse(BaseModel):
    id: UUID
    organization_id: UUID
    journal_number: str
    date: datetime
    reference: str | None
    description: str | None
    status: str
    currency: str
    created_at: datetime
    lines: list[ManualJournalLineResponse] = []
    model_config = {"from_attributes": True}


# ── Bank Rules ──
class BankRuleCreate(BaseModel):
    name: str
    conditions: list[dict]                 # [{"field": "description", "operator": "contains", "value": "..."}]
    condition_logic: str = "AND"
    action_account_id: UUID | None = None
    action_contact_id: UUID | None = None
    action_description: str | None = None
    priority: int = 0

class BankRuleResponse(BaseModel):
    id: UUID
    organization_id: UUID
    name: str
    is_active: bool
    priority: int
    conditions: list[dict]
    condition_logic: str
    action_account_id: UUID | None
    action_contact_id: UUID | None
    action_description: str | None
    times_applied: int
    last_applied_at: datetime | None
    created_at: datetime
    model_config = {"from_attributes": True}


# ── Vendor Credits ──
class VendorCreditLineItem(BaseModel):
    description: str
    quantity: float = 1.0
    unit_price: float
    tax_rate: float = 0.0
    amount: float

class VendorCreditCreate(BaseModel):
    contact_id: UUID
    bill_id: UUID | None = None
    issue_date: datetime
    currency: str = "MYR"
    notes: str | None = None
    line_items: list[VendorCreditLineItem]

class VendorCreditResponse(BaseModel):
    id: UUID
    organization_id: UUID
    vendor_credit_number: str
    contact_id: UUID
    bill_id: UUID | None
    issue_date: datetime
    status: str
    currency: str
    subtotal: float
    tax_amount: float
    total: float
    amount_applied: float
    notes: str | None
    line_items: list[dict]
    created_at: datetime
    model_config = {"from_attributes": True}


# ── Sale Receipts ──
class SaleReceiptLineItem(BaseModel):
    description: str
    quantity: float = 1.0
    unit_price: float
    tax_rate: float = 0.0
    amount: float

class SaleReceiptCreate(BaseModel):
    contact_id: UUID | None = None
    receipt_date: datetime
    currency: str = "MYR"
    payment_method: str = "cash"
    bank_account_id: UUID | None = None
    notes: str | None = None
    line_items: list[SaleReceiptLineItem]

class SaleReceiptResponse(BaseModel):
    id: UUID
    organization_id: UUID
    receipt_number: str
    contact_id: UUID | None
    receipt_date: datetime
    status: str
    currency: str
    subtotal: float
    tax_amount: float
    total: float
    notes: str | None
    line_items: list[dict]
    payment_method: str
    bank_account_id: UUID | None
    created_at: datetime
    model_config = {"from_attributes": True}
