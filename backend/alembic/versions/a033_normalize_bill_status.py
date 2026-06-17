"""normalize legacy bill/DN status 'partially paid' -> 'partially_paid'

The Bill model's mark_paid() writes 'partially_paid' (underscore), but the
purchase-payment endpoints historically wrote 'partially paid' (space). That
mismatch made Bill.can_edit() reject genuinely-editable bills. This backfills
existing rows to the canonical underscore form.

Revision ID: a033
Revises: a032
"""
from alembic import op

revision = "a033"
down_revision = "a032"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for tbl in ("invoices", "bills", "credit_notes", "debit_notes", "purchase_debit_notes"):
        op.execute(f"UPDATE {tbl} SET status = 'partially_paid' WHERE status = 'partially paid'")


def downgrade() -> None:
    for tbl in ("invoices", "bills", "credit_notes", "debit_notes", "purchase_debit_notes"):
        op.execute(f"UPDATE {tbl} SET status = 'partially paid' WHERE status = 'partially_paid'")
