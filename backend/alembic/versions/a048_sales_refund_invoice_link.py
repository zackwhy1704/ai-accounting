"""Sales refunds: add invoice_id so a refund-overpaid refund can be traced
back to its invoice — without this, voiding such a refund had no way to
restore Invoice.amount_paid (only the credit_note_id path was restorable).

Revision ID: a048
Revises: a047
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "a048"
down_revision = "a047"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "sales_refunds",
        sa.Column("invoice_id", UUID(as_uuid=True), sa.ForeignKey("invoices.id"), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("sales_refunds", "invoice_id")
