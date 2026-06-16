"""Add structured default payment terms (days) to contacts"""
from alembic import op
import sqlalchemy as sa

revision = 'a031'
down_revision = 'a030'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('contacts', sa.Column('default_payment_terms_days', sa.Integer(), nullable=True))

def downgrade():
    op.drop_column('contacts', 'default_payment_terms_days')
