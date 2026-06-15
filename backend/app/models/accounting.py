from .base import (
    Base, utcnow, new_uuid,
    uuid, datetime, timezone,
    String, Text, Numeric, Integer, Boolean, DateTime, ForeignKey,
    SAEnum, Index, CheckConstraint, UniqueConstraint,
    Mapped, mapped_column, relationship,
    UUID, JSONB,
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
    source: Mapped[str] = mapped_column(String(50), default="manual")  # manual, invoice, bill, bank, ai
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
