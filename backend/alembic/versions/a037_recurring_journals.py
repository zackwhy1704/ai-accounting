"""Recurring journals: schedule templates that materialize ManualJournals.

Revision ID: a037
Revises: a036
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "a037"
down_revision = "a036"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "recurring_journals",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("frequency", sa.String(20), nullable=False),
        sa.Column("frequency_interval", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("start_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_run_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_run_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("run_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_runs", sa.Integer(), nullable=True),
        sa.Column("reference", sa.String(100), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("auto_post", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("lines", JSONB(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_recurring_journals_org_next", "recurring_journals", ["organization_id", "next_run_date"])


def downgrade() -> None:
    op.drop_index("ix_recurring_journals_org_next", table_name="recurring_journals")
    op.drop_table("recurring_journals")
