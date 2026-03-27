"""Add client_invitations table

Revision ID: 005_client_invitations
Revises: 004_firm_profile_fields
Create Date: 2026-03-27
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = '005_client_invitations'
down_revision = '004_firm_profile_fields'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'client_invitations',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('firm_id', UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('invited_by_user_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('contact_name', sa.String(255), nullable=False),
        sa.Column('business_name', sa.String(255), nullable=False),
        sa.Column('email', sa.String(255), nullable=False, index=True),
        sa.Column('token', sa.String(500), nullable=False, unique=True, index=True),
        sa.Column('status', sa.String(20), server_default='pending', nullable=False),
        sa.Column('client_org_id', UUID(as_uuid=True), sa.ForeignKey('organizations.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('accepted_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('client_invitations')
