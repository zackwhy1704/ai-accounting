"""Add discount_mode to bill_line_items and widen discount column

Revision ID: a012
Revises: a011
Create Date: 2026-05-08
"""
from alembic import op
import sqlalchemy as sa

revision = "a012"
down_revision = "a011"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "bill_line_items",
        sa.Column("discount_mode", sa.String(10), nullable=False, server_default="percent"),
    )
    op.alter_column(
        "bill_line_items",
        "discount",
        existing_type=sa.Numeric(5, 2),
        type_=sa.Numeric(15, 4),
        existing_nullable=True,
    )


def downgrade():
    op.drop_column("bill_line_items", "discount_mode")
    op.alter_column(
        "bill_line_items",
        "discount",
        existing_type=sa.Numeric(15, 4),
        type_=sa.Numeric(5, 2),
        existing_nullable=True,
    )
