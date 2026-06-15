from pydantic import BaseModel, field_validator, model_validator
from uuid import UUID
from datetime import datetime


# ── Invoice ──
class LineItemCreate(BaseModel):
    line_type: str = "goods"  # goods, services
    description: str
    quantity: float = 1.0
    unit_price: float
    tax_rate: float = 0.0
    tax_code_id: UUID | None = None
    discount: float = 0.0
    discount_mode: str = "percent"  # percent | amount
    account_id: UUID | None = None

class LineItemResponse(BaseModel):
    id: UUID
    description: str
    quantity: float
    unit_price: float
    tax_rate: float
    tax_code_id: UUID | None = None
    discount: float = 0.0
    discount_mode: str = "percent"
    account_id: UUID | None = None
    amount: float
    sort_order: int = 0
    line_type: str = "goods"
    model_config = {"from_attributes": True}

class InvoiceCreate(BaseModel):
    contact_id: UUID
    invoice_number: str | None = None
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


class InvoiceUpdate(BaseModel):
    contact_id: UUID | None = None
    invoice_number: str | None = None
    issue_date: datetime | None = None
    due_date: datetime | None = None
    currency: str | None = None
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
    line_items: list[LineItemCreate] | None = None

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
    created_at: datetime
    line_items: list[LineItemResponse] = []
    model_config = {"from_attributes": True}


# ── Quotation ──
class QuotationLineItemCreate(BaseModel):
    line_type: str = "goods"  # goods, services
    description: str
    quantity: float = 1.0
    unit_price: float
    tax_rate: float = 0.0
    tax_code_id: UUID | None = None
    discount: float = 0.0
    discount_mode: str = "percent"
    account_id: UUID | None = None

class QuotationLineItemResponse(BaseModel):
    id: UUID
    line_type: str
    description: str
    quantity: float
    unit_price: float
    tax_rate: float
    tax_code_id: UUID | None
    discount: float
    discount_mode: str = "percent"
    account_id: UUID | None
    amount: float
    model_config = {"from_attributes": True}

class QuotationCreate(BaseModel):
    contact_id: UUID
    quotation_number: str | None = None
    issue_date: datetime
    expiry_date: datetime
    reference: str | None = None
    currency: str = "MYR"
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
    line_items: list[QuotationLineItemCreate]

class QuotationUpdate(BaseModel):
    contact_id: UUID | None = None
    quotation_number: str | None = None
    issue_date: datetime | None = None
    expiry_date: datetime | None = None
    reference: str | None = None
    currency: str | None = None
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
    line_type: str = "goods"  # goods, services
    description: str
    quantity: float = 1.0
    unit_price: float
    discount: float = 0.0
    discount_mode: str = "percent"
    tax_rate: float = 0.0
    tax_code_id: UUID | None = None

class DeliveryOrderCreate(BaseModel):
    contact_id: UUID
    delivery_number: str | None = None
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

class DeliveryOrderUpdate(BaseModel):
    contact_id: UUID | None = None
    delivery_number: str | None = None
    invoice_id: UUID | None = None
    quotation_id: UUID | None = None
    sales_order_id: UUID | None = None
    delivery_date: datetime | None = None
    ship_to_address: str | None = None
    deliver_to_address: str | None = None
    reference: str | None = None
    currency: str | None = None
    notes: str | None = None
    line_items: list[DeliveryOrderLineItemCreate] | None = None

class DeliveryOrderLineItemResponse(BaseModel):
    id: UUID
    description: str
    quantity: float
    unit_price: float
    discount: float = 0.0
    discount_mode: str = "percent"
    tax_rate: float
    tax_code_id: UUID | None = None
    amount: float
    sort_order: int = 0
    model_config = {"from_attributes": True}

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
    discount_amount: float = 0.0
    tax_amount: float
    total: float
    currency: str
    notes: str | None
    created_at: datetime
    line_items: list[DeliveryOrderLineItemResponse] = []
    model_config = {"from_attributes": True}


# ── Credit Note ──
class CreditNoteLineItemCreate(BaseModel):
    line_type: str = "goods"  # goods, services
    description: str
    quantity: float = 1.0
    unit_price: float
    tax_rate: float = 0.0
    tax_code_id: UUID | None = None
    discount: float = 0.0
    discount_mode: str = "percent"  # percent | amount
    account_id: UUID | None = None

class CreditApplicationCreate(BaseModel):
    invoice_id: UUID
    amount: float

class CreditApplicationResponse(BaseModel):
    id: UUID
    invoice_id: UUID
    amount: float
    model_config = {"from_attributes": True}

class CreditNoteCreate(BaseModel):
    contact_id: UUID
    credit_note_number: str | None = None
    invoice_id: UUID | None = None
    issue_date: datetime
    reference: str | None = None
    currency: str = "MYR"
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
    line_items: list[CreditNoteLineItemCreate]
    credit_applications: list[CreditApplicationCreate] = []

class CreditNoteUpdate(BaseModel):
    contact_id: UUID | None = None
    credit_note_number: str | None = None
    invoice_id: UUID | None = None
    issue_date: datetime | None = None
    reference: str | None = None
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
    line_items: list[CreditNoteLineItemCreate] | None = None
    credit_applications: list[CreditApplicationCreate] | None = None

class CreditNoteLineItemResponse(BaseModel):
    id: UUID
    description: str
    quantity: float
    unit_price: float
    tax_rate: float
    discount: float
    discount_mode: str = "percent"
    amount: float
    line_type: str
    tax_code_id: UUID | None
    account_id: UUID | None
    sort_order: int
    model_config = {"from_attributes": True}

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
    created_at: datetime
    line_items: list[CreditNoteLineItemResponse] = []
    credit_applications: list[CreditApplicationResponse] = []
    model_config = {"from_attributes": True}


# ── Debit Note ──
class DebitNoteCreate(BaseModel):
    contact_id: UUID
    debit_note_number: str | None = None
    invoice_id: UUID | None = None
    issue_date: datetime
    reference: str | None = None
    currency: str = "MYR"
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
    line_items: list[CreditNoteLineItemCreate]

class DebitNoteUpdate(BaseModel):
    contact_id: UUID | None = None
    debit_note_number: str | None = None
    invoice_id: UUID | None = None
    issue_date: datetime | None = None
    reference: str | None = None
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
    line_items: list[CreditNoteLineItemCreate] | None = None

class DebitNoteLineItemResponse(BaseModel):
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

class DebitNoteResponse(BaseModel):
    id: UUID
    debit_note_number: str
    contact_id: UUID
    invoice_id: UUID | None
    status: str
    issue_date: datetime
    reference: str | None
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
    subtotal: float
    discount_amount: float
    tax_amount: float
    total: float
    amount_paid: float = 0
    currency: str
    notes: str | None
    created_at: datetime
    line_items: list[DebitNoteLineItemResponse] = []
    model_config = {"from_attributes": True}


# ── Sales Payment ──
class PaymentAllocationCreate(BaseModel):
    invoice_id: UUID | None = None
    debit_note_id: UUID | None = None
    amount: float

class SalesPaymentCreate(BaseModel):
    contact_id: UUID
    payment_number: str | None = None
    payment_date: datetime
    payment_method: str = "bank"
    reference: str | None = None
    amount: float
    bank_account_id: UUID | None = None
    currency: str = "MYR"
    notes: str | None = None
    allocations: list[PaymentAllocationCreate] = []

class SalesPaymentUpdate(BaseModel):
    contact_id: UUID | None = None
    payment_number: str | None = None
    payment_date: datetime | None = None
    payment_method: str | None = None
    reference: str | None = None
    amount: float | None = None
    bank_account_id: UUID | None = None
    currency: str | None = None
    notes: str | None = None
    allocations: list[PaymentAllocationCreate] | None = None

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
    refund_number: str | None = None
    credit_note_id: UUID | None = None
    refund_date: datetime
    refund_method: str = "bank"
    reference: str | None = None
    amount: float
    bank_account_id: UUID | None = None
    currency: str = "MYR"
    notes: str | None = None

class SalesRefundUpdate(BaseModel):
    contact_id: UUID | None = None
    refund_number: str | None = None
    credit_note_id: UUID | None = None
    refund_date: datetime | None = None
    refund_method: str | None = None
    reference: str | None = None
    amount: float | None = None
    bank_account_id: UUID | None = None
    currency: str | None = None
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


# ── Sale Receipts ──
class SaleReceiptLineItem(BaseModel):
    description: str
    quantity: float = 1.0
    unit_price: float
    tax_rate: float = 0.0
    amount: float | None = None

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
