"""Add users_limit to organizations (seat enforcement)"""
from alembic import op
import sqlalchemy as sa

revision = 'a032'
down_revision = 'a031'
branch_labels = None
depends_on = None

def upgrade():
    # Default 1 = Starter seat; plan changes set the real limit. -1 = unlimited.
    op.add_column('organizations', sa.Column('users_limit', sa.Integer(), nullable=False, server_default='1'))

def downgrade():
    op.drop_column('organizations', 'users_limit')
