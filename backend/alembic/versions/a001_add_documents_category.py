"""add category column to documents

Revision ID: a001_add_docs_cat
Revises: 028574c47fa6
Create Date: 2026-03-26
"""
from alembic import op
import sqlalchemy as sa

revision = "a001_add_docs_cat"
down_revision = "028574c47fa6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("category", sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column("documents", "category")
