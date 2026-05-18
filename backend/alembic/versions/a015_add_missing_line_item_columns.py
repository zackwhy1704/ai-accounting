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
    op.execute("""
        ALTER TABLE bill_line_items
            ADD COLUMN IF NOT EXISTS line_type VARCHAR(10) NOT NULL DEFAULT 'goods',
            ADD COLUMN IF NOT EXISTS tax_code_id UUID NULL
    """)
    op.execute("""
        ALTER TABLE purchase_order_line_items
            ADD COLUMN IF NOT EXISTS line_type VARCHAR(10) NOT NULL DEFAULT 'goods',
            ADD COLUMN IF NOT EXISTS tax_code_id UUID NULL
    """)


def downgrade():
    for tbl in ["bill_line_items", "purchase_order_line_items"]:
        op.drop_column(tbl, "tax_code_id")
        op.drop_column(tbl, "line_type")
