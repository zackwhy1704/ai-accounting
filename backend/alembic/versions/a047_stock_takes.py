"""Stock takes: physical count worksheets that post variances as movements.

Revision ID: a047
Revises: a046
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "a047"
down_revision = "a046"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "stock_takes",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("stock_take_number", sa.String(50), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("count_date", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("location_id", UUID(as_uuid=True), sa.ForeignKey("locations.id"), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("lines", JSONB(), nullable=False, server_default="[]"),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("organization_id", "stock_take_number", name="uq_org_stock_take_number"),
    )
    op.create_index("ix_stock_takes_org", "stock_takes", ["organization_id"])


def downgrade() -> None:
    op.drop_index("ix_stock_takes_org", table_name="stock_takes")
    op.drop_table("stock_takes")
