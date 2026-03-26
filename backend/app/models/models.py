import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    String, Text, Numeric, Integer, Boolean, DateTime, ForeignKey,
    Enum as SAEnum, Index, CheckConstraint, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.core.database import Base

# Helpers
def utcnow():
    return datetime.now(timezone.utc)

def new_uuid():
    return uuid.uuid4()


# ──────────────────────────────────────────────
# Organization (tenant)
# ──────────────────────────────────────────────
class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(255))
    org_type: Mapped[str] = mapped_column(String(20), default="sme")  # sme, firm, individual, freelancer
    uen: Mapped[str | None] = mapped_column(String(20))
    industry: Mapped[str | None] = mapped_column(String(100))
    country: Mapped[str] = mapped_column(String(2), default="SG")  # ISO 3166-1 alpha-2
    timezone: Mapped[str] = mapped_column(String(50), default="Asia/Singapore")
    currency: Mapped[str] = mapped_column(String(3), default="SGD")
    tax_rate: Mapped[float] = mapped_column(Numeric(5, 2), default=9.0)
    gst_registration_no: Mapped[str | None] = mapped_column(String(20))
    fiscal_year_end_day: Mapped[int] = mapped_column(Integer, default=31)
    fiscal_year_end_month: Mapped[int] = mapped_column(Integer, default=12)
    has_employees: Mapped[bool] = mapped_column(Boolean, default=False)
    previous_tool: Mapped[str | None] = mapped_column(String(100))  # what they used before
    address: Mapped[str | None] = mapped_column(Text)
    logo_url: Mapped[str | None] = mapped_column(String(1000))
    # Firm / white-label fields
    slug: Mapped[str | None] = mapped_column(String(50), unique=True, index=True)  # e.g. "abc-accounting" → accruly.io/abc-accounting
    parent_firm_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("organizations.id"))  # if this is a client org under a firm
    brand_primary_color: Mapped[str | None] = mapped_column(String(7))  # hex e.g. #4D63FF
    brand_secondary_color: Mapped[str | None] = mapped_column(String(7))
    client_portal_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    favicon_url: Mapped[str | None] = mapped_column(String(1000))
    custom_domain: Mapped[str | None] = mapped_column(String(255), unique=True, index=True)
    firm_description: Mapped[str | None] = mapped_column(Text)
    firm_contact_email: Mapped[str | None] = mapped_column(String(255))
    firm_website: Mapped[str | None] = mapped_column(String(500))
    firm_support_email: Mapped[str | None] = mapped_column(String(255))
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    plan: Mapped[str] = mapped_column(String(20), default="starter")
    stripe_customer_id: Mapped[str | None] = mapped_column(String(255))
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(255))
    ai_scans_used: Mapped[int] = mapped_column(Integer, default=0)
    ai_scans_limit: Mapped[int] = mapped_column(Integer, default=10)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    # Relationships
    parent_firm: Mapped["Organization | None"] = relationship("Organization", remote_side="Organization.id", foreign_keys=[parent_firm_id])
    user_memberships: Mapped[list["UserOrganization"]] = relationship(back_populates="organization", cascade="all, delete-orphan")
    users: Mapped[list["User"]] = relationship(back_populates="organization")
    accounts: Mapped[list["Account"]] = relationship(back_populates="organization")
    contacts: Mapped[list["Contact"]] = relationship(back_populates="organization")
    invoices: Mapped[list["Invoice"]] = relationship(back_populates="organization")
    bills: Mapped[list["Bill"]] = relationship(back_populates="organization")
    documents: Mapped[list["Document"]] = relationship(back_populates="organization")
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="organization")


# ──────────────────────────────────────────────
# User
# ──────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"))  # default/current org
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(30))
    role: Mapped[str] = mapped_column(String(20), default="admin")  # admin, accountant, viewer
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    organization: Mapped["Organization"] = relationship(back_populates="users")
    org_memberships: Mapped[list["UserOrganization"]] = relationship(
        back_populates="user", foreign_keys="[UserOrganization.user_id]", cascade="all, delete-orphan"
    )


# ──────────────────────────────────────────────
# User ↔ Organization (many-to-many with role)
# ──────────────────────────────────────────────
class UserOrganization(Base):
    """Junction table: one user can belong to many orgs with different roles."""
    __tablename__ = "user_organizations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(20), default="admin")  # owner, admin, accountant, bookkeeper, viewer
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)  # user's default org on login
    invited_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship(back_populates="org_memberships", foreign_keys=[user_id])
    organization: Mapped["Organization"] = relationship(back_populates="user_memberships")

    __table_args__ = (
        UniqueConstraint("user_id", "organization_id", name="uq_user_org"),
    )


# ──────────────────────────────────────────────
# Chart of Accounts (double-entry bookkeeping)
# ──────────────────────────────────────────────
class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"))
    code: Mapped[str] = mapped_column(String(10))
    name: Mapped[str] = mapped_column(String(255))
    type: Mapped[str] = mapped_column(String(20))  # asset, liability, equity, revenue, expense
    subtype: Mapped[str | None] = mapped_column(String(50))
    description: Mapped[str | None] = mapped_column(Text)
    currency: Mapped[str] = mapped_column(String(3), default="SGD")
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    organization: Mapped["Organization"] = relationship(back_populates="accounts")
    journal_entries: Mapped[list["JournalEntry"]] = relationship(back_populates="account")

    __table_args__ = (
        UniqueConstraint("organization_id", "code", name="uq_org_account_code"),
        Index("ix_accounts_org_type", "organization_id", "type"),
    )


# ──────────────────────────────────────────────
# Contact (customer/vendor)
# ──────────────────────────────────────────────
class Contact(Base):
    __tablename__ = "contacts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"))
    name: Mapped[str] = mapped_column(String(255))
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(50))
    type: Mapped[str] = mapped_column(String(10))  # customer, vendor, both
    company: Mapped[str | None] = mapped_column(String(255))
    address: Mapped[str | None] = mapped_column(Text)
    tax_number: Mapped[str | None] = mapped_column(String(50))
    notes: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    organization: Mapped["Organization"] = relationship(back_populates="contacts")

    __table_args__ = (
        Index("ix_contacts_org_type", "organization_id", "type"),
    )


# ──────────────────────────────────────────────
# Invoice
# ──────────────────────────────────────────────
class Invoice(Base):
    __tablename__ = "invoices"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"))
    contact_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("contacts.id"))
    invoice_number: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(20), default="draft")
    issue_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    due_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    subtotal: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    tax_amount: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    total: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    amount_paid: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    currency: Mapped[str] = mapped_column(String(3), default="SGD")
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    organization: Mapped["Organization"] = relationship(back_populates="invoices")
    contact: Mapped["Contact"] = relationship()
    line_items: Mapped[list["InvoiceLineItem"]] = relationship(back_populates="invoice", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("organization_id", "invoice_number", name="uq_org_invoice_number"),
        Index("ix_invoices_org_status", "organization_id", "status"),
    )


class InvoiceLineItem(Base):
    __tablename__ = "invoice_line_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    invoice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("invoices.id", ondelete="CASCADE"))
    description: Mapped[str] = mapped_column(String(500))
    quantity: Mapped[float] = mapped_column(Numeric(10, 2), default=1)
    unit_price: Mapped[float] = mapped_column(Numeric(15, 2))
    tax_rate: Mapped[float] = mapped_column(Numeric(5, 2), default=0)
    amount: Mapped[float] = mapped_column(Numeric(15, 2))
    account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id"))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    invoice: Mapped["Invoice"] = relationship(back_populates="line_items")


# ──────────────────────────────────────────────
# Bill (vendor invoices)
# ──────────────────────────────────────────────
class Bill(Base):
    __tablename__ = "bills"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"))
    contact_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("contacts.id"))
    bill_number: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(20), default="draft")
    issue_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    due_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    subtotal: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    tax_amount: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    total: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    amount_paid: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    currency: Mapped[str] = mapped_column(String(3), default="SGD")
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    organization: Mapped["Organization"] = relationship(back_populates="bills")
    contact: Mapped["Contact"] = relationship()
    line_items: Mapped[list["BillLineItem"]] = relationship(back_populates="bill", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_bills_org_status", "organization_id", "status"),
    )


class BillLineItem(Base):
    __tablename__ = "bill_line_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    bill_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bills.id", ondelete="CASCADE"))
    description: Mapped[str] = mapped_column(String(500))
    quantity: Mapped[float] = mapped_column(Numeric(10, 2), default=1)
    unit_price: Mapped[float] = mapped_column(Numeric(15, 2))
    tax_rate: Mapped[float] = mapped_column(Numeric(5, 2), default=0)
    amount: Mapped[float] = mapped_column(Numeric(15, 2))
    account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id"))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    bill: Mapped["Bill"] = relationship(back_populates="line_items")


# ──────────────────────────────────────────────
# Transaction & Journal Entries (double-entry ledger)
# ──────────────────────────────────────────────
class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"))
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    description: Mapped[str] = mapped_column(String(500))
    reference: Mapped[str | None] = mapped_column(String(100))
    source: Mapped[str] = mapped_column(String(20), default="manual")  # manual, invoice, bill, bank, ai
    source_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))  # linked invoice/bill id
    is_posted: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    organization: Mapped["Organization"] = relationship(back_populates="transactions")
    entries: Mapped[list["JournalEntry"]] = relationship(back_populates="transaction", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_transactions_org_date", "organization_id", "date"),
    )


class JournalEntry(Base):
    """Each transaction has 2+ journal entries that must balance (debit = credit)."""
    __tablename__ = "journal_entries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    transaction_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("transactions.id", ondelete="CASCADE"))
    account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("accounts.id"))
    debit: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    credit: Mapped[float] = mapped_column(Numeric(15, 2), default=0)

    transaction: Mapped["Transaction"] = relationship(back_populates="entries")
    account: Mapped["Account"] = relationship(back_populates="journal_entries")

    __table_args__ = (
        CheckConstraint("debit >= 0 AND credit >= 0", name="ck_non_negative_amounts"),
        CheckConstraint("NOT (debit > 0 AND credit > 0)", name="ck_debit_or_credit"),
        Index("ix_journal_account", "account_id", "transaction_id"),
    )


# ──────────────────────────────────────────────
# Document (uploaded files for AI processing)
# ──────────────────────────────────────────────
class Document(Base):
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"))
    filename: Mapped[str] = mapped_column(String(255))
    file_url: Mapped[str] = mapped_column(String(1000))
    file_type: Mapped[str] = mapped_column(String(50))
    file_size: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="uploaded")  # uploaded, processing, processed, failed, done
    category: Mapped[str | None] = mapped_column(String(50))  # invoice, receipt, bill, bank_statement, other
    ai_extracted_data: Mapped[dict | None] = mapped_column(JSONB)
    ai_confidence: Mapped[float | None] = mapped_column(Numeric(3, 2))
    linked_invoice_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("invoices.id"))
    linked_bill_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("bills.id"))
    error_message: Mapped[str | None] = mapped_column(Text)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    organization: Mapped["Organization"] = relationship(back_populates="documents")

    __table_args__ = (
        Index("ix_documents_org_status", "organization_id", "status"),
    )


# ──────────────────────────────────────────────
# Bank Transaction (for reconciliation)
# ──────────────────────────────────────────────
class BankTransaction(Base):
    __tablename__ = "bank_transactions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"))
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    description: Mapped[str] = mapped_column(String(500))
    amount: Mapped[float] = mapped_column(Numeric(15, 2))
    type: Mapped[str] = mapped_column(String(10))  # credit, debit
    category: Mapped[str | None] = mapped_column(String(100))
    matched_transaction_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("transactions.id"))
    is_reconciled: Mapped[bool] = mapped_column(Boolean, default=False)
    ai_suggested_category: Mapped[str | None] = mapped_column(String(100))
    ai_confidence: Mapped[float | None] = mapped_column(Numeric(3, 2))
    raw_data: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        Index("ix_bank_txn_org_date", "organization_id", "date"),
        Index("ix_bank_txn_reconciled", "organization_id", "is_reconciled"),
    )


# ──────────────────────────────────────────────
# Audit Log (immutable, append-only)
# ──────────────────────────────────────────────
class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"))
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(50))  # create, update, delete, login, etc.
    entity_type: Mapped[str] = mapped_column(String(50))  # invoice, bill, contact, etc.
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    changes: Mapped[dict | None] = mapped_column(JSONB)
    ip_address: Mapped[str | None] = mapped_column(String(45))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        Index("ix_audit_org_entity", "organization_id", "entity_type", "entity_id"),
        Index("ix_audit_org_created", "organization_id", "created_at"),
    )
