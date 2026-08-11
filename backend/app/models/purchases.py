from .base import (
    Base, utcnow, new_uuid,
    uuid, datetime, timezone,
    String, Text, Numeric, Integer, Boolean, DateTime, ForeignKey,
    SAEnum, Index, CheckConstraint, UniqueConstraint,
    Mapped, mapped_column, relationship,
    UUID, JSONB,
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
    subtotal: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    tax_amount: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    total: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    amount_paid: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    currency: Mapped[str] = mapped_column(String(3), default="SGD")
    exchange_rate: Mapped[float] = mapped_column(Numeric(15, 6), default=1)  # doc-date rate to org base currency
    project_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("projects.id"), nullable=True)
    department_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("departments.id"), nullable=True)
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

    @property
    def balance_due(self) -> float:
        return round(float(self.total) - float(self.amount_paid), 2)

    def can_edit(self) -> bool:
        return self.status in ("draft", "outstanding", "partially_paid")

    def can_delete(self) -> bool:
        return self.status in ("draft", "void")

    def mark_paid(self) -> None:
        paid = float(self.amount_paid)
        total = float(self.total)
        if paid >= total:
            self.status = "paid"
        elif paid > 0:
            self.status = "partially_paid"
        else:
            self.status = "outstanding"




class BillLineItem(Base):
    __tablename__ = "bill_line_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    product_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("products.id"), nullable=True)
    uom: Mapped[str | None] = mapped_column(String(30), nullable=True)  # selected unit; None = base unit
    uom_factor: Mapped[float] = mapped_column(Numeric(18, 6), default=1)  # base units per selected unit
    bill_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bills.id", ondelete="CASCADE"))
    description: Mapped[str] = mapped_column(String(500))
    line_type: Mapped[str] = mapped_column(String(10), default="goods")
    quantity: Mapped[float] = mapped_column(Numeric(10, 2), default=1)
    unit_price: Mapped[float] = mapped_column(Numeric(15, 2))
    tax_rate: Mapped[float] = mapped_column(Numeric(5, 2), default=0)
    tax_code_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tax_rates.id"), nullable=True)
    discount: Mapped[float] = mapped_column(Numeric(15, 4), default=0)
    discount_mode: Mapped[str] = mapped_column(String(10), default="percent")
    amount: Mapped[float] = mapped_column(Numeric(15, 2))
    account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id"))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    bill: Mapped["Bill"] = relationship(back_populates="line_items")


# ──────────────────────────────────────────────
# Transaction & Journal Entries (double-entry ledger)
# ──────────────────────────────────────────────




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
    discount: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    discount_mode: Mapped[str] = mapped_column(String(10), default="percent")
    tax_rate: Mapped[float] = mapped_column(Numeric(5, 2), default=0)
    tax_code_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tax_rates.id"), nullable=True)
    amount: Mapped[float] = mapped_column(Numeric(15, 2))
    account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id"))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    purchase_order: Mapped["PurchaseOrder"] = relationship(back_populates="line_items")


# ──────────────────────────────────────────────
# Goods Received Notes (GRN)
# ──────────────────────────────────────────────




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
    bill_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("bills.id", ondelete="SET NULL"), nullable=True)
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
    product_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("products.id"), nullable=True)
    uom: Mapped[str | None] = mapped_column(String(30), nullable=True)  # selected unit; None = base unit
    uom_factor: Mapped[float] = mapped_column(Numeric(18, 6), default=1)  # base units per selected unit
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




# ──────────────────────────────────────────────
# Vendor Credits (purchase-side credit notes)
# ──────────────────────────────────────────────
class PurchaseCreditNote(Base):
    __tablename__ = "purchase_credit_notes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    pcn_number: Mapped[str] = mapped_column(String(50))
    contact_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("contacts.id"))
    bill_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("bills.id"))
    issue_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    reference: Mapped[str | None] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft | issued | applied | void
    currency: Mapped[str] = mapped_column(String(3), default="MYR")
    exchange_rate: Mapped[float] = mapped_column(Numeric(15, 6), default=1)  # doc-date rate to org base currency
    subtotal: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    discount_amount: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    tax_amount: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    total: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    credit_applied: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    contact: Mapped["Contact"] = relationship("Contact", foreign_keys=[contact_id])
    line_items: Mapped[list["PurchaseCreditNoteLineItem"]] = relationship(back_populates="credit_note", cascade="all, delete-orphan")
    credit_applications: Mapped[list["PurchaseCreditApplication"]] = relationship(back_populates="credit_note", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("organization_id", "pcn_number", name="uq_org_pcn_number"),
        Index("ix_purchase_credit_notes_org_status", "organization_id", "status"),
    )

    @property
    def remaining_credit(self) -> float:
        return round(float(self.total) - float(self.credit_applied), 2)

    def can_edit(self) -> bool:
        return self.status == "draft"

    def can_delete(self) -> bool:
        return self.status in ("draft", "void")


class PurchaseCreditNoteLineItem(Base):
    __tablename__ = "purchase_credit_note_line_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    credit_note_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("purchase_credit_notes.id", ondelete="CASCADE"))
    line_type: Mapped[str] = mapped_column(String(10), default="goods")
    description: Mapped[str] = mapped_column(String(500))
    quantity: Mapped[float] = mapped_column(Numeric(10, 2), default=1)
    unit_price: Mapped[float] = mapped_column(Numeric(15, 2))
    tax_rate: Mapped[float] = mapped_column(Numeric(5, 2), default=0)
    tax_code_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tax_rates.id"))
    discount: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    discount_mode: Mapped[str] = mapped_column(String(10), default="percent")
    amount: Mapped[float] = mapped_column(Numeric(15, 2))
    account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id"))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    credit_note: Mapped["PurchaseCreditNote"] = relationship(back_populates="line_items")




class PurchaseCreditApplication(Base):
    __tablename__ = "purchase_credit_applications"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    credit_note_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("purchase_credit_notes.id", ondelete="CASCADE"), index=True)
    bill_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bills.id", ondelete="CASCADE"), index=True)
    amount: Mapped[float] = mapped_column(Numeric(15, 2))
    applied_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    credit_note: Mapped["PurchaseCreditNote"] = relationship(back_populates="credit_applications")
    bill: Mapped["Bill"] = relationship()


# Backward-compat alias so document_router.py doesn't break during migration
VendorCredit = PurchaseCreditNote


# ──────────────────────────────────────────────
# Custom Fields (per-org, per-entity-type)
# ──────────────────────────────────────────────




# ──────────────────────────────────────────────
# Purchase Debit Note
# ──────────────────────────────────────────────
class PurchaseDebitNote(Base):
    __tablename__ = "purchase_debit_notes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"))
    contact_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("contacts.id"))
    bill_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("bills.id"), nullable=True)
    debit_note_number: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft, issued, applied, void
    issue_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    reference: Mapped[str | None] = mapped_column(String(100))
    subtotal: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    discount_amount: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    tax_amount: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    total: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    amount_paid: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    currency: Mapped[str] = mapped_column(String(3), default="MYR")
    exchange_rate: Mapped[float] = mapped_column(Numeric(15, 6), default=1)  # doc-date rate to org base currency
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    organization: Mapped["Organization"] = relationship()
    contact: Mapped["Contact"] = relationship()
    line_items: Mapped[list["PurchaseDebitNoteLineItem"]] = relationship(back_populates="debit_note", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("organization_id", "debit_note_number", name="uq_org_purchase_debit_note_number"),
        Index("ix_purchase_debit_notes_org_status", "organization_id", "status"),
    )




class PurchaseDebitNoteLineItem(Base):
    __tablename__ = "purchase_debit_note_line_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    debit_note_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("purchase_debit_notes.id", ondelete="CASCADE"))
    line_type: Mapped[str] = mapped_column(String(10), default="goods")
    description: Mapped[str] = mapped_column(String(500))
    quantity: Mapped[float] = mapped_column(Numeric(10, 2), default=1)
    unit_price: Mapped[float] = mapped_column(Numeric(15, 2))
    tax_rate: Mapped[float] = mapped_column(Numeric(5, 2), default=0)
    tax_code_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tax_rates.id"))
    discount: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    discount_mode: Mapped[str] = mapped_column(String(10), default="percent")
    amount: Mapped[float] = mapped_column(Numeric(15, 2))
    account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id"))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    debit_note: Mapped["PurchaseDebitNote"] = relationship(back_populates="line_items")


# ──────────────────────────────────────────────
# Sales Payment
# ──────────────────────────────────────────────



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
    exchange_rate: Mapped[float] = mapped_column(Numeric(15, 6), default=1)  # doc-date rate to org base currency
    payment_method: Mapped[str] = mapped_column(String(30), default="bank_transfer")
    bank_account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("bank_accounts.id", ondelete="SET NULL"))
    reference_no: Mapped[str | None] = mapped_column(String(100))
    notes: Mapped[str | None] = mapped_column(Text)
    bill_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("bills.id", ondelete="SET NULL"))
    debit_note_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("purchase_debit_notes.id", ondelete="SET NULL"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="completed")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    __table_args__ = (UniqueConstraint("organization_id", "payment_no", name="uq_org_pur_payment_no"),)

# ── Purchase Refunds ───────────────────────────



# ── Purchase Refunds ───────────────────────────
class PurchasePaymentAllocation(Base):
    """Split one purchase payment across several bills / purchase debit notes
    (mirrors the sales-side PaymentAllocation)."""
    __tablename__ = "purchase_payment_allocations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    payment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("purchase_payments.id", ondelete="CASCADE"), index=True)
    bill_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("bills.id"), nullable=True)
    debit_note_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("purchase_debit_notes.id"), nullable=True)
    amount: Mapped[float] = mapped_column(Numeric(15, 2))


class PurchaseRefund(Base):
    __tablename__ = "purchase_refunds"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    refund_no: Mapped[str] = mapped_column(String(50))
    contact_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("contacts.id"))
    refund_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    amount: Mapped[float] = mapped_column(Numeric(18,4), default=0)
    currency: Mapped[str] = mapped_column(String(3), default="MYR")
    exchange_rate: Mapped[float] = mapped_column(Numeric(15, 6), default=1)  # doc-date rate to org base currency
    payment_method: Mapped[str] = mapped_column(String(30), default="bank_transfer")
    bank_account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("bank_accounts.id", ondelete="SET NULL"))
    bill_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("bills.id", ondelete="SET NULL"), nullable=True)
    pcn_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("purchase_credit_notes.id", ondelete="SET NULL"), nullable=True)
    reference_no: Mapped[str | None] = mapped_column(String(100))
    notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="completed")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    __table_args__ = (UniqueConstraint("organization_id", "refund_no", name="uq_org_pur_refund_no"),)

# ── Contact Groups ─────────────────────────────
