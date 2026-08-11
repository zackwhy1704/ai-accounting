"""Purchase requisitions + direct bill→PO link for 3-way matching.

Revision ID: a046
Revises: a045
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "a046"
down_revision = "a045"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("bills", sa.Column("purchase_order_id", UUID(as_uuid=True), sa.ForeignKey("purchase_orders.id"), nullable=True))
    op.create_table(
        "purchase_requisitions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("requisition_number", sa.String(50), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("request_date", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("needed_by", sa.DateTime(timezone=True), nullable=True),
        sa.Column("requested_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("approved_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejection_reason", sa.String(500), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("lines", JSONB(), nullable=False, server_default="[]"),
        sa.Column("purchase_order_id", UUID(as_uuid=True), sa.ForeignKey("purchase_orders.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("organization_id", "requisition_number", name="uq_org_requisition_number"),
    )
    op.create_index("ix_purchase_requisitions_org", "purchase_requisitions", ["organization_id"])


def downgrade() -> None:
    op.drop_index("ix_purchase_requisitions_org", table_name="purchase_requisitions")
    op.drop_table("purchase_requisitions")
    op.drop_column("bills", "purchase_order_id")
