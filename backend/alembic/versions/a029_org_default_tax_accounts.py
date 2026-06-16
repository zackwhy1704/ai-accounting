"""Add default output/input tax GL account columns to organizations"""
from alembic import op
import sqlalchemy as sa

revision = 'a029'
down_revision = 'a028'
branch_labels = None
depends_on = None

def upgrade():
    for col in ['default_tax_account_id', 'default_input_tax_account_id']:
        op.add_column('organizations', sa.Column(col, sa.UUID(as_uuid=True), nullable=True))

def downgrade():
    for col in ['default_tax_account_id', 'default_input_tax_account_id']:
        op.drop_column('organizations', col)
