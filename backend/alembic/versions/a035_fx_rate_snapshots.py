"""FX-1: snapshot the document-date exchange rate on every posting document.

Adds exchange_rate Numeric(15,6) DEFAULT 1 to all documents that post GL.
Server default 1 is deliberate: legacy foreign-currency rows were posted at
face value (rate 1.0), so settling them with rate 1 clears AR/AP at exactly
the booked base amount — no retroactive FX distortion.

Revision ID: a035
Revises: a034
"""
import sqlalchemy as sa
from alembic import op

revision = "a035"
down_revision = "a034"
branch_labels = None
depends_on = None

TABLES = [
    "invoices",
    "bills",
    "credit_notes",
    "debit_notes",
    "sale_receipts",
    "sales_payments",
    "sales_refunds",
    "purchase_credit_notes",
    "purchase_debit_notes",
    "purchase_payments",
    "purchase_refunds",
]


def upgrade() -> None:
    for table in TABLES:
        op.add_column(
            table,
            sa.Column("exchange_rate", sa.Numeric(15, 6), nullable=False, server_default="1"),
        )


def downgrade() -> None:
    for table in TABLES:
        op.drop_column(table, "exchange_rate")
