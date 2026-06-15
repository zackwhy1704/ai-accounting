"""Add default GL account columns to organizations"""
from alembic import op
import sqlalchemy as sa

revision = 'a028'
down_revision = 'a027'
branch_labels = None
depends_on = None

def upgrade():
    for col in ['default_ar_account_id', 'default_ap_account_id', 'default_bank_account_id',
                'default_revenue_account_id', 'default_expense_account_id']:
        op.add_column('organizations', sa.Column(col, sa.UUID(as_uuid=True), nullable=True))

def downgrade():
    for col in ['default_ar_account_id', 'default_ap_account_id', 'default_bank_account_id',
                'default_revenue_account_id', 'default_expense_account_id']:
        op.drop_column('organizations', col)
