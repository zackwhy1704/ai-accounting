"""Add sales module tables

Revision ID: 006_sales_module
Revises: 005_client_invitations
Create Date: 2026-03-30
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "006_sales_module"
down_revision = "005_client_invitations"
branch_labels = None
depends_on = None


def upgrade():
    # ── Quotations ──
    op.create_table(
        "quotations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("contact_id", UUID(as_uuid=True), sa.ForeignKey("contacts.id"), nullable=False),
        sa.Column("quotation_number", sa.String(50), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("issue_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expiry_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reference", sa.String(100)),
        sa.Column("subtotal", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("discount_amount", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("tax_amount", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("total", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(3), nullable=False, server_default="MYR"),
        sa.Column("notes", sa.Text),
        sa.Column("terms", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("organization_id", "quotation_number", name="uq_org_quotation_number"),
    )
    op.create_index("ix_quotations_org_status", "quotations", ["organization_id", "status"])

    op.create_table(
        "quotation_line_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("quotation_id", UUID(as_uuid=True), sa.ForeignKey("quotations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("quantity", sa.Numeric(10, 2), nullable=False, server_default="1"),
        sa.Column("unit_price", sa.Numeric(15, 2), nullable=False),
        sa.Column("tax_rate", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("discount", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("amount", sa.Numeric(15, 2), nullable=False),
        sa.Column("account_id", UUID(as_uuid=True), sa.ForeignKey("accounts.id")),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
    )

    # ── Sales Orders ──
    op.create_table(
        "sales_orders",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("contact_id", UUID(as_uuid=True), sa.ForeignKey("contacts.id"), nullable=False),
        sa.Column("quotation_id", UUID(as_uuid=True), sa.ForeignKey("quotations.id")),
        sa.Column("order_number", sa.String(50), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("issue_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("delivery_date", sa.DateTime(timezone=True)),
        sa.Column("reference", sa.String(100)),
        sa.Column("subtotal", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("discount_amount", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("tax_amount", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("total", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(3), nullable=False, server_default="MYR"),
        sa.Column("notes", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("organization_id", "order_number", name="uq_org_order_number"),
    )
    op.create_index("ix_sales_orders_org_status", "sales_orders", ["organization_id", "status"])

    op.create_table(
        "sales_order_line_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("sales_order_id", UUID(as_uuid=True), sa.ForeignKey("sales_orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("quantity", sa.Numeric(10, 2), nullable=False, server_default="1"),
        sa.Column("unit_price", sa.Numeric(15, 2), nullable=False),
        sa.Column("tax_rate", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("discount", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("amount", sa.Numeric(15, 2), nullable=False),
        sa.Column("account_id", UUID(as_uuid=True), sa.ForeignKey("accounts.id")),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
    )

    # ── Delivery Orders ──
    op.create_table(
        "delivery_orders",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("contact_id", UUID(as_uuid=True), sa.ForeignKey("contacts.id"), nullable=False),
        sa.Column("invoice_id", UUID(as_uuid=True), sa.ForeignKey("invoices.id")),
        sa.Column("quotation_id", UUID(as_uuid=True), sa.ForeignKey("quotations.id")),
        sa.Column("sales_order_id", UUID(as_uuid=True), sa.ForeignKey("sales_orders.id")),
        sa.Column("delivery_number", sa.String(50), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("delivery_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ship_to_address", sa.Text),
        sa.Column("deliver_to_address", sa.Text),
        sa.Column("reference", sa.String(100)),
        sa.Column("subtotal", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("tax_amount", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("total", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(3), nullable=False, server_default="MYR"),
        sa.Column("notes", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("organization_id", "delivery_number", name="uq_org_delivery_number"),
    )
    op.create_index("ix_delivery_orders_org_status", "delivery_orders", ["organization_id", "status"])

    op.create_table(
        "delivery_order_line_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("delivery_order_id", UUID(as_uuid=True), sa.ForeignKey("delivery_orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("quantity", sa.Numeric(10, 2), nullable=False, server_default="1"),
        sa.Column("unit_price", sa.Numeric(15, 2), nullable=False),
        sa.Column("tax_rate", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("amount", sa.Numeric(15, 2), nullable=False),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
    )

    # ── Credit Notes ──
    op.create_table(
        "credit_notes",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("contact_id", UUID(as_uuid=True), sa.ForeignKey("contacts.id"), nullable=False),
        sa.Column("invoice_id", UUID(as_uuid=True), sa.ForeignKey("invoices.id")),
        sa.Column("credit_note_number", sa.String(50), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("issue_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reference", sa.String(100)),
        sa.Column("subtotal", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("discount_amount", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("tax_amount", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("total", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("credit_applied", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(3), nullable=False, server_default="MYR"),
        sa.Column("notes", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("organization_id", "credit_note_number", name="uq_org_credit_note_number"),
    )
    op.create_index("ix_credit_notes_org_status", "credit_notes", ["organization_id", "status"])

    op.create_table(
        "credit_note_line_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("credit_note_id", UUID(as_uuid=True), sa.ForeignKey("credit_notes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("quantity", sa.Numeric(10, 2), nullable=False, server_default="1"),
        sa.Column("unit_price", sa.Numeric(15, 2), nullable=False),
        sa.Column("tax_rate", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("discount", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("amount", sa.Numeric(15, 2), nullable=False),
        sa.Column("account_id", UUID(as_uuid=True), sa.ForeignKey("accounts.id")),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
    )

    op.create_table(
        "credit_applications",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("credit_note_id", UUID(as_uuid=True), sa.ForeignKey("credit_notes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("invoice_id", UUID(as_uuid=True), sa.ForeignKey("invoices.id"), nullable=False),
        sa.Column("amount", sa.Numeric(15, 2), nullable=False),
        sa.Column("applied_at", sa.DateTime(timezone=True), nullable=False),
    )

    # ── Debit Notes ──
    op.create_table(
        "debit_notes",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("contact_id", UUID(as_uuid=True), sa.ForeignKey("contacts.id"), nullable=False),
        sa.Column("invoice_id", UUID(as_uuid=True), sa.ForeignKey("invoices.id"), nullable=False),
        sa.Column("debit_note_number", sa.String(50), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("issue_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reference", sa.String(100)),
        sa.Column("subtotal", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("discount_amount", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("tax_amount", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("total", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(3), nullable=False, server_default="MYR"),
        sa.Column("notes", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("organization_id", "debit_note_number", name="uq_org_debit_note_number"),
    )
    op.create_index("ix_debit_notes_org_status", "debit_notes", ["organization_id", "status"])

    op.create_table(
        "debit_note_line_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("debit_note_id", UUID(as_uuid=True), sa.ForeignKey("debit_notes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("quantity", sa.Numeric(10, 2), nullable=False, server_default="1"),
        sa.Column("unit_price", sa.Numeric(15, 2), nullable=False),
        sa.Column("tax_rate", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("discount", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("amount", sa.Numeric(15, 2), nullable=False),
        sa.Column("account_id", UUID(as_uuid=True), sa.ForeignKey("accounts.id")),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
    )

    # ── Sales Payments ──
    op.create_table(
        "sales_payments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("contact_id", UUID(as_uuid=True), sa.ForeignKey("contacts.id"), nullable=False),
        sa.Column("payment_number", sa.String(50), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("payment_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("payment_method", sa.String(20), nullable=False, server_default="bank"),
        sa.Column("reference", sa.String(100)),
        sa.Column("amount", sa.Numeric(15, 2), nullable=False),
        sa.Column("bank_account_id", UUID(as_uuid=True), sa.ForeignKey("accounts.id")),
        sa.Column("currency", sa.String(3), nullable=False, server_default="MYR"),
        sa.Column("notes", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("organization_id", "payment_number", name="uq_org_payment_number"),
    )
    op.create_index("ix_sales_payments_org_status", "sales_payments", ["organization_id", "status"])

    op.create_table(
        "payment_allocations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("payment_id", UUID(as_uuid=True), sa.ForeignKey("sales_payments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("invoice_id", UUID(as_uuid=True), sa.ForeignKey("invoices.id"), nullable=False),
        sa.Column("amount", sa.Numeric(15, 2), nullable=False),
    )

    # ── Sales Refunds ──
    op.create_table(
        "sales_refunds",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("contact_id", UUID(as_uuid=True), sa.ForeignKey("contacts.id"), nullable=False),
        sa.Column("credit_note_id", UUID(as_uuid=True), sa.ForeignKey("credit_notes.id")),
        sa.Column("refund_number", sa.String(50), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("refund_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("refund_method", sa.String(20), nullable=False, server_default="bank"),
        sa.Column("reference", sa.String(100)),
        sa.Column("amount", sa.Numeric(15, 2), nullable=False),
        sa.Column("bank_account_id", UUID(as_uuid=True), sa.ForeignKey("accounts.id")),
        sa.Column("currency", sa.String(3), nullable=False, server_default="MYR"),
        sa.Column("notes", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("organization_id", "refund_number", name="uq_org_refund_number"),
    )
    op.create_index("ix_sales_refunds_org_status", "sales_refunds", ["organization_id", "status"])


def downgrade():
    op.drop_table("sales_refunds")
    op.drop_table("payment_allocations")
    op.drop_table("sales_payments")
    op.drop_table("debit_note_line_items")
    op.drop_table("debit_notes")
    op.drop_table("credit_applications")
    op.drop_table("credit_note_line_items")
    op.drop_table("credit_notes")
    op.drop_table("delivery_order_line_items")
    op.drop_table("delivery_orders")
    op.drop_table("sales_order_line_items")
    op.drop_table("sales_orders")
    op.drop_table("quotation_line_items")
    op.drop_table("quotations")
