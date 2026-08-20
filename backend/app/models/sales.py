from .base import (
    Base, utcnow, new_uuid,
    uuid, datetime, timezone,
    String, Text, Numeric, Integer, Boolean, DateTime, ForeignKey,
    SAEnum, Index, CheckConstraint, UniqueConstraint,
    Mapped, mapped_column, relationship,
    UUID, JSONB,
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
    exchange_rate: Mapped[float] = mapped_column(Numeric(15, 6), default=1)  # doc-date rate to org base currency
    project_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("projects.id"), nullable=True)
    department_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("departments.id"), nullable=True)
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

    @property
    def balance_due(self) -> float:
        return round(float(self.total) - float(self.amount_paid), 2)

    @property
    def is_overdue(self) -> bool:
        from datetime import datetime, timezone as tz
        return self.status not in ("paid", "void") and self.due_date < datetime.now(tz.utc)

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




class InvoiceLineItem(Base):
    __tablename__ = "invoice_line_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    product_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("products.id"), nullable=True)
    uom: Mapped[str | None] = mapped_column(String(30), nullable=True)  # selected unit; None = base unit
    uom_factor: Mapped[float] = mapped_column(Numeric(18, 6), default=1)  # base units per selected unit
    batch_no: Mapped[str | None] = mapped_column(String(64), nullable=True)
    expiry_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    invoice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("invoices.id", ondelete="CASCADE"))
    line_type: Mapped[str] = mapped_column(String(10), default="goods")  # goods, services
    description: Mapped[str] = mapped_column(String(500))
    quantity: Mapped[float] = mapped_column(Numeric(10, 2), default=1)
    unit_price: Mapped[float] = mapped_column(Numeric(15, 2))
    tax_rate: Mapped[float] = mapped_column(Numeric(5, 2), default=0)
    tax_code_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tax_rates.id"))
    discount: Mapped[float] = mapped_column(Numeric(5, 2), default=0)
    discount_mode: Mapped[str] = mapped_column(String(10), default="percent")
    amount: Mapped[float] = mapped_column(Numeric(15, 2))
    account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id"))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    invoice: Mapped["Invoice"] = relationship(back_populates="line_items")


# ──────────────────────────────────────────────
# Quotation
# ──────────────────────────────────────────────




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
    discount_mode: Mapped[str] = mapped_column(String(10), default="percent")
    amount: Mapped[float] = mapped_column(Numeric(15, 2))
    account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id"))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    quotation: Mapped["Quotation"] = relationship(back_populates="line_items")


# ──────────────────────────────────────────────
# Sales Order
# ──────────────────────────────────────────────




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
    product_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("products.id"), nullable=True)
    uom: Mapped[str | None] = mapped_column(String(30), nullable=True)  # selected unit; None = base unit
    uom_factor: Mapped[float] = mapped_column(Numeric(18, 6), default=1)  # base units per selected unit
    batch_no: Mapped[str | None] = mapped_column(String(64), nullable=True)
    expiry_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    delivery_order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("delivery_orders.id", ondelete="CASCADE"))
    line_type: Mapped[str] = mapped_column(String(10), default="goods")  # goods, services
    description: Mapped[str] = mapped_column(String(500))
    quantity: Mapped[float] = mapped_column(Numeric(10, 2), default=1)
    unit_price: Mapped[float] = mapped_column(Numeric(15, 2))
    discount: Mapped[float] = mapped_column(Numeric(15, 2), default=0)
    discount_mode: Mapped[str] = mapped_column(String(10), default="percent")
    tax_rate: Mapped[float] = mapped_column(Numeric(5, 2), default=0)
    tax_code_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tax_rates.id"))
    amount: Mapped[float] = mapped_column(Numeric(15, 2))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    delivery_order: Mapped["DeliveryOrder"] = relationship(back_populates="line_items")


# ──────────────────────────────────────────────
# Credit Note
# ──────────────────────────────────────────────




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
    exchange_rate: Mapped[float] = mapped_column(Numeric(15, 6), default=1)  # doc-date rate to org base currency
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

    @property
    def remaining_credit(self) -> float:
        return round(float(self.total) - float(self.credit_applied), 2)

    def can_edit(self) -> bool:
        return self.status == "draft"

    def can_delete(self) -> bool:
        return self.status in ("draft", "void")


class CreditNoteLineItem(Base):
    __tablename__ = "credit_note_line_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    product_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("products.id"), nullable=True)
    uom: Mapped[str | None] = mapped_column(String(30), nullable=True)  # selected unit; None = base unit
    uom_factor: Mapped[float] = mapped_column(Numeric(18, 6), default=1)  # base units per selected unit
    batch_no: Mapped[str | None] = mapped_column(String(64), nullable=True)
    expiry_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    credit_note_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("credit_notes.id", ondelete="CASCADE"))
    line_type: Mapped[str] = mapped_column(String(10), default="goods")  # goods, services
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
    discount_mode: Mapped[str] = mapped_column(String(10), default="percent")
    amount: Mapped[float] = mapped_column(Numeric(15, 2))
    account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounts.id"))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    debit_note: Mapped["DebitNote"] = relationship(back_populates="line_items")


# ──────────────────────────────────────────────
# Purchase Debit Note
# ──────────────────────────────────────────────




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
    bank_account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("bank_accounts.id"))
    currency: Mapped[str] = mapped_column(String(3), default="MYR")
    exchange_rate: Mapped[float] = mapped_column(Numeric(15, 6), default=1)  # doc-date rate to org base currency
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
    invoice_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("invoices.id"), nullable=True)
    debit_note_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("debit_notes.id"), nullable=True)
    amount: Mapped[float] = mapped_column(Numeric(15, 2))

    payment: Mapped["SalesPayment"] = relationship(back_populates="allocations")
    invoice: Mapped["Invoice | None"] = relationship(foreign_keys=[invoice_id])
    debit_note: Mapped["DebitNote | None"] = relationship(foreign_keys=[debit_note_id])


# ──────────────────────────────────────────────
# Sales Refund
# ──────────────────────────────────────────────




# ──────────────────────────────────────────────
# Sales Refund
# ──────────────────────────────────────────────
class SalesRefund(Base):
    __tablename__ = "sales_refunds"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"))
    contact_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("contacts.id"))
    credit_note_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("credit_notes.id"))
    invoice_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("invoices.id"))
    refund_number: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft, completed, void
    refund_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    refund_method: Mapped[str] = mapped_column(String(20), default="bank")
    reference: Mapped[str | None] = mapped_column(String(100))
    amount: Mapped[float] = mapped_column(Numeric(15, 2))
    bank_account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("bank_accounts.id"))
    currency: Mapped[str] = mapped_column(String(3), default="MYR")
    exchange_rate: Mapped[float] = mapped_column(Numeric(15, 6), default=1)  # doc-date rate to org base currency
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
    exchange_rate: Mapped[float] = mapped_column(Numeric(15, 6), default=1)  # doc-date rate to org base currency
    subtotal: Mapped[float] = mapped_column(Numeric(18, 4), default=0)
    tax_amount: Mapped[float] = mapped_column(Numeric(18, 4), default=0)
    total: Mapped[float] = mapped_column(Numeric(18, 4), default=0)
    notes: Mapped[str | None] = mapped_column(Text)
    line_items: Mapped[dict] = mapped_column(JSONB, default=list)
    payment_method: Mapped[str] = mapped_column(String(30), default="cash")
    bank_account_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("bank_accounts.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    contact: Mapped["Contact | None"] = relationship("Contact", foreign_keys=[contact_id])

    __table_args__ = (
        UniqueConstraint("organization_id", "receipt_number", name="uq_org_receipt_number"),
        Index("ix_sale_receipts_org_date", "organization_id", "receipt_date"),
    )


# ──────────────────────────────────────────────
# Vendor Credits (purchase-side credit notes)
# ──────────────────────────────────────────────




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
