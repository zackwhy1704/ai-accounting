"""Batch/serial tracking: stock_batches, tracking_mode, batch on moves + lines.

Revision ID: a045
Revises: a044
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "a045"
down_revision = "a044"
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
    op.add_column("products", sa.Column("tracking_mode", sa.String(10), nullable=False, server_default="none"))
    op.create_table(
        "stock_batches",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_id", UUID(as_uuid=True), sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("batch_no", sa.String(64), nullable=False),
        sa.Column("expiry_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("qty_on_hand", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("product_id", "batch_no", name="uq_product_batch_no"),
    )
    op.create_index("ix_stock_batches_org", "stock_batches", ["organization_id"])
    op.create_index("ix_stock_batches_product", "stock_batches", ["product_id"])
    op.add_column("stock_moves", sa.Column("batch_id", UUID(as_uuid=True), sa.ForeignKey("stock_batches.id"), nullable=True))
    for t in LINE_TABLES:
        op.add_column(t, sa.Column("batch_no", sa.String(64), nullable=True))
        op.add_column(t, sa.Column("expiry_date", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    for t in reversed(LINE_TABLES):
        op.drop_column(t, "expiry_date")
        op.drop_column(t, "batch_no")
    op.drop_column("stock_moves", "batch_id")
    op.drop_index("ix_stock_batches_product", table_name="stock_batches")
    op.drop_index("ix_stock_batches_org", table_name="stock_batches")
    op.drop_table("stock_batches")
    op.drop_column("products", "tracking_mode")
