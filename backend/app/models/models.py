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
    # ── Country / Tax compliance ──
    # tax_regime: MY_SST | SG_GST | AU_GST | EU_VAT | NONE
    tax_regime: Mapped[str] = mapped_column(String(20), default="MY_SST")
    sst_registration_no: Mapped[str | None] = mapped_column(String(30))   # Malaysia SST reg
    # gst_registration_no already exists (reused for SG GST)
    einvoice_enabled: Mapped[bool] = mapped_column(Boolean, default=False)  # MY MyInvois / SG InvoiceNow
    einvoice_supplier_tin: Mapped[str | None] = mapped_column(String(30))   # MY TIN for LHDN
    einvoice_sandbox: Mapped[bool] = mapped_column(Boolean, default=True)   # use sandbox API
    # Exchange rates: manual override or auto from BNM/MAS
    base_currency: Mapped[str] = mapped_column(String(3), default="MYR")
    fx_auto_update: Mapped[bool] = mapped_column(Boolean, default=True)

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
    purchase_orders: Mapped[list["PurchaseOrder"]] = relationship(back_populates="organization")
    goods_received_notes: Mapped[list["GoodsReceivedNote"]] = relationship(back_populates="organization")


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
# Client Invitation (firm invites client)
# ──────────────────────────────────────────────
class ClientInvitation(Base):
    """A firm invites a client via email. Token is used to accept."""
    __tablename__ = "client_invitations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    firm_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    invited_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    contact_name: Mapped[str] = mapped_column(String(255))
    business_name: Mapped[str] = mapped_column(String(255))
    email: Mapped[str] = mapped_column(String(255), index=True)
    token: Mapped[str] = mapped_column(String(500), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending, accepted, expired
    client_org_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("organizations.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    firm: Mapped["Organization"] = relationship(foreign_keys=[firm_id])
    invited_by: Mapped["User"] = relationship(foreign_keys=[invited_by_user_id])


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
    entity_type: Mapped[str] = mapped_column(String(20), default="company")  # company, individual
    company: Mapped[str | None] = mapped_column(String(255))
    address: Mapped[str | None] = mapped_column(Text)
    tax_number: Mapped[str | None] = mapped_column(String(50))
    brn: Mapped[str | None] = mapped_column(String(50))  # Business Registration Number (company)
    ic_number: Mapped[str | None] = mapped_column(String(20))  # MyKad IC number (individual)
    tin: Mapped[str | None] = mapped_column(String(50))  # Tax Identification Number
    msic_code: Mapped[str | None] = mapped_column(String(20))  # MSIC code
    # Structured billing address
    billing_address_line1: Mapped[str | None] = mapped_column(String(255))
    billing_address_line2: Mapped[str | None] = mapped_column(String(255))
    billing_city: Mapped[str | None] = mapped_column(String(100))
    billing_state: Mapped[str | None] = mapped_column(String(100))
    billing_postcode: Mapped[str | None] = mapped_column(String(20))
    billing_country: Mapped[str | None] = mapped_column(String(100))
    # Structured shipping address
    shipping_address_line1: Mapped[str | None] = mapped_column(String(255))
    shipping_address_line2: Mapped[str | None] = mapped_column(String(255))
    shipping_city: Mapped[str | None] = mapped_column(String(100))
    shipping_state: Mapped[str | None] = mapped_column(String(100))
    shipping_postcode: Mapped[str | None] = mapped_column(String(20))
    shipping_country: Mapped[str | None] = mapped_column(String(100))
    # Default preferences
    default_currency: Mapped[str | None] = mapped_column(String(3))
    default_payment_terms: Mapped[str | None] = mapped_column(String(50))
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
    terms: Mapped[str | None] = mapped_column(String(100))
    billing_address_line1: Mapped[str | None] = mapped_column(String(255))
    billing_address_line2: Mapped[str | None] = mapped_column(String(255))
    billing_city: Mapped[str | None] = mapped_column(String(100))
    billing_state: Mapped[str | None] = mapped_column(String(100))
    billing_postcode: Mapped[str | None] = mapped_column(String(20))
    billing_country: Mapped[str | None] = mapped_column(String(100))
    shipping_address_line1: Mapped[str | None] = mapped_column(String(255))
    shipping_address_line2: Mapped[str | None] = mapped_column(String(255))
    shipping_city: Mapped[str | None] = mapped_column(String(100))
    shipping_state: Mapped[str | None] = mapped_column(String(100))
    shipping_postcode: Mapped[str | None] = mapped_column(String(20))
    shipping_country: Mapped[str | None] = mapped_column(String(100))
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
    line_type: Mapped[str] = mapped_column(String(10), default="goods")  # goods, services
    description: Mapped[str] = mapped_column(String(500))
    quantity: Mapped[float] = mapped_column(Numeric(10, 2), default=1)
    unit_price: Mapped[float] = mapped_column(Numeric(15, 2))
    tax_rate: Mapped[float] = mapped_column(Numeric(5, 2), default=0)
    tax_code_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tax_rates.id"))
    discount: Mapped[float] = mapped_column(Numeric(5, 2), default=0)
    amount: Mapped[float] = mapped_column(Numeric(15, 2))
    account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id"))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    invoice: Mapped["Invoice"] = relationship(back_populates="line_items")


# ──────────────────────────────────────────────
# Quotation
# ──────────────────────────────────────────────
class Quotation(Base):
    __tablename__ = "quotations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"))
    contact_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("contacts.id"))
    quotation_number: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft, sent, accepted, declined, expired, converted
    issue_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expiry_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    reference: Mapped[str | None] = mapped_column(String(100))
    subtotal: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    discount_amount: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    tax_amount: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    total: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    currency: Mapped[str] = mapped_column(String(3), default="MYR")
    notes: Mapped[str | None] = mapped_column(Text)
    terms: Mapped[str | None] = mapped_column(Text)
    billing_address_line1: Mapped[str | None] = mapped_column(String(255))
    billing_address_line2: Mapped[str | None] = mapped_column(String(255))
    billing_city: Mapped[str | None] = mapped_column(String(100))
    billing_state: Mapped[str | None] = mapped_column(String(100))
    billing_postcode: Mapped[str | None] = mapped_column(String(20))
    billing_country: Mapped[str | None] = mapped_column(String(100))
    shipping_address_line1: Mapped[str | None] = mapped_column(String(255))
    shipping_address_line2: Mapped[str | None] = mapped_column(String(255))
    shipping_city: Mapped[str | None] = mapped_column(String(100))
    shipping_state: Mapped[str | None] = mapped_column(String(100))
    shipping_postcode: Mapped[str | None] = mapped_column(String(20))
    shipping_country: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    organization: Mapped["Organization"] = relationship()
    contact: Mapped["Contact"] = relationship()
    line_items: Mapped[list["QuotationLineItem"]] = relationship(back_populates="quotation", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("organization_id", "quotation_number", name="uq_org_quotation_number"),
        Index("ix_quotations_org_status", "organization_id", "status"),
    )


class QuotationLineItem(Base):
    __tablename__ = "quotation_line_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    quotation_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("quotations.id", ondelete="CASCADE"))
    line_type: Mapped[str] = mapped_column(String(10), default="goods")  # goods, services
    description: Mapped[str] = mapped_column(String(500))
    quantity: Mapped[float] = mapped_column(Numeric(10, 2), default=1)
    unit_price: Mapped[float] = mapped_column(Numeric(15, 2))
    tax_rate: Mapped[float] = mapped_column(Numeric(5, 2), default=0)
    tax_code_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tax_rates.id"))
    discount: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    amount: Mapped[float] = mapped_column(Numeric(15, 2))
    account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id"))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    quotation: Mapped["Quotation"] = relationship(back_populates="line_items")


# ──────────────────────────────────────────────
# Sales Order
# ──────────────────────────────────────────────
class SalesOrder(Base):
    __tablename__ = "sales_orders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"))
    contact_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("contacts.id"))
    quotation_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("quotations.id"))
    order_number: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft, confirmed, fulfilled, cancelled
    issue_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    delivery_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reference: Mapped[str | None] = mapped_column(String(100))
    subtotal: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    discount_amount: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    tax_amount: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    total: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    currency: Mapped[str] = mapped_column(String(3), default="MYR")
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    organization: Mapped["Organization"] = relationship()
    contact: Mapped["Contact"] = relationship()
    line_items: Mapped[list["SalesOrderLineItem"]] = relationship(back_populates="sales_order", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("organization_id", "order_number", name="uq_org_order_number"),
        Index("ix_sales_orders_org_status", "organization_id", "status"),
    )


class SalesOrderLineItem(Base):
    __tablename__ = "sales_order_line_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    sales_order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sales_orders.id", ondelete="CASCADE"))
    description: Mapped[str] = mapped_column(String(500))
    quantity: Mapped[float] = mapped_column(Numeric(10, 2), default=1)
    unit_price: Mapped[float] = mapped_column(Numeric(15, 2))
    tax_rate: Mapped[float] = mapped_column(Numeric(5, 2), default=0)
    discount: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    amount: Mapped[float] = mapped_column(Numeric(15, 2))
    account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id"))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    sales_order: Mapped["SalesOrder"] = relationship(back_populates="line_items")


# ──────────────────────────────────────────────
# Delivery Order
# ──────────────────────────────────────────────
class DeliveryOrder(Base):
    __tablename__ = "delivery_orders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"))
    contact_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("contacts.id"))
    invoice_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("invoices.id"))
    quotation_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("quotations.id"))
    sales_order_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("sales_orders.id"))
    delivery_number: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft, delivered, cancelled
    delivery_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ship_to_address: Mapped[str | None] = mapped_column(Text)
    deliver_to_address: Mapped[str | None] = mapped_column(Text)
    reference: Mapped[str | None] = mapped_column(String(100))
    subtotal: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    discount_amount: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    tax_amount: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    total: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    currency: Mapped[str] = mapped_column(String(3), default="MYR")
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    organization: Mapped["Organization"] = relationship()
    contact: Mapped["Contact"] = relationship()
    line_items: Mapped[list["DeliveryOrderLineItem"]] = relationship(back_populates="delivery_order", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("organization_id", "delivery_number", name="uq_org_delivery_number"),
        Index("ix_delivery_orders_org_status", "organization_id", "status"),
    )


class DeliveryOrderLineItem(Base):
    __tablename__ = "delivery_order_line_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    delivery_order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("delivery_orders.id", ondelete="CASCADE"))
    line_type: Mapped[str] = mapped_column(String(10), default="goods")  # goods, services
    description: Mapped[str] = mapped_column(String(500))
    quantity: Mapped[float] = mapped_column(Numeric(10, 2), default=1)
    unit_price: Mapped[float] = mapped_column(Numeric(15, 2))
    discount: Mapped[float] = mapped_column(Numeric(5, 2), default=0)
    tax_rate: Mapped[float] = mapped_column(Numeric(5, 2), default=0)
    tax_code_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tax_rates.id"))
    amount: Mapped[float] = mapped_column(Numeric(15, 2))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    delivery_order: Mapped["DeliveryOrder"] = relationship(back_populates="line_items")


# ──────────────────────────────────────────────
# Credit Note
# ──────────────────────────────────────────────
class CreditNote(Base):
    __tablename__ = "credit_notes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"))
    contact_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("contacts.id"))
    invoice_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("invoices.id"))
    credit_note_number: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft, issued, applied, void
    issue_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    reference: Mapped[str | None] = mapped_column(String(100))
    subtotal: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    discount_amount: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    tax_amount: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    total: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    credit_applied: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    currency: Mapped[str] = mapped_column(String(3), default="MYR")
    notes: Mapped[str | None] = mapped_column(Text)
    billing_address_line1: Mapped[str | None] = mapped_column(String(255))
    billing_address_line2: Mapped[str | None] = mapped_column(String(255))
    billing_city: Mapped[str | None] = mapped_column(String(100))
    billing_state: Mapped[str | None] = mapped_column(String(100))
    billing_postcode: Mapped[str | None] = mapped_column(String(20))
    billing_country: Mapped[str | None] = mapped_column(String(100))
    shipping_address_line1: Mapped[str | None] = mapped_column(String(255))
    shipping_address_line2: Mapped[str | None] = mapped_column(String(255))
    shipping_city: Mapped[str | None] = mapped_column(String(100))
    shipping_state: Mapped[str | None] = mapped_column(String(100))
    shipping_postcode: Mapped[str | None] = mapped_column(String(20))
    shipping_country: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    organization: Mapped["Organization"] = relationship()
    contact: Mapped["Contact"] = relationship()
    line_items: Mapped[list["CreditNoteLineItem"]] = relationship(back_populates="credit_note", cascade="all, delete-orphan")
    credit_applications: Mapped[list["CreditApplication"]] = relationship(back_populates="credit_note", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("organization_id", "credit_note_number", name="uq_org_credit_note_number"),
        Index("ix_credit_notes_org_status", "organization_id", "status"),
    )


class CreditNoteLineItem(Base):
    __tablename__ = "credit_note_line_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    credit_note_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("credit_notes.id", ondelete="CASCADE"))
    line_type: Mapped[str] = mapped_column(String(10), default="goods")  # goods, services
    description: Mapped[str] = mapped_column(String(500))
    quantity: Mapped[float] = mapped_column(Numeric(10, 2), default=1)
    unit_price: Mapped[float] = mapped_column(Numeric(15, 2))
    tax_rate: Mapped[float] = mapped_column(Numeric(5, 2), default=0)
    tax_code_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tax_rates.id"))
    discount: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    amount: Mapped[float] = mapped_column(Numeric(15, 2))
    account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id"))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    credit_note: Mapped["CreditNote"] = relationship(back_populates="line_items")


class CreditApplication(Base):
    __tablename__ = "credit_applications"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    credit_note_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("credit_notes.id", ondelete="CASCADE"))
    invoice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("invoices.id"))
    amount: Mapped[float] = mapped_column(Numeric(15, 2))
    applied_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    credit_note: Mapped["CreditNote"] = relationship(back_populates="credit_applications")
    invoice: Mapped["Invoice"] = relationship()


# ──────────────────────────────────────────────
# Debit Note
# ──────────────────────────────────────────────
class DebitNote(Base):
    __tablename__ = "debit_notes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"))
    contact_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("contacts.id"))
    invoice_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("invoices.id"), nullable=True)
    debit_note_number: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft, issued, applied, void
    issue_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    reference: Mapped[str | None] = mapped_column(String(100))
    subtotal: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    discount_amount: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    tax_amount: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    total: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    currency: Mapped[str] = mapped_column(String(3), default="MYR")
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    organization: Mapped["Organization"] = relationship()
    contact: Mapped["Contact"] = relationship()
    line_items: Mapped[list["DebitNoteLineItem"]] = relationship(back_populates="debit_note", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("organization_id", "debit_note_number", name="uq_org_debit_note_number"),
        Index("ix_debit_notes_org_status", "organization_id", "status"),
    )


class DebitNoteLineItem(Base):
    __tablename__ = "debit_note_line_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    debit_note_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("debit_notes.id", ondelete="CASCADE"))
    line_type: Mapped[str] = mapped_column(String(10), default="goods")  # goods, services
    description: Mapped[str] = mapped_column(String(500))
    quantity: Mapped[float] = mapped_column(Numeric(10, 2), default=1)
    unit_price: Mapped[float] = mapped_column(Numeric(15, 2))
    tax_rate: Mapped[float] = mapped_column(Numeric(5, 2), default=0)
    tax_code_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tax_rates.id"))
    discount: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    amount: Mapped[float] = mapped_column(Numeric(15, 2))
    account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id"))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    debit_note: Mapped["DebitNote"] = relationship(back_populates="line_items")


# ──────────────────────────────────────────────
# Sales Payment
# ──────────────────────────────────────────────
class SalesPayment(Base):
    __tablename__ = "sales_payments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"))
    contact_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("contacts.id"))
    payment_number: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft, completed, void
    payment_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    payment_method: Mapped[str] = mapped_column(String(20), default="bank")  # cash, bank, cheque, online
    reference: Mapped[str | None] = mapped_column(String(100))
    amount: Mapped[float] = mapped_column(Numeric(15, 2))
    bank_account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id"))
    currency: Mapped[str] = mapped_column(String(3), default="MYR")
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    organization: Mapped["Organization"] = relationship()
    contact: Mapped["Contact"] = relationship()
    allocations: Mapped[list["PaymentAllocation"]] = relationship(back_populates="payment", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("organization_id", "payment_number", name="uq_org_payment_number"),
        Index("ix_sales_payments_org_status", "organization_id", "status"),
    )


class PaymentAllocation(Base):
    __tablename__ = "payment_allocations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    payment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sales_payments.id", ondelete="CASCADE"))
    invoice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("invoices.id"))
    amount: Mapped[float] = mapped_column(Numeric(15, 2))

    payment: Mapped["SalesPayment"] = relationship(back_populates="allocations")
    invoice: Mapped["Invoice"] = relationship()


# ──────────────────────────────────────────────
# Sales Refund
# ──────────────────────────────────────────────
class SalesRefund(Base):
    __tablename__ = "sales_refunds"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"))
    contact_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("contacts.id"))
    credit_note_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("credit_notes.id"))
    refund_number: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft, completed, void
    refund_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    refund_method: Mapped[str] = mapped_column(String(20), default="bank")
    reference: Mapped[str | None] = mapped_column(String(100))
    amount: Mapped[float] = mapped_column(Numeric(15, 2))
    bank_account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id"))
    currency: Mapped[str] = mapped_column(String(3), default="MYR")
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    organization: Mapped["Organization"] = relationship()
    contact: Mapped["Contact"] = relationship()

    __table_args__ = (
        UniqueConstraint("organization_id", "refund_number", name="uq_org_refund_number"),
        Index("ix_sales_refunds_org_status", "organization_id", "status"),
    )


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
    terms: Mapped[str | None] = mapped_column(String(100))
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
    discount: Mapped[float] = mapped_column(Numeric(5, 2), default=0)
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
    linked_grn_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("goods_received_notes.id"), nullable=True)
    # Generic polymorphic link for all other module records (credit_note, vendor_credit, etc.)
    linked_record_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    linked_record_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text)
    confirmed_journal_pattern: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    organization: Mapped["Organization"] = relationship(back_populates="documents")

    __table_args__ = (
        Index("ix_documents_org_status", "organization_id", "status"),
    )


class DocumentShare(Base):
    """SME shares specific documents with an accountant/bookkeeper."""
    __tablename__ = "document_shares"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    document_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    owner_org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    shared_with_email: Mapped[str] = mapped_column(String(255), index=True)
    shared_with_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    shared_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    shared_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        UniqueConstraint("document_id", "shared_with_email", name="uq_doc_share"),
        Index("ix_doc_shares_email", "shared_with_email"),
    )


# ──────────────────────────────────────────────
# Firm ↔ Client Links
# ──────────────────────────────────────────────
class FirmClientLink(Base):
    """
    A firm (accounting practice) invites an existing SME/client org to link.
    Once accepted, the firm can see documents the SME chooses to share,
    and appears in the SME's accountant dropdown.
    """
    __tablename__ = "firm_client_links"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    firm_org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    client_org_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending, active, declined, revoked
    invited_email: Mapped[str] = mapped_column(String(255))  # email the invite was sent to
    invited_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_fcl_firm", "firm_org_id"),
        Index("ix_fcl_client", "client_org_id"),
        Index("ix_fcl_token", "token"),
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

# ──────────────────────────────────────────────
# Tax Rates (per-org, supports MY SST & SG GST)
# ──────────────────────────────────────────────
class TaxRate(Base):
    __tablename__ = "tax_rates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))          # e.g. "SST 6%", "GST 9%", "Zero-rated"
    code: Mapped[str] = mapped_column(String(20))           # e.g. "SST6", "GST9", "ZR", "EX"
    rate: Mapped[float] = mapped_column(Numeric(6, 4))      # e.g. 6.0000, 9.0000, 0.0000
    tax_type: Mapped[str] = mapped_column(String(20))       # SST | GST | VAT | NONE
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # MY-specific: SST type (service/sales)
    sst_category: Mapped[str | None] = mapped_column(String(20))  # service_tax | sales_tax
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        UniqueConstraint("organization_id", "code", name="uq_org_tax_code"),
    )


# ──────────────────────────────────────────────
# Exchange Rates (BNM for MY, MAS for SG, etc.)
# ──────────────────────────────────────────────
class ExchangeRate(Base):
    __tablename__ = "exchange_rates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    from_currency: Mapped[str] = mapped_column(String(3))   # e.g. USD
    to_currency: Mapped[str] = mapped_column(String(3))     # e.g. MYR
    rate: Mapped[float] = mapped_column(Numeric(16, 6))     # 1 USD = 4.700000 MYR
    rate_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    source: Mapped[str] = mapped_column(String(20), default="manual")  # bnm | mas | manual | openexchange
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        Index("ix_fx_org_pair_date", "organization_id", "from_currency", "to_currency", "rate_date"),
    )


# ──────────────────────────────────────────────
# Products / Services Catalog
# ──────────────────────────────────────────────
class Product(Base):
    __tablename__ = "products"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    code: Mapped[str | None] = mapped_column(String(50))
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    product_type: Mapped[str] = mapped_column(String(20), default="service")  # service | inventory | non_inventory
    unit: Mapped[str | None] = mapped_column(String(20))   # pcs, kg, hr, m, etc.
    unit_price: Mapped[float] = mapped_column(Numeric(18, 4), default=0)
    cost_price: Mapped[float] = mapped_column(Numeric(18, 4), default=0)
    currency: Mapped[str] = mapped_column(String(3), default="MYR")
    tax_rate_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tax_rates.id"))
    income_account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id"))
    expense_account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id"))
    inventory_account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id"))
    # Inventory tracking
    track_inventory: Mapped[bool] = mapped_column(Boolean, default=False)
    qty_on_hand: Mapped[float] = mapped_column(Numeric(18, 4), default=0)
    reorder_point: Mapped[float | None] = mapped_column(Numeric(18, 4))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    image_url: Mapped[str | None] = mapped_column(String(1000))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    tax_rate: Mapped["TaxRate | None"] = relationship("TaxRate", foreign_keys=[tax_rate_id])
    income_account: Mapped["Account | None"] = relationship("Account", foreign_keys=[income_account_id])
    expense_account: Mapped["Account | None"] = relationship("Account", foreign_keys=[expense_account_id])

    __table_args__ = (
        UniqueConstraint("organization_id", "code", name="uq_org_product_code"),
        Index("ix_products_org_active", "organization_id", "is_active"),
    )


# ──────────────────────────────────────────────
# Recurring Invoices
# ──────────────────────────────────────────────
class RecurringInvoice(Base):
    __tablename__ = "recurring_invoices"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    contact_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("contacts.id"))
    status: Mapped[str] = mapped_column(String(20), default="active")  # active | paused | completed | cancelled
    frequency: Mapped[str] = mapped_column(String(20))   # daily | weekly | monthly | yearly
    frequency_interval: Mapped[int] = mapped_column(Integer, default=1)  # every N days/weeks/months
    start_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    next_run_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_run_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    run_count: Mapped[int] = mapped_column(Integer, default=0)
    max_runs: Mapped[int | None] = mapped_column(Integer)  # null = unlimited
    # Invoice template fields
    currency: Mapped[str] = mapped_column(String(3), default="MYR")
    due_days: Mapped[int] = mapped_column(Integer, default=30)  # invoice due N days after issue
    notes: Mapped[str | None] = mapped_column(Text)
    line_items: Mapped[dict] = mapped_column(JSONB, default=list)
    tax_inclusive: Mapped[bool] = mapped_column(Boolean, default=False)
    auto_send: Mapped[bool] = mapped_column(Boolean, default=False)  # auto email on create
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    contact: Mapped["Contact"] = relationship("Contact", foreign_keys=[contact_id])

    __table_args__ = (
        Index("ix_recurring_org_next", "organization_id", "next_run_date"),
    )


# ──────────────────────────────────────────────
# Payment Links (public Stripe checkout)
# ──────────────────────────────────────────────
class PaymentLink(Base):
    __tablename__ = "payment_links"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    invoice_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("invoices.id"))
    token: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    amount: Mapped[float] = mapped_column(Numeric(18, 2))
    currency: Mapped[str] = mapped_column(String(3), default="MYR")
    description: Mapped[str | None] = mapped_column(String(500))
    # Gateway: stripe | fpx | paypal
    gateway: Mapped[str] = mapped_column(String(20), default="stripe")
    stripe_checkout_id: Mapped[str | None] = mapped_column(String(255))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    paid_amount: Mapped[float | None] = mapped_column(Numeric(18, 2))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        Index("ix_payment_links_token", "token"),
    )


# ──────────────────────────────────────────────
# Manual Journal Entries
# ──────────────────────────────────────────────
class ManualJournal(Base):
    __tablename__ = "manual_journals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    journal_number: Mapped[str] = mapped_column(String(50))
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    reference: Mapped[str | None] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft | posted | void
    currency: Mapped[str] = mapped_column(String(3), default="MYR")
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    lines: Mapped[list["ManualJournalLine"]] = relationship(back_populates="journal", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("organization_id", "journal_number", name="uq_org_journal_number"),
    )


class ManualJournalLine(Base):
    __tablename__ = "manual_journal_lines"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    journal_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("manual_journals.id", ondelete="CASCADE"), index=True)
    account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("accounts.id"))
    description: Mapped[str | None] = mapped_column(String(500))
    debit: Mapped[float] = mapped_column(Numeric(18, 4), default=0)
    credit: Mapped[float] = mapped_column(Numeric(18, 4), default=0)
    contact_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("contacts.id"))

    journal: Mapped["ManualJournal"] = relationship(back_populates="lines")
    account: Mapped["Account"] = relationship("Account", foreign_keys=[account_id])


# ──────────────────────────────────────────────
# Sales Receipts (cash sales, immediate payment)
# ──────────────────────────────────────────────
class SaleReceipt(Base):
    __tablename__ = "sale_receipts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    receipt_number: Mapped[str] = mapped_column(String(50))
    contact_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("contacts.id"))
    receipt_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), default="completed")  # completed | void
    currency: Mapped[str] = mapped_column(String(3), default="MYR")
    subtotal: Mapped[float] = mapped_column(Numeric(18, 4), default=0)
    tax_amount: Mapped[float] = mapped_column(Numeric(18, 4), default=0)
    total: Mapped[float] = mapped_column(Numeric(18, 4), default=0)
    notes: Mapped[str | None] = mapped_column(Text)
    line_items: Mapped[dict] = mapped_column(JSONB, default=list)
    payment_method: Mapped[str] = mapped_column(String(30), default="cash")
    bank_account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    contact: Mapped["Contact | None"] = relationship("Contact", foreign_keys=[contact_id])

    __table_args__ = (
        UniqueConstraint("organization_id", "receipt_number", name="uq_org_receipt_number"),
        Index("ix_sale_receipts_org_date", "organization_id", "receipt_date"),
    )


# ──────────────────────────────────────────────
# Vendor Credits (purchase-side credit notes)
# ──────────────────────────────────────────────
class VendorCredit(Base):
    __tablename__ = "vendor_credits"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    vendor_credit_number: Mapped[str] = mapped_column(String(50))
    contact_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("contacts.id"))
    bill_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("bills.id"))
    issue_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), default="open")  # open | applied | void
    currency: Mapped[str] = mapped_column(String(3), default="MYR")
    subtotal: Mapped[float] = mapped_column(Numeric(18, 4), default=0)
    tax_amount: Mapped[float] = mapped_column(Numeric(18, 4), default=0)
    total: Mapped[float] = mapped_column(Numeric(18, 4), default=0)
    amount_applied: Mapped[float] = mapped_column(Numeric(18, 4), default=0)
    notes: Mapped[str | None] = mapped_column(Text)
    line_items: Mapped[dict] = mapped_column(JSONB, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    contact: Mapped["Contact"] = relationship("Contact", foreign_keys=[contact_id])

    __table_args__ = (
        UniqueConstraint("organization_id", "vendor_credit_number", name="uq_org_vendor_credit_number"),
        Index("ix_vendor_credits_org_status", "organization_id", "status"),
    )


# ──────────────────────────────────────────────
# Custom Fields (per-org, per-entity-type)
# ──────────────────────────────────────────────
class CustomField(Base):
    __tablename__ = "custom_fields"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    entity_type: Mapped[str] = mapped_column(String(50))   # invoice | bill | contact | product | quotation
    field_name: Mapped[str] = mapped_column(String(100))
    field_label: Mapped[str] = mapped_column(String(100))
    field_type: Mapped[str] = mapped_column(String(20))    # text | number | date | select | checkbox
    is_required: Mapped[bool] = mapped_column(Boolean, default=False)
    options: Mapped[dict | None] = mapped_column(JSONB)    # for select fields: {"choices": ["A","B","C"]}
    default_value: Mapped[str | None] = mapped_column(String(500))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        UniqueConstraint("organization_id", "entity_type", "field_name", name="uq_org_entity_field"),
        Index("ix_custom_fields_org_entity", "organization_id", "entity_type"),
    )


# ──────────────────────────────────────────────
# Invoice Templates (custom branding / layout)
# ──────────────────────────────────────────────
class InvoiceTemplate(Base):
    __tablename__ = "invoice_templates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    # Layout: classic | modern | minimal | branded
    layout: Mapped[str] = mapped_column(String(20), default="classic")
    # Colors
    primary_color: Mapped[str] = mapped_column(String(7), default="#4D63FF")
    secondary_color: Mapped[str] = mapped_column(String(7), default="#F8FAFF")
    # Logo / branding
    logo_url: Mapped[str | None] = mapped_column(String(1000))
    show_logo: Mapped[bool] = mapped_column(Boolean, default=True)
    # Content toggles
    show_payment_terms: Mapped[bool] = mapped_column(Boolean, default=True)
    show_notes: Mapped[bool] = mapped_column(Boolean, default=True)
    show_bank_details: Mapped[bool] = mapped_column(Boolean, default=True)
    show_tax_breakdown: Mapped[bool] = mapped_column(Boolean, default=True)
    show_signature: Mapped[bool] = mapped_column(Boolean, default=False)
    # Custom text
    header_text: Mapped[str | None] = mapped_column(String(500))
    footer_text: Mapped[str | None] = mapped_column(String(500))
    terms_text: Mapped[str | None] = mapped_column(Text)
    bank_details_text: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


# ── Bank Accounts ──────────────────────────────
class BankAccount(Base):
    __tablename__ = "bank_accounts"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    account_type: Mapped[str] = mapped_column(String(30), default="current")  # current | savings | credit | cash
    bank_name: Mapped[str | None] = mapped_column(String(200))
    account_number: Mapped[str | None] = mapped_column(String(50))
    currency: Mapped[str] = mapped_column(String(3), default="MYR")
    opening_balance: Mapped[float] = mapped_column(Numeric(18,4), default=0)
    current_balance: Mapped[float] = mapped_column(Numeric(18,4), default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

# ── Bank Transactions (money in/out) ───────────
class BankTransaction(Base):
    __tablename__ = "bank_transactions"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    bank_account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("bank_accounts.id"))
    contact_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("contacts.id"))
    transaction_type: Mapped[str] = mapped_column(String(20))  # income | expense | transfer
    transaction_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    reference_no: Mapped[str | None] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(String(500))
    amount: Mapped[float] = mapped_column(Numeric(18,4), default=0)
    currency: Mapped[str] = mapped_column(String(3), default="MYR")
    payment_method: Mapped[str] = mapped_column(String(30), default="bank_transfer")
    category: Mapped[str | None] = mapped_column(String(100))
    notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="completed")  # completed | void
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    __table_args__ = (Index("ix_bank_txn_org_date", "organization_id", "transaction_date"),)

# ── Bank Transfers ─────────────────────────────
class BankTransfer(Base):
    __tablename__ = "bank_transfers"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    from_account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bank_accounts.id"))
    to_account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bank_accounts.id"))
    transfer_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    amount: Mapped[float] = mapped_column(Numeric(18,4), default=0)
    reference_no: Mapped[str | None] = mapped_column(String(100))
    notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="completed")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

# ── Stock Adjustments ──────────────────────────
class StockAdjustment(Base):
    __tablename__ = "stock_adjustments"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    adjustment_no: Mapped[str] = mapped_column(String(50))
    adjustment_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    reference_no: Mapped[str | None] = mapped_column(String(100))
    reason: Mapped[str] = mapped_column(String(200), default="Inventory Adjustment")
    notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft | confirmed | void
    lines: Mapped[list] = mapped_column(JSONB, default=list)  # [{product_id, product_name, qty, unit_cost, location}]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    __table_args__ = (UniqueConstraint("organization_id", "adjustment_no", name="uq_org_adj_no"),)

# ── Stock Transfers ────────────────────────────
class StockTransfer(Base):
    __tablename__ = "stock_transfers"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    transfer_no: Mapped[str] = mapped_column(String(50))
    transfer_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    from_location: Mapped[str | None] = mapped_column(String(100))
    to_location: Mapped[str | None] = mapped_column(String(100))
    notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft | completed | void
    lines: Mapped[list] = mapped_column(JSONB, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    __table_args__ = (UniqueConstraint("organization_id", "transfer_no", name="uq_org_transfer_no"),)

# ── Fixed Assets ───────────────────────────────
class FixedAsset(Base):
    __tablename__ = "fixed_assets"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    code: Mapped[str | None] = mapped_column(String(50))
    name: Mapped[str] = mapped_column(String(200))
    asset_type: Mapped[str] = mapped_column(String(100), default="Equipment")
    serial_no: Mapped[str | None] = mapped_column(String(100))
    purchase_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    purchase_cost: Mapped[float] = mapped_column(Numeric(18,4), default=0)
    salvage_value: Mapped[float] = mapped_column(Numeric(18,4), default=0)
    useful_life_years: Mapped[int] = mapped_column(Integer, default=5)
    depreciation_method: Mapped[str] = mapped_column(String(30), default="straight_line")
    current_value: Mapped[float] = mapped_column(Numeric(18,4), default=0)
    accumulated_depreciation: Mapped[float] = mapped_column(Numeric(18,4), default=0)
    status: Mapped[str] = mapped_column(String(20), default="registered")  # registered | disposed
    notes: Mapped[str | None] = mapped_column(Text)
    asset_account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id"))
    accumulated_depreciation_account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id"))
    depreciation_expense_account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

# ── Purchase Payments ──────────────────────────
class PurchasePayment(Base):
    __tablename__ = "purchase_payments"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    payment_no: Mapped[str] = mapped_column(String(50))
    contact_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("contacts.id"))
    payment_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    amount: Mapped[float] = mapped_column(Numeric(18,4), default=0)
    currency: Mapped[str] = mapped_column(String(3), default="MYR")
    payment_method: Mapped[str] = mapped_column(String(30), default="bank_transfer")
    reference_no: Mapped[str | None] = mapped_column(String(100))
    notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="completed")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    __table_args__ = (UniqueConstraint("organization_id", "payment_no", name="uq_org_pur_payment_no"),)

# ── Purchase Refunds ───────────────────────────
class PurchaseRefund(Base):
    __tablename__ = "purchase_refunds"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    refund_no: Mapped[str] = mapped_column(String(50))
    contact_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("contacts.id"))
    refund_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    amount: Mapped[float] = mapped_column(Numeric(18,4), default=0)
    currency: Mapped[str] = mapped_column(String(3), default="MYR")
    payment_method: Mapped[str] = mapped_column(String(30), default="bank_transfer")
    reference_no: Mapped[str | None] = mapped_column(String(100))
    notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="completed")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    __table_args__ = (UniqueConstraint("organization_id", "refund_no", name="uq_org_pur_refund_no"),)

# ── Contact Groups ─────────────────────────────
class ContactGroup(Base):
    __tablename__ = "contact_groups"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    __table_args__ = (UniqueConstraint("organization_id", "name", name="uq_org_contact_group"),)

# ── Tags ───────────────────────────────────────
class Tag(Base):
    __tablename__ = "tags"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    color: Mapped[str] = mapped_column(String(7), default="#6366F1")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    __table_args__ = (UniqueConstraint("organization_id", "name", name="uq_org_tag"),)

# ── Locations ──────────────────────────────────
class Location(Base):
    __tablename__ = "locations"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    address: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

# ── Payment Terms ──────────────────────────────
class PaymentTerm(Base):
    __tablename__ = "payment_terms"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    due_days: Mapped[int] = mapped_column(Integer, default=30)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

# ── Payment Methods ────────────────────────────
class PaymentMethod(Base):
    __tablename__ = "payment_methods"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


# ──────────────────────────────────────────────
# Purchase Orders
# ──────────────────────────────────────────────
class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"))
    contact_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("contacts.id"))
    po_number: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft, sent, received, billed, cancelled
    issue_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expected_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    subtotal: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    tax_amount: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    total: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    currency: Mapped[str] = mapped_column(String(3), default="SGD")
    notes: Mapped[str | None] = mapped_column(Text)
    delivery_address: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    organization: Mapped["Organization"] = relationship(back_populates="purchase_orders")
    contact: Mapped["Contact"] = relationship()
    line_items: Mapped[list["PurchaseOrderLineItem"]] = relationship(back_populates="purchase_order", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_po_org_status", "organization_id", "status"),
    )


class PurchaseOrderLineItem(Base):
    __tablename__ = "purchase_order_line_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    purchase_order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("purchase_orders.id", ondelete="CASCADE"))
    description: Mapped[str] = mapped_column(String(500))
    quantity: Mapped[float] = mapped_column(Numeric(10, 2), default=1)
    unit_price: Mapped[float] = mapped_column(Numeric(15, 2))
    tax_rate: Mapped[float] = mapped_column(Numeric(5, 2), default=0)
    amount: Mapped[float] = mapped_column(Numeric(15, 2))
    account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id"))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    purchase_order: Mapped["PurchaseOrder"] = relationship(back_populates="line_items")


# ──────────────────────────────────────────────
# Goods Received Notes (GRN)
# ──────────────────────────────────────────────
class GoodsReceivedNote(Base):
    __tablename__ = "goods_received_notes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"))
    contact_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("contacts.id"))
    grn_number: Mapped[str] = mapped_column(String(50))
    purchase_order_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("purchase_orders.id"))
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft, received, billed
    received_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    currency: Mapped[str] = mapped_column(String(3), default="SGD")
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    organization: Mapped["Organization"] = relationship(back_populates="goods_received_notes")
    contact: Mapped["Contact"] = relationship()
    line_items: Mapped[list["GRNLineItem"]] = relationship(back_populates="grn", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_grn_org_status", "organization_id", "status"),
    )


class GRNLineItem(Base):
    __tablename__ = "grn_line_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    grn_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("goods_received_notes.id", ondelete="CASCADE"))
    description: Mapped[str] = mapped_column(String(500))
    quantity_ordered: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    quantity_received: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    unit_price: Mapped[float] = mapped_column(Numeric(15, 2))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    grn: Mapped["GoodsReceivedNote"] = relationship(back_populates="line_items")


# ──────────────────────────────────────────────
# Bank Reconciliation
# ──────────────────────────────────────────────
class BankStatementLine(Base):
    __tablename__ = "bank_statement_lines"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    bank_account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("bank_accounts.id"))
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    description: Mapped[str] = mapped_column(String(500))
    reference: Mapped[str | None] = mapped_column(String(200))
    amount: Mapped[float] = mapped_column(Numeric(18, 4))  # positive=deposit, negative=withdrawal
    balance: Mapped[float | None] = mapped_column(Numeric(18, 4))  # running balance from statement
    status: Mapped[str] = mapped_column(String(20), default="unmatched")  # unmatched | matched | reconciled
    matched_transaction_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("transactions.id"))
    match_confidence: Mapped[float | None] = mapped_column(Numeric(5, 2))  # 0.00-1.00
    match_reason: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    __table_args__ = (Index("ix_bsl_org_status", "organization_id", "status"),)


class ReconciliationRule(Base):
    __tablename__ = "reconciliation_rules"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    pattern: Mapped[str] = mapped_column(String(500))  # text pattern to match in description
    account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id"))
    contact_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("contacts.id"))
    match_count: Mapped[int] = mapped_column(Integer, default=0)  # how many times this rule matched
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    __table_args__ = (UniqueConstraint("organization_id", "pattern", name="uq_org_recon_pattern"),)
