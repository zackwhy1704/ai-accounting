"""fix debit_notes.invoice_id to allow NULL (standalone debit notes)

Revision ID: a014
Revises: a013
Create Date: 2026-05-14
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "a014"
down_revision = "a013"
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column(
        "debit_notes",
        "invoice_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=True,
    )


def downgrade():
    op.alter_column(
        "debit_notes",
        "invoice_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=False,
    )
