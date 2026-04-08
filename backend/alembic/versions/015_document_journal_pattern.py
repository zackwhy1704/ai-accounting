"""Add confirmed_journal_pattern to documents for journal entry learning

Revision ID: 015
Revises: 014
Create Date: 2026-04-08
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "documents",
        sa.Column("confirmed_journal_pattern", JSONB, nullable=True),
    )


def downgrade():
    op.drop_column("documents", "confirmed_journal_pattern")
