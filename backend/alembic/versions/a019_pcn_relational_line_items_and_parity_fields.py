"""PCN: relational line items table, reference, discount_amount, credit_applied, updated_at

Revision ID: a019
Revises: a018
Create Date: 2026-05-14
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "a019"
down_revision = "a018"
branch_labels = None
depends_on = None


def upgrade():
    # Add new columns (IF NOT EXISTS for idempotency)
    op.execute("""
        ALTER TABLE purchase_credit_notes
            ADD COLUMN IF NOT EXISTS reference VARCHAR(100) NULL,
            ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS credit_applied NUMERIC(15,2) NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NULL
    """)

    # Migrate credit_applied from amount_applied if amount_applied exists
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='purchase_credit_notes' AND column_name='amount_applied'
            ) THEN
                UPDATE purchase_credit_notes SET credit_applied = COALESCE(amount_applied, 0);
            END IF;
        END$$
    """)

    # Create relational line items table if not exists
    op.execute("""
        CREATE TABLE IF NOT EXISTS purchase_credit_note_line_items (
            id UUID PRIMARY KEY,
            credit_note_id UUID NOT NULL REFERENCES purchase_credit_notes(id) ON DELETE CASCADE,
            line_type VARCHAR(10) NOT NULL DEFAULT 'goods',
            description VARCHAR(500) NOT NULL,
            quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
            unit_price NUMERIC(15,2) NOT NULL DEFAULT 0,
            discount NUMERIC(15,2) NOT NULL DEFAULT 0,
            discount_mode VARCHAR(10) NOT NULL DEFAULT 'percent',
            tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
            tax_code_id UUID REFERENCES tax_rates(id) NULL,
            amount NUMERIC(15,2) NOT NULL DEFAULT 0,
            account_id UUID REFERENCES accounts(id) NULL,
            sort_order INTEGER NOT NULL DEFAULT 0
        )
    """)

    # Migrate JSONB line_items → relational (only if line_items column still exists)
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='purchase_credit_notes' AND column_name='line_items'
            ) THEN
                INSERT INTO purchase_credit_note_line_items
                    (id, credit_note_id, line_type, description, quantity, unit_price,
                     discount, discount_mode, tax_rate, amount, sort_order)
                SELECT
                    gen_random_uuid(),
                    pcn.id,
                    COALESCE((li->>'line_type')::varchar, 'goods'),
                    COALESCE(li->>'description', ''),
                    COALESCE((li->>'quantity')::numeric, 1),
                    COALESCE((li->>'unit_price')::numeric, 0),
                    COALESCE((li->>'discount')::numeric, 0),
                    COALESCE(li->>'discount_mode', 'percent'),
                    COALESCE((li->>'tax_rate')::numeric, 0),
                    COALESCE((li->>'amount')::numeric, 0),
                    COALESCE((li->>'sort_order')::int, 0)
                FROM purchase_credit_notes pcn,
                     jsonb_array_elements(pcn.line_items) WITH ORDINALITY arr(li, idx)
                WHERE jsonb_typeof(pcn.line_items) = 'array'
                  AND jsonb_array_length(pcn.line_items) > 0;
            END IF;
        END$$
    """)

    # Fix numeric precision
    op.execute("ALTER TABLE purchase_credit_notes ALTER COLUMN subtotal TYPE NUMERIC(15,2)")
    op.execute("ALTER TABLE purchase_credit_notes ALTER COLUMN tax_amount TYPE NUMERIC(15,2)")
    op.execute("ALTER TABLE purchase_credit_notes ALTER COLUMN total TYPE NUMERIC(15,2)")

    # Drop old columns if they exist
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='purchase_credit_notes' AND column_name='line_items'
            ) THEN
                ALTER TABLE purchase_credit_notes DROP COLUMN line_items;
            END IF;
        END$$
    """)
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='purchase_credit_notes' AND column_name='amount_applied'
            ) THEN
                ALTER TABLE purchase_credit_notes DROP COLUMN amount_applied;
            END IF;
        END$$
    """)


def downgrade():
    op.add_column("purchase_credit_notes", sa.Column("amount_applied", sa.Numeric(15, 2), nullable=False, server_default="0"))
    op.add_column("purchase_credit_notes", sa.Column("line_items", postgresql.JSONB, nullable=True, server_default="[]"))
    op.drop_table("purchase_credit_note_line_items")
    op.drop_column("purchase_credit_notes", "credit_applied")
    op.drop_column("purchase_credit_notes", "discount_amount")
    op.drop_column("purchase_credit_notes", "reference")
    op.drop_column("purchase_credit_notes", "updated_at")
