"""Multi-tenant: user_organizations junction, org onboarding fields

Revision ID: 002_multi_tenant
Revises: 028574c47fa6
Create Date: 2026-03-26
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '002_multi_tenant'
down_revision: Union[str, Sequence[str], None] = 'a001_add_docs_cat'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # -- Organization: new columns --
    op.add_column('organizations', sa.Column('org_type', sa.String(20), server_default='sme', nullable=False))
    op.add_column('organizations', sa.Column('country', sa.String(2), server_default='SG', nullable=False))
    op.add_column('organizations', sa.Column('timezone', sa.String(50), server_default='Asia/Singapore', nullable=False))
    op.add_column('organizations', sa.Column('fiscal_year_end_day', sa.Integer(), server_default='31', nullable=False))
    op.add_column('organizations', sa.Column('fiscal_year_end_month', sa.Integer(), server_default='12', nullable=False))
    op.add_column('organizations', sa.Column('has_employees', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('organizations', sa.Column('previous_tool', sa.String(100), nullable=True))
    op.add_column('organizations', sa.Column('logo_url', sa.String(1000), nullable=True))
    op.add_column('organizations', sa.Column('onboarding_completed', sa.Boolean(), server_default='false', nullable=False))

    # -- User: phone --
    op.add_column('users', sa.Column('phone', sa.String(30), nullable=True))

    # -- UserOrganization junction table --
    op.create_table(
        'user_organizations',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('role', sa.String(20), server_default='admin', nullable=False),
        sa.Column('is_default', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('invited_by', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id'), nullable=True),
        sa.Column('joined_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.UniqueConstraint('user_id', 'organization_id', name='uq_user_org'),
    )

    # -- Backfill: create user_organizations rows for all existing users --
    op.execute("""
        INSERT INTO user_organizations (id, user_id, organization_id, role, is_default)
        SELECT gen_random_uuid(), id, organization_id, role, true
        FROM users
    """)

    # -- Mark existing orgs as onboarding completed --
    op.execute("UPDATE organizations SET onboarding_completed = true")


def downgrade() -> None:
    op.drop_table('user_organizations')
    op.drop_column('users', 'phone')
    op.drop_column('organizations', 'onboarding_completed')
    op.drop_column('organizations', 'logo_url')
    op.drop_column('organizations', 'previous_tool')
    op.drop_column('organizations', 'has_employees')
    op.drop_column('organizations', 'fiscal_year_end_month')
    op.drop_column('organizations', 'fiscal_year_end_day')
    op.drop_column('organizations', 'timezone')
    op.drop_column('organizations', 'country')
    op.drop_column('organizations', 'org_type')
