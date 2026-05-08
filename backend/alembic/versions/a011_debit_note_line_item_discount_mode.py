"""Add discount_mode to debit_note_line_items and purchase_debit_note_line_items

Revision ID: a011
Revises: a010
"""
import sqlalchemy as sa
from alembic import op

revision = "a011"
down_revision = "a010"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "debit_note_line_items",
        sa.Column("discount_mode", sa.String(10), nullable=False, server_default="percent"),
    )
    op.add_column(
        "purchase_debit_note_line_items",
        sa.Column("discount_mode", sa.String(10), nullable=False, server_default="percent"),
    )


def downgrade():
    op.drop_column("debit_note_line_items", "discount_mode")
    op.drop_column("purchase_debit_note_line_items", "discount_mode")
