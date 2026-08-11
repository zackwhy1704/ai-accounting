"""Multi-UOM: product_uoms table + uom/uom_factor on document line items.

Stock always moves in the product's base unit; a line in an alternate UOM
converts via factor (base units per 1 of the chosen UOM).

Revision ID: a044
Revises: a043
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "a044"
down_revision = "a043"
branch_labels = None
depends_on = None

LINE_TABLES = [
    "invoice_line_items",
    "bill_line_items",
    "credit_note_line_items",
    "grn_line_items",
    "delivery_order_line_items",
]


def upgrade() -> None:
    op.create_table(
        "product_uoms",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("product_id", UUID(as_uuid=True), sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(30), nullable=False),
        sa.Column("factor", sa.Numeric(18, 6), nullable=False),
        sa.Column("barcode", sa.String(64), nullable=True),
        sa.UniqueConstraint("product_id", "name", name="uq_product_uom_name"),
    )
    op.create_index("ix_product_uoms_product", "product_uoms", ["product_id"])
    for t in LINE_TABLES:
        op.add_column(t, sa.Column("uom", sa.String(30), nullable=True))
        op.add_column(t, sa.Column("uom_factor", sa.Numeric(18, 6), nullable=False, server_default="1"))


def downgrade() -> None:
    for t in reversed(LINE_TABLES):
        op.drop_column(t, "uom_factor")
        op.drop_column(t, "uom")
    op.drop_index("ix_product_uoms_product", table_name="product_uoms")
    op.drop_table("product_uoms")
