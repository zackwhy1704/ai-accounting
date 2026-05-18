"""rename vendor_credits to purchase_credit_notes, vendor_credit_number to pcn_number

Revision ID: a018
Revises: a017
Create Date: 2026-05-14
"""
from alembic import op
import sqlalchemy as sa

revision = "a018"
down_revision = "a017"
branch_labels = None
depends_on = None


def upgrade():
    # Only rename if vendor_credits still exists (idempotent)
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='vendor_credits') THEN
                ALTER TABLE vendor_credits RENAME TO purchase_credit_notes;
            END IF;
        END$$
    """)

    # Rename column only if old name still exists
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='purchase_credit_notes' AND column_name='vendor_credit_number'
            ) THEN
                ALTER TABLE purchase_credit_notes RENAME COLUMN vendor_credit_number TO pcn_number;
            END IF;
        END$$
    """)

    # Drop old unique constraint if it exists
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname='uq_org_vendor_credit_number'
            ) THEN
                ALTER TABLE purchase_credit_notes DROP CONSTRAINT uq_org_vendor_credit_number;
            END IF;
        END$$
    """)

    # Create new unique constraint if it doesn't exist
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname='uq_org_pcn_number'
            ) THEN
                ALTER TABLE purchase_credit_notes ADD CONSTRAINT uq_org_pcn_number UNIQUE (organization_id, pcn_number);
            END IF;
        END$$
    """)

    # Drop old index if exists
    op.execute("DROP INDEX IF EXISTS ix_vendor_credits_org_status")

    # Create new index if not exists
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_purchase_credit_notes_org_status
        ON purchase_credit_notes (organization_id, status)
    """)


def downgrade():
    op.execute("DROP INDEX IF EXISTS ix_purchase_credit_notes_org_status")
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_vendor_credits_org_status
        ON purchase_credit_notes (organization_id, status)
    """)
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='uq_org_pcn_number') THEN
                ALTER TABLE purchase_credit_notes DROP CONSTRAINT uq_org_pcn_number;
            END IF;
        END$$
    """)
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='uq_org_vendor_credit_number') THEN
                ALTER TABLE purchase_credit_notes ADD CONSTRAINT uq_org_vendor_credit_number UNIQUE (organization_id, pcn_number);
            END IF;
        END$$
    """)
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='purchase_credit_notes') THEN
                ALTER TABLE purchase_credit_notes RENAME TO vendor_credits;
            END IF;
        END$$
    """)
