"""Credit limits on contacts + purchase payment allocations (multi-bill).

Revision ID: a041
Revises: a040
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "a041"
down_revision = "a040"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("contacts", sa.Column("credit_limit", sa.Numeric(15, 2), nullable=True))
    op.add_column("contacts", sa.Column("credit_hold", sa.Boolean(), nullable=False, server_default="false"))

    op.create_table(
        "purchase_payment_allocations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("payment_id", UUID(as_uuid=True), sa.ForeignKey("purchase_payments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("bill_id", UUID(as_uuid=True), sa.ForeignKey("bills.id"), nullable=True),
        sa.Column("debit_note_id", UUID(as_uuid=True), sa.ForeignKey("purchase_debit_notes.id"), nullable=True),
        sa.Column("amount", sa.Numeric(15, 2), nullable=False),
    )
    op.create_index("ix_purchase_payment_allocations_payment_id", "purchase_payment_allocations", ["payment_id"])


def downgrade() -> None:
    op.drop_index("ix_purchase_payment_allocations_payment_id", table_name="purchase_payment_allocations")
    op.drop_table("purchase_payment_allocations")
    op.drop_column("contacts", "credit_hold")
    op.drop_column("contacts", "credit_limit")
