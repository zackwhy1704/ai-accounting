"""Add linked_grn_id to documents

Revision ID: 013
Revises: 012
Create Date: 2026-04-01
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "documents",
        sa.Column("linked_grn_id", UUID(as_uuid=True), sa.ForeignKey("goods_received_notes.id"), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("documents", "linked_grn_id")
