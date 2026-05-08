"""Add bill_id to purchase_refunds

Revision ID: a013
Revises: a012
Create Date: 2026-05-08
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "a013"
down_revision = "a012"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "purchase_refunds",
        sa.Column(
            "bill_id",
            UUID(as_uuid=True),
            sa.ForeignKey("bills.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade():
    op.drop_column("purchase_refunds", "bill_id")
