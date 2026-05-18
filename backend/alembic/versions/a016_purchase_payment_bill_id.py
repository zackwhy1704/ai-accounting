"""add bill_id to purchase_payments

Revision ID: a016
Revises: a015
Create Date: 2026-05-14
"""
from alembic import op
import sqlalchemy as sa

revision = "a016"
down_revision = "a015"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        ALTER TABLE purchase_payments
            ADD COLUMN IF NOT EXISTS bill_id UUID REFERENCES bills(id) ON DELETE SET NULL
    """)


def downgrade():
    op.drop_column("purchase_payments", "bill_id")
