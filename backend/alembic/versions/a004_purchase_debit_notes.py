"""Add purchase_debit_notes and purchase_debit_note_line_items tables

Revision ID: a004
Revises: a003
Create Date: 2026-04-30
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "a004"
down_revision = "a003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "purchase_debit_notes",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("contact_id", UUID(as_uuid=True), sa.ForeignKey("contacts.id"), nullable=False),
        sa.Column("bill_id", UUID(as_uuid=True), sa.ForeignKey("bills.id"), nullable=True),
        sa.Column("debit_note_number", sa.String(50), nullable=False),
        sa.Column("status", sa.String(20), server_default="draft", nullable=False),
        sa.Column("issue_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reference", sa.String(100), nullable=True),
        sa.Column("subtotal", sa.Numeric(15, 2), server_default="0", nullable=False),
        sa.Column("discount_amount", sa.Numeric(15, 2), server_default="0", nullable=False),
        sa.Column("tax_amount", sa.Numeric(15, 2), server_default="0", nullable=False),
        sa.Column("total", sa.Numeric(15, 2), server_default="0", nullable=False),
        sa.Column("currency", sa.String(3), server_default="MYR", nullable=False),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("organization_id", "debit_note_number", name="uq_org_purchase_debit_note_number"),
    )
    op.create_index("ix_purchase_debit_notes_org_status", "purchase_debit_notes", ["organization_id", "status"])

    op.create_table(
        "purchase_debit_note_line_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("debit_note_id", UUID(as_uuid=True), sa.ForeignKey("purchase_debit_notes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("line_type", sa.String(10), server_default="goods", nullable=False),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("quantity", sa.Numeric(10, 2), server_default="1", nullable=False),
        sa.Column("unit_price", sa.Numeric(15, 2), nullable=False),
        sa.Column("tax_rate", sa.Numeric(5, 2), server_default="0", nullable=False),
        sa.Column("tax_code_id", UUID(as_uuid=True), sa.ForeignKey("tax_rates.id"), nullable=True),
        sa.Column("discount", sa.Numeric(15, 2), server_default="0", nullable=False),
        sa.Column("amount", sa.Numeric(15, 2), nullable=False),
        sa.Column("account_id", UUID(as_uuid=True), sa.ForeignKey("accounts.id"), nullable=True),
        sa.Column("sort_order", sa.Integer, server_default="0", nullable=False),
    )


def downgrade() -> None:
    op.drop_table("purchase_debit_note_line_items")
    op.drop_index("ix_purchase_debit_notes_org_status", table_name="purchase_debit_notes")
    op.drop_table("purchase_debit_notes")
