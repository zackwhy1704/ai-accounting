"""Add structured billing/shipping address and default preferences to contacts

Revision ID: 017
Revises: 016
Create Date: 2026-04-08
"""
from alembic import op
import sqlalchemy as sa

revision = "017"
down_revision = "016"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("contacts", sa.Column("billing_address_line1", sa.String(255), nullable=True))
    op.add_column("contacts", sa.Column("billing_address_line2", sa.String(255), nullable=True))
    op.add_column("contacts", sa.Column("billing_city", sa.String(100), nullable=True))
    op.add_column("contacts", sa.Column("billing_state", sa.String(100), nullable=True))
    op.add_column("contacts", sa.Column("billing_postcode", sa.String(20), nullable=True))
    op.add_column("contacts", sa.Column("billing_country", sa.String(100), nullable=True))
    op.add_column("contacts", sa.Column("shipping_address_line1", sa.String(255), nullable=True))
    op.add_column("contacts", sa.Column("shipping_address_line2", sa.String(255), nullable=True))
    op.add_column("contacts", sa.Column("shipping_city", sa.String(100), nullable=True))
    op.add_column("contacts", sa.Column("shipping_state", sa.String(100), nullable=True))
    op.add_column("contacts", sa.Column("shipping_postcode", sa.String(20), nullable=True))
    op.add_column("contacts", sa.Column("shipping_country", sa.String(100), nullable=True))
    op.add_column("contacts", sa.Column("default_currency", sa.String(3), nullable=True))
    op.add_column("contacts", sa.Column("default_payment_terms", sa.String(50), nullable=True))


def downgrade():
    op.drop_column("contacts", "default_payment_terms")
    op.drop_column("contacts", "default_currency")
    op.drop_column("contacts", "shipping_country")
    op.drop_column("contacts", "shipping_postcode")
    op.drop_column("contacts", "shipping_state")
    op.drop_column("contacts", "shipping_city")
    op.drop_column("contacts", "shipping_address_line2")
    op.drop_column("contacts", "shipping_address_line1")
    op.drop_column("contacts", "billing_country")
    op.drop_column("contacts", "billing_postcode")
    op.drop_column("contacts", "billing_state")
    op.drop_column("contacts", "billing_city")
    op.drop_column("contacts", "billing_address_line2")
    op.drop_column("contacts", "billing_address_line1")
