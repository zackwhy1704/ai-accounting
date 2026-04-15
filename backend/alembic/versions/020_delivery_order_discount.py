"""add discount to delivery order line items and discount_amount to delivery orders

Revision ID: 020
Revises: 019
Create Date: 2026-04-15
"""
from alembic import op
import sqlalchemy as sa

revision = "020"
down_revision = "019"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("delivery_order_line_items", sa.Column("discount", sa.Numeric(5, 2), nullable=False, server_default="0"))
    op.add_column("delivery_orders", sa.Column("discount_amount", sa.Numeric(15, 2), nullable=False, server_default="0"))


def downgrade():
    op.drop_column("delivery_orders", "discount_amount")
    op.drop_column("delivery_order_line_items", "discount")
