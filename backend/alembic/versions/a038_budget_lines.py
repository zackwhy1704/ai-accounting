"""Budgets: per-account, per-fiscal-year monthly buckets for budget-vs-actual.

Revision ID: a038
Revises: a037
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "a038"
down_revision = "a037"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "budget_lines",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("fiscal_year", sa.Integer(), nullable=False),
        sa.Column("account_id", UUID(as_uuid=True), sa.ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("amounts", JSONB(), nullable=False, server_default="[]"),
        sa.Column("notes", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("organization_id", "fiscal_year", "account_id", name="uq_budget_org_year_account"),
    )
    op.create_index("ix_budget_lines_org_year", "budget_lines", ["organization_id", "fiscal_year"])


def downgrade() -> None:
    op.drop_index("ix_budget_lines_org_year", table_name="budget_lines")
    op.drop_table("budget_lines")
