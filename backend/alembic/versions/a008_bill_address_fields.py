"""Add billing/shipping address to bills

Revision ID: a008
Revises: a007
Create Date: 2026-05-02
"""
from alembic import op
import sqlalchemy as sa

revision = "a008"
down_revision = "a007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for col in [
        "billing_address_line1",
        "billing_address_line2",
        "billing_city",
        "billing_state",
        "billing_postcode",
        "billing_country",
        "shipping_address_line1",
        "shipping_address_line2",
        "shipping_city",
        "shipping_state",
        "shipping_postcode",
        "shipping_country",
    ]:
        op.add_column("bills", sa.Column(col, sa.String(255 if "line" in col else 100 if col not in ("billing_postcode", "shipping_postcode") else 20), nullable=True))


def downgrade() -> None:
    for col in [
        "billing_address_line1", "billing_address_line2",
        "billing_city", "billing_state", "billing_postcode", "billing_country",
        "shipping_address_line1", "shipping_address_line2",
        "shipping_city", "shipping_state", "shipping_postcode", "shipping_country",
    ]:
        op.drop_column("bills", col)
