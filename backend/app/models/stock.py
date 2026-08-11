from .base import (
    Base, utcnow, new_uuid,
    uuid, datetime, timezone,
    String, Text, Numeric, Integer, Boolean, DateTime, ForeignKey,
    SAEnum, Index, CheckConstraint, UniqueConstraint,
    Mapped, mapped_column, relationship,
    UUID, JSONB,
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
    avg_cost: Mapped[float] = mapped_column(Numeric(18, 4), default=0)  # weighted-average cost, maintained by services/inventory
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



# ── Stock Transfers ────────────────────────────
class StockTransfer(Base):
    __tablename__ = "stock_transfers"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    transfer_no: Mapped[str] = mapped_column(String(50))
    transfer_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    from_location: Mapped[str | None] = mapped_column(String(100))
    to_location: Mapped[str | None] = mapped_column(String(100))
    from_location_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("locations.id"), nullable=True)
    to_location_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("locations.id"), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft | completed | void
    lines: Mapped[list] = mapped_column(JSONB, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    __table_args__ = (UniqueConstraint("organization_id", "transfer_no", name="uq_org_transfer_no"),)

# ── Fixed Assets ───────────────────────────────


# ──────────────────────────────────────────────
# Stock Moves — the perpetual-inventory ledger
# ──────────────────────────────────────────────
class StockMove(Base):
    """One row per stock movement (+in / -out), written by services/inventory.
    qty_on_hand and per-location balances derive from SUMming these; unit_cost
    is the weighted-average (outs) or receipt (ins) cost in base currency."""
    __tablename__ = "stock_moves"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"))
    location_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("locations.id"), nullable=True)
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    qty: Mapped[float] = mapped_column(Numeric(18, 4))       # positive = in, negative = out
    unit_cost: Mapped[float] = mapped_column(Numeric(18, 4), default=0)
    source_type: Mapped[str] = mapped_column(String(30))     # invoice | credit_note | grn | bill | sale_receipt | adjustment | transfer | reversal
    source_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    note: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        Index("ix_stock_moves_org_product", "organization_id", "product_id"),
        Index("ix_stock_moves_source", "source_type", "source_id"),
    )
