"""add gl_account_id to bank_accounts

Revision ID: a025
Revises: a024
Create Date: 2026-06-15
"""
from alembic import op
import sqlalchemy as sa

revision = 'a025'
down_revision = 'a024'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'bank_accounts',
        sa.Column(
            'gl_account_id',
            sa.UUID(as_uuid=True),
            sa.ForeignKey('accounts.id', ondelete='SET NULL'),
            nullable=True,
        )
    )


def downgrade():
    op.drop_column('bank_accounts', 'gl_account_id')
