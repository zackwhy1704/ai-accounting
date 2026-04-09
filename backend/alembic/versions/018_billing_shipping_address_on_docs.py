"""add billing/shipping address fields to invoices, quotations, credit_notes

Revision ID: 018_billing_shipping_address_on_docs
Revises: 017_contact_address_and_defaults
Create Date: 2026-04-09
"""
from alembic import op
import sqlalchemy as sa

revision = "018"
down_revision = "017"
branch_labels = None
depends_on = None

TABLES = ["invoices", "quotations", "credit_notes"]
COLS = [
    ("billing_address_line1", sa.String(255)),
    ("billing_address_line2", sa.String(255)),
    ("billing_city", sa.String(100)),
    ("billing_state", sa.String(100)),
    ("billing_postcode", sa.String(20)),
    ("billing_country", sa.String(100)),
    ("shipping_address_line1", sa.String(255)),
    ("shipping_address_line2", sa.String(255)),
    ("shipping_city", sa.String(100)),
    ("shipping_state", sa.String(100)),
    ("shipping_postcode", sa.String(20)),
    ("shipping_country", sa.String(100)),
]


def upgrade():
    for table in TABLES:
        for col_name, col_type in COLS:
            op.add_column(table, sa.Column(col_name, col_type, nullable=True))


def downgrade():
    for table in TABLES:
        for col_name, _ in COLS:
            op.drop_column(table, col_name)
