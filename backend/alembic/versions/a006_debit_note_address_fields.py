"""Add billing/shipping address fields to debit_notes

Revision ID: a006
Revises: a005
Create Date: 2026-04-30
"""
from alembic import op
import sqlalchemy as sa

revision = "a006"
down_revision = "a005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for col in [
        "billing_address_line1", "billing_address_line2",
        "billing_city", "billing_state", "billing_postcode", "billing_country",
        "shipping_address_line1", "shipping_address_line2",
        "shipping_city", "shipping_state", "shipping_postcode", "shipping_country",
    ]:
        length = 20 if "postcode" in col else (100 if any(x in col for x in ["city", "state", "country"]) else 255)
        op.add_column("debit_notes", sa.Column(col, sa.String(length), nullable=True))


def downgrade() -> None:
    for col in [
        "billing_address_line1", "billing_address_line2",
        "billing_city", "billing_state", "billing_postcode", "billing_country",
        "shipping_address_line1", "shipping_address_line2",
        "shipping_city", "shipping_state", "shipping_postcode", "shipping_country",
    ]:
        op.drop_column("debit_notes", col)
