"""In-org team invitations (org_user_invites).

Revision ID: a043
Revises: a042
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "a043"
down_revision = "a042"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "org_user_invites",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("role", sa.String(20), nullable=False, server_default="viewer"),
        sa.Column("token", sa.String(64), nullable=False, unique=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("invited_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_org_user_invites_org", "org_user_invites", ["organization_id"])
    op.create_index("ix_org_user_invites_token", "org_user_invites", ["token"])


def downgrade() -> None:
    op.drop_index("ix_org_user_invites_token", table_name="org_user_invites")
    op.drop_index("ix_org_user_invites_org", table_name="org_user_invites")
    op.drop_table("org_user_invites")
