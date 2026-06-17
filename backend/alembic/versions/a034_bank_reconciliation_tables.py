"""create bank_statement_lines and reconciliation_rules tables

The BankStatementLine and ReconciliationRule models existed but no migration ever
created their tables, so every bank-reconciliation read (/lines, /summary) hit
UndefinedTableError -> 500 -> "Something went wrong loading data" in the UI.

Revision ID: a034
Revises: a033
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "a034"
down_revision = "a033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "bank_statement_lines",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("bank_account_id", UUID(as_uuid=True), sa.ForeignKey("bank_accounts.id"), nullable=True),
        sa.Column("date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("reference", sa.String(200), nullable=True),
        sa.Column("amount", sa.Numeric(18, 4), nullable=False),
        sa.Column("balance", sa.Numeric(18, 4), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="unmatched"),
        sa.Column("matched_transaction_id", UUID(as_uuid=True), sa.ForeignKey("transactions.id"), nullable=True),
        sa.Column("match_confidence", sa.Numeric(5, 2), nullable=True),
        sa.Column("match_reason", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "reconciliation_rules",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("pattern", sa.String(500), nullable=False),
        sa.Column("account_id", UUID(as_uuid=True), sa.ForeignKey("accounts.id"), nullable=True),
        sa.Column("contact_id", UUID(as_uuid=True), sa.ForeignKey("contacts.id"), nullable=True),
        sa.Column("match_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("organization_id", "pattern", name="uq_org_recon_pattern"),
    )


def downgrade() -> None:
    op.drop_table("reconciliation_rules")
    op.drop_table("bank_statement_lines")
