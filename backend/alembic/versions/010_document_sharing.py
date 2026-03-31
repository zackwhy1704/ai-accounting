"""010 document sharing

Revision ID: 010
Revises: 009
Create Date: 2026-03-31
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "document_shares",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("owner_org_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("shared_with_email", sa.String(255), nullable=False),
        sa.Column("shared_with_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("shared_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("note", sa.Text, nullable=True),
        sa.Column("shared_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("document_id", "shared_with_email", name="uq_doc_share"),
    )
    op.create_index("ix_document_shares_doc_id", "document_shares", ["document_id"])
    op.create_index("ix_document_shares_email", "document_shares", ["shared_with_email"])
    op.create_index("ix_document_shares_owner_org", "document_shares", ["owner_org_id"])


def downgrade():
    op.drop_table("document_shares")
