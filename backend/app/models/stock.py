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
    tracking_mode: Mapped[str] = mapped_column(String(10), default="none")  # none | batch | serial
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
    batch_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("stock_batches.id"), nullable=True)
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


# ──────────────────────────────────────────────
# Price Levels (customer-tier pricing)
# ──────────────────────────────────────────────
class PriceLevel(Base):
    """A named price tier (e.g. Retail, Wholesale, VIP). Contacts are assigned a
    tier; products carry one price per tier in ProductPrice."""
    __tablename__ = "price_levels"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(String(300))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (UniqueConstraint("organization_id", "name", name="uq_org_price_level"),)


class ProductPrice(Base):
    __tablename__ = "product_prices"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    price_level_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("price_levels.id", ondelete="CASCADE"))
    unit_price: Mapped[float] = mapped_column(Numeric(18, 4))

    __table_args__ = (UniqueConstraint("product_id", "price_level_id", name="uq_product_price_level"),)


# ──────────────────────────────────────────────
# Product UOMs (multi unit-of-measure)
# ──────────────────────────────────────────────
class ProductUom(Base):
    """Alternative sell/buy units for a product. `factor` = how many BASE units
    (Product.unit) one of this UOM contains — e.g. box of 12 → factor 12.
    Document lines store the chosen uom + factor; stock always moves in base."""
    __tablename__ = "product_uoms"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(30))          # box, carton, dozen...
    factor: Mapped[float] = mapped_column(Numeric(18, 6))  # base units per 1 of this UOM
    barcode: Mapped[str | None] = mapped_column(String(64))

    __table_args__ = (UniqueConstraint("product_id", "name", name="uq_product_uom_name"),)


# ──────────────────────────────────────────────
# Stock Batches / Serial numbers
# ──────────────────────────────────────────────
class StockBatch(Base):
    """A batch/lot (or a single serialized unit — tracking_mode 'serial' uses
    qty-1 batches whose batch_no is the serial number). Issues auto-consume
    FEFO: earliest expiry first, then oldest batch."""
    __tablename__ = "stock_batches"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    batch_no: Mapped[str] = mapped_column(String(64))
    expiry_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    qty_on_hand: Mapped[float] = mapped_column(Numeric(18, 4), default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (UniqueConstraint("product_id", "batch_no", name="uq_product_batch_no"),)


# ──────────────────────────────────────────────
# Stock Takes (physical count worksheets)
# ──────────────────────────────────────────────
class StockTake(Base):
    """Physical count: snapshot expected quantities into a worksheet, enter
    counted quantities, then complete — variances post as stock movements with
    GL (Inventory 1300 <-> Adjustment 5800), source 'stock_take'."""
    __tablename__ = "stock_takes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    stock_take_number: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft | completed | void
    count_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    location_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("locations.id"), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text)
    # [{product_id, code, name, unit, expected_qty, counted_qty|null, unit_cost}]
    lines: Mapped[dict] = mapped_column(JSONB, default=list)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (UniqueConstraint("organization_id", "stock_take_number", name="uq_org_stock_take_number"),)
