from .base import (
    Base, utcnow, new_uuid,
    uuid, datetime, timezone,
    String, Text, Numeric, Integer, Boolean, DateTime, ForeignKey,
    SAEnum, Index, CheckConstraint, UniqueConstraint,
    Mapped, mapped_column, relationship,
    UUID, JSONB,
)




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
    gl_account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

# ── Bank Transactions (money in/out) ───────────



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
    category_account_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="completed")  # completed | void
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    __table_args__ = (Index("ix_bank_txn_org_date", "organization_id", "transaction_date"),)

# ── Bank Transfers ─────────────────────────────



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
