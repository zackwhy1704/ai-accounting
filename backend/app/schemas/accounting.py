from pydantic import BaseModel, field_validator, model_validator
from uuid import UUID
from datetime import datetime


# ── Account ──
class AccountCreate(BaseModel):
    code: str
    name: str
    type: str
    subtype: str | None = None
    description: str | None = None
    currency: str = "SGD"
    account_role: str = "account"  # "header" | "subheader" | "account"
    parent_id: UUID | None = None

class AccountUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    type: str | None = None
    subtype: str | None = None
    description: str | None = None
    currency: str | None = None
    account_role: str | None = None
    parent_id: UUID | None = None

class AccountResponse(BaseModel):
    id: UUID
    code: str
    name: str
    type: str
    subtype: str | None
    currency: str
    is_system: bool
    description: str | None = None
    account_role: str = "account"
    parent_id: UUID | None = None
    created_at: datetime
    warning: str | None = None
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

class ExchangeRateUpdate(BaseModel):
    rate: float | None = None
    rate_date: datetime | None = None
    source: str | None = None

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


# ── Manual Journals ──
class ManualJournalLineCreate(BaseModel):
    account_id: UUID
    project_id: UUID | None = None
    department_id: UUID | None = None
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
    project_id: UUID | None = None
    department_id: UUID | None = None
    model_config = {"from_attributes": True}

class ManualJournalCreate(BaseModel):
    journal_number: str | None = None
    date: datetime
    reference: str | None = None
    description: str | None = None
    currency: str = "MYR"
    lines: list[ManualJournalLineCreate]

    @field_validator("lines")
    @classmethod
    def require_at_least_two_lines(cls, v):
        if len(v) < 2:
            raise ValueError("A journal entry requires at least two lines")
        return v

    @model_validator(mode="after")
    def validate_balanced(self) -> "ManualJournalCreate":
        total_debit = round(sum(l.debit for l in self.lines), 2)
        total_credit = round(sum(l.credit for l in self.lines), 2)
        if abs(total_debit - total_credit) > 0.01:
            raise ValueError(
                f"Journal entry does not balance: debit={total_debit}, credit={total_credit}"
            )
        return self


class ManualJournalUpdate(BaseModel):
    journal_number: str | None = None
    date: datetime | None = None
    reference: str | None = None
    description: str | None = None
    currency: str | None = None
    lines: list[ManualJournalLineCreate] | None = None

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
