"""add discount_mode to quotation and delivery_order line items

Revision ID: a023
Revises: a022
Create Date: 2026-06-02
"""
from alembic import op
import sqlalchemy as sa

revision = 'a023'
down_revision = 'a022'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('quotation_line_items', sa.Column('discount_mode', sa.String(10), nullable=False, server_default='percent'))
    op.add_column('delivery_order_line_items', sa.Column('discount_mode', sa.String(10), nullable=False, server_default='percent'))


def downgrade():
    op.drop_column('quotation_line_items', 'discount_mode')
    op.drop_column('delivery_order_line_items', 'discount_mode')
