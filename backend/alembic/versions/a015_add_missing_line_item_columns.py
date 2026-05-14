"""Add missing line_type, tax_code_id to purchase-side line item tables

Revision ID: a015
Revises: a014
Create Date: 2026-05-14
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "a015"
down_revision = "a014"
branch_labels = None
depends_on = None


def upgrade():
    # bill_line_items — missing line_type, tax_code_id
    op.add_column("bill_line_items",
        sa.Column("line_type", sa.String(10), nullable=False, server_default="goods"))
    op.add_column("bill_line_items",
        sa.Column("tax_code_id", postgresql.UUID(as_uuid=True), nullable=True))

    # purchase_order_line_items — missing line_type, tax_code_id
    op.add_column("purchase_order_line_items",
        sa.Column("line_type", sa.String(10), nullable=False, server_default="goods"))
    op.add_column("purchase_order_line_items",
        sa.Column("tax_code_id", postgresql.UUID(as_uuid=True), nullable=True))


def downgrade():
    for tbl in ["bill_line_items", "purchase_order_line_items"]:
        op.drop_column(tbl, "tax_code_id")
        op.drop_column(tbl, "line_type")
