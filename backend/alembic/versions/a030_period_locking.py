"""Add locked_through_date to organizations (period locking / fiscal close)"""
from alembic import op
import sqlalchemy as sa

revision = 'a030'
down_revision = 'a029'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('organizations', sa.Column('locked_through_date', sa.DateTime(timezone=True), nullable=True))

def downgrade():
    op.drop_column('organizations', 'locked_through_date')
