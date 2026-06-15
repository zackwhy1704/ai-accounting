"""Add category_account_id to bank_transactions"""
from alembic import op
import sqlalchemy as sa

revision = 'a027'
down_revision = 'a026'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('bank_transactions',
        sa.Column('category_account_id', sa.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        'fk_bank_txn_category', 'bank_transactions', 'accounts',
        ['category_account_id'], ['id'], ondelete='SET NULL')

def downgrade():
    op.drop_constraint('fk_bank_txn_category', 'bank_transactions', type_='foreignkey')
    op.drop_column('bank_transactions', 'category_account_id')
