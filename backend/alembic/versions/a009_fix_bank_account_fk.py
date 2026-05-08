"""Fix bank_account_id FK: point to bank_accounts instead of accounts

Revision ID: a009
Revises: a008
"""
from alembic import op

revision = "a009"
down_revision = "a008"
branch_labels = None
depends_on = None


def upgrade():
    # sales_payments
    op.drop_constraint("sales_payments_bank_account_id_fkey", "sales_payments", type_="foreignkey")
    op.create_foreign_key(
        "sales_payments_bank_account_id_fkey",
        "sales_payments", "bank_accounts",
        ["bank_account_id"], ["id"],
        ondelete="SET NULL",
    )

    # sales_refunds
    op.drop_constraint("sales_refunds_bank_account_id_fkey", "sales_refunds", type_="foreignkey")
    op.create_foreign_key(
        "sales_refunds_bank_account_id_fkey",
        "sales_refunds", "bank_accounts",
        ["bank_account_id"], ["id"],
        ondelete="SET NULL",
    )

    # sale_receipts
    op.drop_constraint("sale_receipts_bank_account_id_fkey", "sale_receipts", type_="foreignkey")
    op.create_foreign_key(
        "sale_receipts_bank_account_id_fkey",
        "sale_receipts", "bank_accounts",
        ["bank_account_id"], ["id"],
        ondelete="SET NULL",
    )


def downgrade():
    op.drop_constraint("sales_payments_bank_account_id_fkey", "sales_payments", type_="foreignkey")
    op.create_foreign_key(
        "sales_payments_bank_account_id_fkey",
        "sales_payments", "accounts",
        ["bank_account_id"], ["id"],
    )

    op.drop_constraint("sales_refunds_bank_account_id_fkey", "sales_refunds", type_="foreignkey")
    op.create_foreign_key(
        "sales_refunds_bank_account_id_fkey",
        "sales_refunds", "accounts",
        ["bank_account_id"], ["id"],
    )

    op.drop_constraint("sale_receipts_bank_account_id_fkey", "sale_receipts", type_="foreignkey")
    op.create_foreign_key(
        "sale_receipts_bank_account_id_fkey",
        "sale_receipts", "accounts",
        ["bank_account_id"], ["id"],
    )
