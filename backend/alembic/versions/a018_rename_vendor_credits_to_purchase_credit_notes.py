"""rename vendor_credits to purchase_credit_notes, vendor_credit_number to pcn_number

Revision ID: a018
Revises: a017
Create Date: 2026-05-14
"""
from alembic import op
import sqlalchemy as sa

revision = "a018"
down_revision = "a017"
branch_labels = None
depends_on = None


def upgrade():
    # Rename table
    op.rename_table("vendor_credits", "purchase_credit_notes")

    # Rename column
    op.alter_column("purchase_credit_notes", "vendor_credit_number", new_column_name="pcn_number")

    # Drop old constraints and recreate with new names
    op.drop_constraint("uq_org_vendor_credit_number", "purchase_credit_notes", type_="unique")
    op.create_unique_constraint("uq_org_pcn_number", "purchase_credit_notes", ["organization_id", "pcn_number"])

    op.drop_index("ix_vendor_credits_org_status", table_name="purchase_credit_notes")
    op.create_index("ix_purchase_credit_notes_org_status", "purchase_credit_notes", ["organization_id", "status"])


def downgrade():
    op.drop_index("ix_purchase_credit_notes_org_status", table_name="purchase_credit_notes")
    op.create_index("ix_vendor_credits_org_status", "purchase_credit_notes", ["organization_id", "status"])

    op.drop_constraint("uq_org_pcn_number", "purchase_credit_notes", type_="unique")
    op.create_unique_constraint("uq_org_vendor_credit_number", "purchase_credit_notes", ["organization_id", "pcn_number"])

    op.alter_column("purchase_credit_notes", "pcn_number", new_column_name="vendor_credit_number")
    op.rename_table("purchase_credit_notes", "vendor_credits")
