"""add bill_id to goods_received_notes

Revision ID: a002_grn_add_bill_id
Revises: a001_add_docs_cat
Create Date: 2026-04-29
"""
from alembic import op
import sqlalchemy as sa

revision = "a002_grn_add_bill_id"
down_revision = ("022", "a001_add_docs_cat")
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "goods_received_notes",
        sa.Column("bill_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        "fk_grn_bill_id",
        "goods_received_notes",
        "bills",
        ["bill_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_grn_bill_id", "goods_received_notes", type_="foreignkey")
    op.drop_column("goods_received_notes", "bill_id")
