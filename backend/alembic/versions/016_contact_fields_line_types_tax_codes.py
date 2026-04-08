"""Add contact entity fields, line_type + tax_code_id to line items, seed default tax codes

Revision ID: 016
Revises: 015
Create Date: 2026-04-08
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None


def upgrade():
    # ── Contact fields ──
    op.add_column("contacts", sa.Column("entity_type", sa.String(20), server_default="company", nullable=False))
    op.add_column("contacts", sa.Column("brn", sa.String(50), nullable=True))
    op.add_column("contacts", sa.Column("ic_number", sa.String(20), nullable=True))
    op.add_column("contacts", sa.Column("tin", sa.String(50), nullable=True))
    op.add_column("contacts", sa.Column("msic_code", sa.String(20), nullable=True))

    # ── Line item line_type + tax_code_id ──
    for table in [
        "invoice_line_items",
        "quotation_line_items",
        "credit_note_line_items",
        "debit_note_line_items",
        "delivery_order_line_items",
    ]:
        op.add_column(table, sa.Column("line_type", sa.String(10), server_default="goods", nullable=False))
        op.add_column(table, sa.Column("tax_code_id", UUID(as_uuid=True), nullable=True))
        op.create_foreign_key(f"fk_{table}_tax_code", table, "tax_rates", ["tax_code_id"], ["id"])


def downgrade():
    for table in [
        "invoice_line_items",
        "quotation_line_items",
        "credit_note_line_items",
        "debit_note_line_items",
        "delivery_order_line_items",
    ]:
        op.drop_constraint(f"fk_{table}_tax_code", table, type_="foreignkey")
        op.drop_column(table, "tax_code_id")
        op.drop_column(table, "line_type")

    op.drop_column("contacts", "msic_code")
    op.drop_column("contacts", "tin")
    op.drop_column("contacts", "ic_number")
    op.drop_column("contacts", "brn")
    op.drop_column("contacts", "entity_type")
