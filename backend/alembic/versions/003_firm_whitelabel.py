"""Firm white-label: slug, parent_firm_id, brand colors, client portal

Revision ID: 003_firm_whitelabel
Revises: 002_multi_tenant
Create Date: 2026-03-26
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '003_firm_whitelabel'
down_revision: Union[str, Sequence[str], None] = '002_multi_tenant'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('organizations', sa.Column('slug', sa.String(50), nullable=True))
    op.create_index('ix_organizations_slug', 'organizations', ['slug'], unique=True)
    op.add_column('organizations', sa.Column('parent_firm_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('organizations.id'), nullable=True))
    op.create_index('ix_organizations_parent_firm', 'organizations', ['parent_firm_id'])
    op.add_column('organizations', sa.Column('brand_primary_color', sa.String(7), nullable=True))
    op.add_column('organizations', sa.Column('brand_secondary_color', sa.String(7), nullable=True))
    op.add_column('organizations', sa.Column('client_portal_enabled', sa.Boolean(),
                  server_default='false', nullable=False))


def downgrade() -> None:
    op.drop_column('organizations', 'client_portal_enabled')
    op.drop_column('organizations', 'brand_secondary_color')
    op.drop_column('organizations', 'brand_primary_color')
    op.drop_index('ix_organizations_parent_firm')
    op.drop_column('organizations', 'parent_firm_id')
    op.drop_index('ix_organizations_slug')
    op.drop_column('organizations', 'slug')
