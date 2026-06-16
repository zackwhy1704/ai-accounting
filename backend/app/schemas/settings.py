from pydantic import BaseModel, field_validator
from uuid import UUID
from datetime import datetime

VALID_CONTACT_TYPES = {"customer", "vendor", "both"}

# ── Contact ──
class ContactCreate(BaseModel):
    name: str
    email: str | None = None
    phone: str | None = None
    type: str = "customer"
    entity_type: str = "company"  # company, individual
    company: str | None = None
    address: str | None = None
    tax_number: str | None = None
    brn: str | None = None
    ic_number: str | None = None
    tin: str | None = None
    msic_code: str | None = None
    billing_address_line1: str | None = None
    billing_address_line2: str | None = None
    billing_city: str | None = None
    billing_state: str | None = None
    billing_postcode: str | None = None
    billing_country: str | None = None
    shipping_address_line1: str | None = None
    shipping_address_line2: str | None = None
    shipping_city: str | None = None
    shipping_state: str | None = None
    shipping_postcode: str | None = None
    shipping_country: str | None = None
    default_currency: str | None = None
    default_payment_terms: str | None = None
    default_payment_terms_days: int | None = None

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Contact name cannot be empty")
        return v.strip()

    @field_validator("email")
    @classmethod
    def email_lowercase(cls, v: str | None) -> str | None:
        return v.lower().strip() if v else v


class ContactUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    type: str | None = None
    entity_type: str | None = None
    company: str | None = None
    address: str | None = None
    tax_number: str | None = None
    brn: str | None = None
    ic_number: str | None = None
    tin: str | None = None
    msic_code: str | None = None
    billing_address_line1: str | None = None
    billing_address_line2: str | None = None
    billing_city: str | None = None
    billing_state: str | None = None
    billing_postcode: str | None = None
    billing_country: str | None = None
    shipping_address_line1: str | None = None
    shipping_address_line2: str | None = None
    shipping_city: str | None = None
    shipping_state: str | None = None
    shipping_postcode: str | None = None
    shipping_country: str | None = None
    default_currency: str | None = None
    default_payment_terms: str | None = None
    default_payment_terms_days: int | None = None

class ContactResponse(BaseModel):
    id: UUID
    name: str
    email: str | None
    phone: str | None
    type: str
    entity_type: str
    company: str | None
    address: str | None
    tax_number: str | None
    brn: str | None
    ic_number: str | None
    tin: str | None
    msic_code: str | None
    billing_address_line1: str | None = None
    billing_address_line2: str | None = None
    billing_city: str | None = None
    billing_state: str | None = None
    billing_postcode: str | None = None
    billing_country: str | None = None
    shipping_address_line1: str | None = None
    shipping_address_line2: str | None = None
    shipping_city: str | None = None
    shipping_state: str | None = None
    shipping_postcode: str | None = None
    shipping_country: str | None = None
    default_currency: str | None = None
    default_payment_terms: str | None = None
    default_payment_terms_days: int | None = None
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
