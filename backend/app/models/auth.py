from .base import (
    Base, utcnow, new_uuid,
    uuid, datetime, timezone,
    String, Text, Numeric, Integer, Boolean, DateTime, ForeignKey,
    SAEnum, Index, CheckConstraint, UniqueConstraint,
    Mapped, mapped_column, relationship,
    UUID, JSONB,
)




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
