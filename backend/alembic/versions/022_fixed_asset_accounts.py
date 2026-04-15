"""fixed asset GL account fields + accumulated depreciation

Revision ID: 022
Revises: 021
Create Date: 2026-04-16
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "022"
down_revision = "021"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("fixed_assets", sa.Column("accumulated_depreciation", sa.Numeric(18, 4), nullable=False, server_default="0"))
    op.add_column("fixed_assets", sa.Column("asset_account_id", UUID(as_uuid=True), sa.ForeignKey("accounts.id"), nullable=True))
    op.add_column("fixed_assets", sa.Column("accumulated_depreciation_account_id", UUID(as_uuid=True), sa.ForeignKey("accounts.id"), nullable=True))
    op.add_column("fixed_assets", sa.Column("depreciation_expense_account_id", UUID(as_uuid=True), sa.ForeignKey("accounts.id"), nullable=True))


def downgrade():
    op.drop_column("fixed_assets", "depreciation_expense_account_id")
    op.drop_column("fixed_assets", "accumulated_depreciation_account_id")
    op.drop_column("fixed_assets", "asset_account_id")
    op.drop_column("fixed_assets", "accumulated_depreciation")
