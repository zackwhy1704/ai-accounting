"""Firm profile: favicon, custom domain, description, contact fields, is_archived

Revision ID: 004_firm_profile_fields
Revises: a001_add_documents_category
Create Date: 2026-03-26
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '004_firm_profile_fields'
down_revision: Union[str, Sequence[str], None] = '003_firm_whitelabel'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('organizations', sa.Column('favicon_url', sa.String(1000), nullable=True))
    op.add_column('organizations', sa.Column('custom_domain', sa.String(255), nullable=True))
    op.create_index('ix_organizations_custom_domain', 'organizations', ['custom_domain'], unique=True)
    op.add_column('organizations', sa.Column('firm_description', sa.Text(), nullable=True))
    op.add_column('organizations', sa.Column('firm_contact_email', sa.String(255), nullable=True))
    op.add_column('organizations', sa.Column('firm_website', sa.String(500), nullable=True))
    op.add_column('organizations', sa.Column('firm_support_email', sa.String(255), nullable=True))
    op.add_column('organizations', sa.Column('is_archived', sa.Boolean(), server_default='false', nullable=False))


def downgrade() -> None:
    op.drop_column('organizations', 'is_archived')
    op.drop_column('organizations', 'firm_support_email')
    op.drop_column('organizations', 'firm_website')
    op.drop_column('organizations', 'firm_contact_email')
    op.drop_column('organizations', 'firm_description')
    op.drop_index('ix_organizations_custom_domain')
    op.drop_column('organizations', 'custom_domain')
    op.drop_column('organizations', 'favicon_url')
