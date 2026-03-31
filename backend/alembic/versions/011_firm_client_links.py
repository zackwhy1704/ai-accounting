"""firm_client_links table

Revision ID: 011_firm_client_links
Revises: 010_document_sharing
Create Date: 2026-03-31
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "011_firm_client_links"
down_revision = "010_document_sharing"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "firm_client_links",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("firm_org_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_org_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("invited_email", sa.String(255), nullable=False),
        sa.Column("invited_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("token", sa.String(64), nullable=False, unique=True),
        sa.Column("note", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_fcl_firm", "firm_client_links", ["firm_org_id"])
    op.create_index("ix_fcl_client", "firm_client_links", ["client_org_id"])
    op.create_index("ix_fcl_token", "firm_client_links", ["token"])


def downgrade() -> None:
    op.drop_index("ix_fcl_token", table_name="firm_client_links")
    op.drop_index("ix_fcl_client", table_name="firm_client_links")
    op.drop_index("ix_fcl_firm", table_name="firm_client_links")
    op.drop_table("firm_client_links")
