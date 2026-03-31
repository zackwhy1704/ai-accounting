"""007 country tax framework

Revision ID: 007
Revises: 006
Create Date: 2026-03-31
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "007"
down_revision = "006_sales_module"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Extend organizations table ──
    op.add_column("organizations", sa.Column("tax_regime", sa.String(20), nullable=False, server_default="MY_SST"))
    op.add_column("organizations", sa.Column("sst_registration_no", sa.String(30), nullable=True))
    op.add_column("organizations", sa.Column("einvoice_enabled", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("organizations", sa.Column("einvoice_supplier_tin", sa.String(30), nullable=True))
    op.add_column("organizations", sa.Column("einvoice_sandbox", sa.Boolean(), nullable=False, server_default="true"))
    op.add_column("organizations", sa.Column("base_currency", sa.String(3), nullable=False, server_default="MYR"))
    op.add_column("organizations", sa.Column("fx_auto_update", sa.Boolean(), nullable=False, server_default="true"))

    # ── tax_rates ──
    op.create_table(
        "tax_rates",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("code", sa.String(20), nullable=False),
        sa.Column("rate", sa.Numeric(6, 4), nullable=False),
        sa.Column("tax_type", sa.String(20), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("sst_category", sa.String(20), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("organization_id", "code", name="uq_org_tax_code"),
    )

    # ── exchange_rates ──
    op.create_table(
        "exchange_rates",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("from_currency", sa.String(3), nullable=False),
        sa.Column("to_currency", sa.String(3), nullable=False),
        sa.Column("rate", sa.Numeric(16, 6), nullable=False),
        sa.Column("rate_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source", sa.String(20), nullable=False, server_default="manual"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_fx_org_pair_date", "exchange_rates", ["organization_id", "from_currency", "to_currency", "rate_date"])

    # ── products ──
    op.create_table(
        "products",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("code", sa.String(50), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("product_type", sa.String(20), nullable=False, server_default="service"),
        sa.Column("unit", sa.String(20), nullable=True),
        sa.Column("unit_price", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("cost_price", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(3), nullable=False, server_default="MYR"),
        sa.Column("tax_rate_id", UUID(as_uuid=True), sa.ForeignKey("tax_rates.id"), nullable=True),
        sa.Column("income_account_id", UUID(as_uuid=True), sa.ForeignKey("accounts.id"), nullable=True),
        sa.Column("expense_account_id", UUID(as_uuid=True), sa.ForeignKey("accounts.id"), nullable=True),
        sa.Column("inventory_account_id", UUID(as_uuid=True), sa.ForeignKey("accounts.id"), nullable=True),
        sa.Column("track_inventory", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("qty_on_hand", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("reorder_point", sa.Numeric(18, 4), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("image_url", sa.String(1000), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("organization_id", "code", name="uq_org_product_code"),
    )
    op.create_index("ix_products_org_active", "products", ["organization_id", "is_active"])

    # ── recurring_invoices ──
    op.create_table(
        "recurring_invoices",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("contact_id", UUID(as_uuid=True), sa.ForeignKey("contacts.id"), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("frequency", sa.String(20), nullable=False),
        sa.Column("frequency_interval", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("start_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_run_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_run_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("run_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_runs", sa.Integer(), nullable=True),
        sa.Column("currency", sa.String(3), nullable=False, server_default="MYR"),
        sa.Column("due_days", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("line_items", JSONB, nullable=False, server_default="[]"),
        sa.Column("tax_inclusive", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("auto_send", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_recurring_org_next", "recurring_invoices", ["organization_id", "next_run_date"])

    # ── payment_links ──
    op.create_table(
        "payment_links",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("invoice_id", UUID(as_uuid=True), sa.ForeignKey("invoices.id"), nullable=True),
        sa.Column("token", sa.String(100), nullable=False, unique=True, index=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="MYR"),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column("gateway", sa.String(20), nullable=False, server_default="stripe"),
        sa.Column("stripe_checkout_id", sa.String(255), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paid_amount", sa.Numeric(18, 2), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    # ── manual_journals ──
    op.create_table(
        "manual_journals",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("journal_number", sa.String(50), nullable=False),
        sa.Column("date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reference", sa.String(100), nullable=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("currency", sa.String(3), nullable=False, server_default="MYR"),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("organization_id", "journal_number", name="uq_org_journal_number"),
    )

    op.create_table(
        "manual_journal_lines",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("journal_id", UUID(as_uuid=True), sa.ForeignKey("manual_journals.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("account_id", UUID(as_uuid=True), sa.ForeignKey("accounts.id"), nullable=False),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column("debit", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("credit", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("contact_id", UUID(as_uuid=True), sa.ForeignKey("contacts.id"), nullable=True),
    )

    # ── bank_rules ──
    op.create_table(
        "bank_rules",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("conditions", JSONB, nullable=False, server_default="[]"),
        sa.Column("condition_logic", sa.String(5), nullable=False, server_default="AND"),
        sa.Column("action_account_id", UUID(as_uuid=True), sa.ForeignKey("accounts.id"), nullable=True),
        sa.Column("action_contact_id", UUID(as_uuid=True), sa.ForeignKey("contacts.id"), nullable=True),
        sa.Column("action_description", sa.String(255), nullable=True),
        sa.Column("times_applied", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_applied_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    # ── sale_receipts ──
    op.create_table(
        "sale_receipts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("receipt_number", sa.String(50), nullable=False),
        sa.Column("contact_id", UUID(as_uuid=True), sa.ForeignKey("contacts.id"), nullable=True),
        sa.Column("receipt_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="completed"),
        sa.Column("currency", sa.String(3), nullable=False, server_default="MYR"),
        sa.Column("subtotal", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("tax_amount", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("total", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("line_items", JSONB, nullable=False, server_default="[]"),
        sa.Column("payment_method", sa.String(30), nullable=False, server_default="cash"),
        sa.Column("bank_account_id", UUID(as_uuid=True), sa.ForeignKey("accounts.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("organization_id", "receipt_number", name="uq_org_receipt_number"),
    )
    op.create_index("ix_sale_receipts_org_date", "sale_receipts", ["organization_id", "receipt_date"])

    # ── vendor_credits ──
    op.create_table(
        "vendor_credits",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("vendor_credit_number", sa.String(50), nullable=False),
        sa.Column("contact_id", UUID(as_uuid=True), sa.ForeignKey("contacts.id"), nullable=False),
        sa.Column("bill_id", UUID(as_uuid=True), sa.ForeignKey("bills.id"), nullable=True),
        sa.Column("issue_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column("currency", sa.String(3), nullable=False, server_default="MYR"),
        sa.Column("subtotal", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("tax_amount", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("total", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("amount_applied", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("line_items", JSONB, nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("organization_id", "vendor_credit_number", name="uq_org_vendor_credit_number"),
    )
    op.create_index("ix_vendor_credits_org_status", "vendor_credits", ["organization_id", "status"])


def downgrade() -> None:
    op.drop_table("vendor_credits")
    op.drop_table("sale_receipts")
    op.drop_table("bank_rules")
    op.drop_table("manual_journal_lines")
    op.drop_table("manual_journals")
    op.drop_table("payment_links")
    op.drop_table("recurring_invoices")
    op.drop_table("products")
    op.drop_table("exchange_rates")
    op.drop_table("tax_rates")
    op.drop_column("organizations", "fx_auto_update")
    op.drop_column("organizations", "base_currency")
    op.drop_column("organizations", "einvoice_sandbox")
    op.drop_column("organizations", "einvoice_supplier_tin")
    op.drop_column("organizations", "einvoice_enabled")
    op.drop_column("organizations", "sst_registration_no")
    op.drop_column("organizations", "tax_regime")
