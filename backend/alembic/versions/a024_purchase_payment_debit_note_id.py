"""add debit_note_id to purchase_payments and amount_paid to purchase_debit_notes

Revision ID: a024
Revises: a023
Create Date: 2026-06-02
"""
from alembic import op
import sqlalchemy as sa

revision = 'a024'
down_revision = 'a023'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('purchase_payments', sa.Column('debit_note_id', sa.UUID(as_uuid=True), sa.ForeignKey('purchase_debit_notes.id', ondelete='SET NULL'), nullable=True))
    op.add_column('purchase_debit_notes', sa.Column('amount_paid', sa.Numeric(15, 2), nullable=False, server_default='0'))


def downgrade():
    op.drop_column('purchase_payments', 'debit_note_id')
    op.drop_column('purchase_debit_notes', 'amount_paid')
