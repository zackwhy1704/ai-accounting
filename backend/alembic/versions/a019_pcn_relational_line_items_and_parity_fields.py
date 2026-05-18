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
    # Add new columns to purchase_credit_notes
    op.add_column("purchase_credit_notes", sa.Column("reference", sa.String(100), nullable=True))
    op.add_column("purchase_credit_notes", sa.Column("discount_amount", sa.Numeric(15, 2), nullable=False, server_default="0"))
    op.add_column("purchase_credit_notes", sa.Column("credit_applied", sa.Numeric(15, 2), nullable=False, server_default="0"))
    op.add_column("purchase_credit_notes", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True))

    # Migrate existing JSONB line_items → relational table, then drop JSONB column
    op.create_table(
        "purchase_credit_note_line_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("credit_note_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("purchase_credit_notes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("line_type", sa.String(10), nullable=False, server_default="goods"),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("quantity", sa.Numeric(10, 2), nullable=False, server_default="1"),
        sa.Column("unit_price", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("discount", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("discount_mode", sa.String(10), nullable=False, server_default="percent"),
        sa.Column("tax_rate", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("tax_code_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tax_rates.id"), nullable=True),
        sa.Column("amount", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("accounts.id"), nullable=True),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
    )

    # Migrate JSONB data to relational table
    op.execute("""
        INSERT INTO purchase_credit_note_line_items
            (id, credit_note_id, line_type, description, quantity, unit_price, discount, discount_mode, tax_rate, amount, sort_order)
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
    """)

    # Also fix subtotal precision from Numeric(18,4) to Numeric(15,2) and rename amount_applied → credit_applied
    op.alter_column("purchase_credit_notes", "subtotal",
        existing_type=sa.Numeric(18, 4), type_=sa.Numeric(15, 2))
    op.alter_column("purchase_credit_notes", "tax_amount",
        existing_type=sa.Numeric(18, 4), type_=sa.Numeric(15, 2))
    op.alter_column("purchase_credit_notes", "total",
        existing_type=sa.Numeric(18, 4), type_=sa.Numeric(15, 2))

    # Drop old JSONB column and amount_applied (replaced by credit_applied)
    op.drop_column("purchase_credit_notes", "line_items")
    op.drop_column("purchase_credit_notes", "amount_applied")


def downgrade():
    op.add_column("purchase_credit_notes", sa.Column("amount_applied", sa.Numeric(15, 2), nullable=False, server_default="0"))
    op.add_column("purchase_credit_notes", sa.Column("line_items", postgresql.JSONB, nullable=True, server_default="[]"))
    op.drop_table("purchase_credit_note_line_items")
    op.drop_column("purchase_credit_notes", "credit_applied")
    op.drop_column("purchase_credit_notes", "discount_amount")
    op.drop_column("purchase_credit_notes", "reference")
    op.drop_column("purchase_credit_notes", "updated_at")
