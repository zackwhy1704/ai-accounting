"""Perpetual inventory: stock_moves ledger, weighted-average cost, product
linkage on document line items, location FKs on transfers.

avg_cost is initialized from cost_price so existing stock values carry over.

Revision ID: a040
Revises: a039
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "a040"
down_revision = "a039"
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
    op.add_column("products", sa.Column("avg_cost", sa.Numeric(18, 4), nullable=False, server_default="0"))
    op.execute("UPDATE products SET avg_cost = cost_price")

    for t in LINE_TABLES:
        op.add_column(t, sa.Column("product_id", UUID(as_uuid=True), sa.ForeignKey("products.id"), nullable=True))

    op.add_column("stock_transfers", sa.Column("from_location_id", UUID(as_uuid=True), sa.ForeignKey("locations.id"), nullable=True))
    op.add_column("stock_transfers", sa.Column("to_location_id", UUID(as_uuid=True), sa.ForeignKey("locations.id"), nullable=True))

    op.create_table(
        "stock_moves",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_id", UUID(as_uuid=True), sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("location_id", UUID(as_uuid=True), sa.ForeignKey("locations.id"), nullable=True),
        sa.Column("date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("qty", sa.Numeric(18, 4), nullable=False),
        sa.Column("unit_cost", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("source_type", sa.String(30), nullable=False),
        sa.Column("source_id", UUID(as_uuid=True), nullable=True),
        sa.Column("note", sa.String(300), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_stock_moves_org_product", "stock_moves", ["organization_id", "product_id"])
    op.create_index("ix_stock_moves_source", "stock_moves", ["source_type", "source_id"])
    op.create_index("ix_stock_moves_organization_id", "stock_moves", ["organization_id"])


def downgrade() -> None:
    op.drop_index("ix_stock_moves_organization_id", table_name="stock_moves")
    op.drop_index("ix_stock_moves_source", table_name="stock_moves")
    op.drop_index("ix_stock_moves_org_product", table_name="stock_moves")
    op.drop_table("stock_moves")
    op.drop_column("stock_transfers", "to_location_id")
    op.drop_column("stock_transfers", "from_location_id")
    for t in reversed(LINE_TABLES):
        op.drop_column(t, "product_id")
    op.drop_column("products", "avg_cost")
