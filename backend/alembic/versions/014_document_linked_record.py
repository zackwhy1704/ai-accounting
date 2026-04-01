"""Add linked_record_id and linked_record_type to documents

Revision ID: 014
Revises: 013
Create Date: 2026-04-01
"""
from alembic import op
import sqlalchemy as sa

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("documents", sa.Column("linked_record_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("documents", sa.Column("linked_record_type", sa.String(50), nullable=True))
    op.create_index("ix_documents_linked_record", "documents", ["linked_record_type", "linked_record_id"])


def downgrade():
    op.drop_index("ix_documents_linked_record", table_name="documents")
    op.drop_column("documents", "linked_record_type")
    op.drop_column("documents", "linked_record_id")
