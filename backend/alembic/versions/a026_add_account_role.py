"""add account_role and parent_id to accounts

Revision ID: a026
Revises: a025
Create Date: 2026-06-15
"""
from alembic import op
import sqlalchemy as sa

revision = 'a026'
down_revision = 'a025'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'accounts',
        sa.Column('account_role', sa.String(20), nullable=False, server_default='account')
    )
    op.add_column(
        'accounts',
        sa.Column('parent_id', sa.UUID(as_uuid=True), nullable=True)
    )


def downgrade():
    op.drop_column('accounts', 'parent_id')
    op.drop_column('accounts', 'account_role')
