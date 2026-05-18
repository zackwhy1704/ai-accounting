"""PCN: add purchase_credit_applications table + pcn_id on purchase_refunds

Revision ID: a020
Revises: a019
Create Date: 2026-05-18
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "a020"
down_revision = "a019"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE IF NOT EXISTS purchase_credit_applications (
            id UUID PRIMARY KEY,
            credit_note_id UUID NOT NULL REFERENCES purchase_credit_notes(id) ON DELETE CASCADE,
            bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
            amount NUMERIC(15,2) NOT NULL,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_pca_credit_note_id ON purchase_credit_applications (credit_note_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_pca_bill_id ON purchase_credit_applications (bill_id)")

    op.execute("""
        ALTER TABLE purchase_refunds
            ADD COLUMN IF NOT EXISTS pcn_id UUID REFERENCES purchase_credit_notes(id) ON DELETE SET NULL
    """)


def downgrade():
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='purchase_refunds' AND column_name='pcn_id'
            ) THEN
                ALTER TABLE purchase_refunds DROP COLUMN pcn_id;
            END IF;
        END$$
    """)
    op.execute("DROP INDEX IF EXISTS ix_pca_bill_id")
    op.execute("DROP INDEX IF EXISTS ix_pca_credit_note_id")
    op.execute("DROP TABLE IF EXISTS purchase_credit_applications")
