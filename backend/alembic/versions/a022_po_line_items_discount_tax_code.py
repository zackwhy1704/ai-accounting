"""add discount fields to purchase_order_line_items

Revision ID: a022
Revises: a021
Create Date: 2026-06-02
"""
from alembic import op
import sqlalchemy as sa

revision = 'a022'
down_revision = 'a021'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('purchase_order_line_items', sa.Column('discount', sa.Numeric(15, 2), nullable=False, server_default='0'))
    op.add_column('purchase_order_line_items', sa.Column('discount_mode', sa.String(10), nullable=False, server_default='percent'))


def downgrade():
    op.drop_column('purchase_order_line_items', 'discount')
    op.drop_column('purchase_order_line_items', 'discount_mode')
