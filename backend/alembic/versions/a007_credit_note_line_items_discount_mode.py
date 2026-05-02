"""Add discount_mode to credit_note_line_items

Revision ID: a007
Revises: a006
Create Date: 2026-05-02
"""
from alembic import op
import sqlalchemy as sa

revision = "a007"
down_revision = "a006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "credit_note_line_items",
        sa.Column("discount_mode", sa.String(10), server_default="percent", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("credit_note_line_items", "discount_mode")
