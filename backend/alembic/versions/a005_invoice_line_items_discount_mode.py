"""Add discount_mode to invoice_line_items

Revision ID: a005
Revises: a004
Create Date: 2026-04-30
"""
from alembic import op
import sqlalchemy as sa

revision = "a005"
down_revision = "a004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "invoice_line_items",
        sa.Column("discount_mode", sa.String(10), server_default="percent", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("invoice_line_items", "discount_mode")
