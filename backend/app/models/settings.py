from .base import (
    Base, utcnow, new_uuid,
    uuid, datetime, timezone,
    String, Text, Numeric, Integer, Boolean, DateTime, ForeignKey,
    SAEnum, Index, CheckConstraint, UniqueConstraint,
    Mapped, mapped_column, relationship,
    UUID, JSONB,
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
    price_level_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("price_levels.id"), nullable=True)
    credit_limit: Mapped[float | None] = mapped_column(Numeric(15, 2), nullable=True)  # None = no limit
    credit_hold: Mapped[bool] = mapped_column(Boolean, default=False)  # block new sales documents
    default_currency: Mapped[str | None] = mapped_column(String(3))
    default_payment_terms: Mapped[str | None] = mapped_column(String(50))
    default_payment_terms_days: Mapped[int | None] = mapped_column(Integer, nullable=True)  # auto due-date offset
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


# ── Projects & Departments (GL dimensions) ─────
class Project(Base):
    __tablename__ = "projects"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    code: Mapped[str | None] = mapped_column(String(30))
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(String(500))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    __table_args__ = (UniqueConstraint("organization_id", "name", name="uq_org_project"),)


class Department(Base):
    __tablename__ = "departments"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    code: Mapped[str | None] = mapped_column(String(30))
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(String(500))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    __table_args__ = (UniqueConstraint("organization_id", "name", name="uq_org_department"),)
