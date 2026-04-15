"""drop bank_rules table

Revision ID: 021
Revises: 020
Create Date: 2026-04-16
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "021"
down_revision = "020"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_table("bank_rules")


def downgrade():
    op.create_table(
        "bank_rules",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("conditions", JSONB, nullable=False, server_default="[]"),
        sa.Column("condition_logic", sa.String(5), nullable=False, server_default="AND"),
        sa.Column("action_account_id", UUID(as_uuid=True), sa.ForeignKey("accounts.id"), nullable=True),
        sa.Column("action_contact_id", UUID(as_uuid=True), sa.ForeignKey("contacts.id"), nullable=True),
        sa.Column("action_description", sa.String(255), nullable=True),
        sa.Column("times_applied", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_applied_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
