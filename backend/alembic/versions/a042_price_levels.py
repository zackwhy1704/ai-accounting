"""Price levels: customer tiers + per-tier product prices + contact assignment.

Revision ID: a042
Revises: a041
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "a042"
down_revision = "a041"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "price_levels",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.String(300), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("organization_id", "name", name="uq_org_price_level"),
    )
    op.create_index("ix_price_levels_org", "price_levels", ["organization_id"])
    op.create_table(
        "product_prices",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("product_id", UUID(as_uuid=True), sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("price_level_id", UUID(as_uuid=True), sa.ForeignKey("price_levels.id", ondelete="CASCADE"), nullable=False),
        sa.Column("unit_price", sa.Numeric(18, 4), nullable=False),
        sa.UniqueConstraint("product_id", "price_level_id", name="uq_product_price_level"),
    )
    op.create_index("ix_product_prices_product", "product_prices", ["product_id"])
    op.add_column("contacts", sa.Column("price_level_id", UUID(as_uuid=True), sa.ForeignKey("price_levels.id"), nullable=True))


def downgrade() -> None:
    op.drop_column("contacts", "price_level_id")
    op.drop_index("ix_product_prices_product", table_name="product_prices")
    op.drop_table("product_prices")
    op.drop_index("ix_price_levels_org", table_name="price_levels")
    op.drop_table("price_levels")
