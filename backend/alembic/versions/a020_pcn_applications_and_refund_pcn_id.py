"""PCN: add purchase_credit_applications table + pcn_id on purchase_refunds

Revision ID: a020
Revises: a019
Create Date: 2026-05-18
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "a020"
down_revision = "a019"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "purchase_credit_applications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("credit_note_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("purchase_credit_notes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("bill_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("bills.id", ondelete="CASCADE"), nullable=False),
        sa.Column("amount", sa.Numeric(15, 2), nullable=False),
        sa.Column("applied_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_pca_credit_note_id", "purchase_credit_applications", ["credit_note_id"])
    op.create_index("ix_pca_bill_id", "purchase_credit_applications", ["bill_id"])

    # Add pcn_id to purchase_refunds so a refund can reference which PCN it came from
    op.add_column("purchase_refunds",
        sa.Column("pcn_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("purchase_credit_notes.id", ondelete="SET NULL"), nullable=True))


def downgrade():
    op.drop_column("purchase_refunds", "pcn_id")
    op.drop_index("ix_pca_bill_id", "purchase_credit_applications")
    op.drop_index("ix_pca_credit_note_id", "purchase_credit_applications")
    op.drop_table("purchase_credit_applications")
