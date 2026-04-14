"""add discount to invoice line items, terms to invoices/bills

Revision ID: 019
Revises: 018
Create Date: 2026-04-09
"""
from alembic import op
import sqlalchemy as sa

revision = "019"
down_revision = "018"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("invoice_line_items", sa.Column("discount", sa.Numeric(5, 2), nullable=False, server_default="0"))
    op.add_column("invoices", sa.Column("terms", sa.String(100), nullable=True))
    op.add_column("bill_line_items", sa.Column("discount", sa.Numeric(5, 2), nullable=False, server_default="0"))
    op.add_column("bills", sa.Column("terms", sa.String(100), nullable=True))


def downgrade():
    op.drop_column("bills", "terms")
    op.drop_column("bill_line_items", "discount")
    op.drop_column("invoices", "terms")
    op.drop_column("invoice_line_items", "discount")
