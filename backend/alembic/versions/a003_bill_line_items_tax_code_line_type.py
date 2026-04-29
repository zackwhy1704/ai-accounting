"""Add tax_code_id and line_type to bill_line_items

Revision ID: a003_bill_line_items_tax_code_line_type
Revises: a002_grn_add_bill_id
Create Date: 2026-04-29
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "a003"
down_revision = "a002_grn_add_bill_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "bill_line_items",
        sa.Column("line_type", sa.String(10), server_default="goods", nullable=False),
    )
    op.add_column(
        "bill_line_items",
        sa.Column("tax_code_id", UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_bill_line_items_tax_code",
        "bill_line_items",
        "tax_rates",
        ["tax_code_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_bill_line_items_tax_code", "bill_line_items", type_="foreignkey")
    op.drop_column("bill_line_items", "tax_code_id")
    op.drop_column("bill_line_items", "line_type")
