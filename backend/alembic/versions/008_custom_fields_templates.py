"""008 custom fields and invoice templates

Revision ID: 008
Revises: 007
Create Date: 2026-03-31
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "custom_fields",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("entity_type", sa.String(50), nullable=False),
        sa.Column("field_name", sa.String(100), nullable=False),
        sa.Column("field_label", sa.String(100), nullable=False),
        sa.Column("field_type", sa.String(20), nullable=False),
        sa.Column("is_required", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("options", JSONB, nullable=True),
        sa.Column("default_value", sa.String(500), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("organization_id", "entity_type", "field_name", name="uq_org_entity_field"),
    )
    op.create_index("ix_custom_fields_org_entity", "custom_fields", ["organization_id", "entity_type"])

    op.create_table(
        "invoice_templates",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("layout", sa.String(20), nullable=False, server_default="classic"),
        sa.Column("primary_color", sa.String(7), nullable=False, server_default="#4D63FF"),
        sa.Column("secondary_color", sa.String(7), nullable=False, server_default="#F8FAFF"),
        sa.Column("logo_url", sa.String(1000), nullable=True),
        sa.Column("show_logo", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("show_payment_terms", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("show_notes", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("show_bank_details", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("show_tax_breakdown", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("show_signature", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("header_text", sa.String(500), nullable=True),
        sa.Column("footer_text", sa.String(500), nullable=True),
        sa.Column("terms_text", sa.Text, nullable=True),
        sa.Column("bank_details_text", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("invoice_templates")
    op.drop_table("custom_fields")
