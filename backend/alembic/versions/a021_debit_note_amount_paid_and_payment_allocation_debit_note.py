"""a021 add debit_note amount_paid and payment_allocation debit_note_id

Revision ID: a021
Revises: a020
Create Date: 2026-05-23
"""
from alembic import op

revision = "a021"
down_revision = "a020"
branch_labels = None
depends_on = None


def upgrade():
    # Add amount_paid to debit_notes
    op.execute("""
        ALTER TABLE debit_notes
            ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(15,2) NOT NULL DEFAULT 0
    """)

    # Make invoice_id nullable and add debit_note_id to payment_allocations
    op.execute("""
        ALTER TABLE payment_allocations
            ALTER COLUMN invoice_id DROP NOT NULL
    """)
    op.execute("""
        ALTER TABLE payment_allocations
            ADD COLUMN IF NOT EXISTS debit_note_id UUID REFERENCES debit_notes(id) ON DELETE SET NULL
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_payment_allocations_debit_note_id
            ON payment_allocations (debit_note_id)
    """)


def downgrade():
    op.execute("DROP INDEX IF EXISTS ix_payment_allocations_debit_note_id")
    op.execute("ALTER TABLE payment_allocations DROP COLUMN IF EXISTS debit_note_id")
    op.execute("ALTER TABLE debit_notes DROP COLUMN IF EXISTS amount_paid")
