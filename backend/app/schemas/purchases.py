from pydantic import BaseModel, field_validator, model_validator
from uuid import UUID
from datetime import datetime

from app.schemas.sales import LineItemCreate, LineItemResponse, CreditNoteLineItemCreate


# ── Purchase Debit Note ──
class PurchaseDebitNoteCreate(BaseModel):
    contact_id: UUID
    debit_note_number: str | None = None
    bill_id: UUID | None = None
    issue_date: datetime
    reference: str | None = None
    currency: str = "MYR"
    notes: str | None = None
    line_items: list[CreditNoteLineItemCreate]

class PurchaseDebitNoteUpdate(BaseModel):
    contact_id: UUID | None = None
    debit_note_number: str | None = None
    bill_id: UUID | None = None
    issue_date: datetime | None = None
    reference: str | None = None
    currency: str | None = None
    notes: str | None = None
    line_items: list[CreditNoteLineItemCreate] | None = None

class PurchaseDebitNoteLineItemResponse(BaseModel):
    id: UUID
    description: str
    quantity: float
    unit_price: float
    tax_rate: float
    discount: float
    discount_mode: str
    amount: float
    line_type: str
    tax_code_id: UUID | None
    account_id: UUID | None
    sort_order: int
    model_config = {"from_attributes": True}

class PurchaseDebitNoteResponse(BaseModel):
    id: UUID
    debit_note_number: str
    contact_id: UUID
    bill_id: UUID | None
    status: str
    issue_date: datetime
    reference: str | None
    subtotal: float
    discount_amount: float
    tax_amount: float
    total: float
    amount_paid: float = 0.0
    currency: str
    notes: str | None
    created_at: datetime
    line_items: list[PurchaseDebitNoteLineItemResponse] = []
    model_config = {"from_attributes": True}


# ── Bill ──
class BillCreate(BaseModel):
    contact_id: UUID
    bill_number: str | None = None
    issue_date: datetime
    due_date: datetime
    currency: str = "SGD"
    notes: str | None = None
    terms: str | None = None
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
    line_items: list[LineItemCreate]

    @field_validator("line_items")
    @classmethod
    def require_at_least_one_line(cls, v):
        if not v:
            raise ValueError("At least one line item is required")
        return v

    @model_validator(mode="after")
    def due_after_issue(self):
        if self.due_date and self.issue_date and self.due_date < self.issue_date:
            raise ValueError("due_date must not be before issue_date")
        return self


class BillUpdate(BaseModel):
    contact_id: UUID | None = None
    bill_number: str | None = None
    issue_date: datetime | None = None
    due_date: datetime | None = None
    terms: str | None = None
    currency: str | None = None
    notes: str | None = None
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
    line_items: list[LineItemCreate] | None = None

class BillResponse(BaseModel):
    id: UUID
    bill_number: str
    contact_id: UUID
    contact_name: str | None = None
    status: str
    issue_date: datetime
    due_date: datetime
    subtotal: float
    tax_amount: float
    total: float
    amount_paid: float
    currency: str
    notes: str | None
    terms: str | None = None
    created_at: datetime
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
    line_items: list[LineItemResponse] = []
    model_config = {"from_attributes": True}


# ── Vendor Credits ──
class PurchaseCreditNoteLineItem(BaseModel):
    description: str
    quantity: float = 1.0
    unit_price: float
    tax_rate: float = 0.0
    amount: float | None = None  # optional — backend recalculates
    discount: float = 0.0
    discount_mode: str = "percent"
    tax_code_id: str | None = None
    account_id: str | None = None
    line_type: str = "goods"
    sort_order: int = 0

class PurchaseCreditApplicationInput(BaseModel):
    bill_id: UUID
    amount: float

class PurchaseCreditNoteCreate(BaseModel):
    contact_id: UUID
    pcn_number: str | None = None
    bill_id: UUID | None = None
    issue_date: datetime
    reference: str | None = None
    currency: str = "MYR"
    notes: str | None = None
    line_items: list[PurchaseCreditNoteLineItem]
    credit_applications: list[PurchaseCreditApplicationInput] = []

class PurchaseCreditNoteLineItemResponse(BaseModel):
    id: UUID
    line_type: str
    description: str
    quantity: float
    unit_price: float
    discount: float
    discount_mode: str
    tax_rate: float
    tax_code_id: UUID | None
    amount: float
    account_id: UUID | None
    sort_order: int
    model_config = {"from_attributes": True}

class PurchaseCreditApplicationResponse(BaseModel):
    id: UUID
    credit_note_id: UUID
    bill_id: UUID
    amount: float
    applied_at: datetime
    model_config = {"from_attributes": True}

class PurchaseCreditNoteResponse(BaseModel):
    id: UUID
    organization_id: UUID
    pcn_number: str
    contact_id: UUID
    bill_id: UUID | None
    issue_date: datetime
    reference: str | None
    status: str
    currency: str
    subtotal: float
    discount_amount: float
    tax_amount: float
    total: float
    credit_applied: float
    notes: str | None
    line_items: list[PurchaseCreditNoteLineItemResponse]
    credit_applications: list[PurchaseCreditApplicationResponse] = []
    created_at: datetime
    model_config = {"from_attributes": True}

# Keep backward-compat aliases so document_router.py imports don't break
VendorCreditLineItem = PurchaseCreditNoteLineItem
VendorCreditCreate = PurchaseCreditNoteCreate
VendorCreditResponse = PurchaseCreditNoteResponse
