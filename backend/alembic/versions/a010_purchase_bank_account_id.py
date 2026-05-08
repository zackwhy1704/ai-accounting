"""Add bank_account_id to purchase_payments and purchase_refunds

Revision ID: a010
Revises: a009
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "a010"
down_revision = "a009"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "purchase_payments",
        sa.Column("bank_account_id", UUID(as_uuid=True), sa.ForeignKey("bank_accounts.id", ondelete="SET NULL"), nullable=True),
    )
    op.add_column(
        "purchase_refunds",
        sa.Column("bank_account_id", UUID(as_uuid=True), sa.ForeignKey("bank_accounts.id", ondelete="SET NULL"), nullable=True),
    )


def downgrade():
    op.drop_column("purchase_payments", "bank_account_id")
    op.drop_column("purchase_refunds", "bank_account_id")
