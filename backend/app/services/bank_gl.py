"""
Shared bank-transaction double-entry builder.

Both bank_transactions (manual money in/out) and bank_reconciliation
(create-transaction-during-reconcile) post the same shape of journal:
a balanced two-leg entry between the bank GL account and a category account.

Keeping the leg-direction logic in ONE place prevents the two modules from
drifting (the same class of divergence that caused the P0 invoice/bill bug).
"""
from uuid import UUID


def build_bank_entries(
    bank_gl_account_id: UUID,
    category_account_id: UUID,
    amount: float,
    is_income: bool,
) -> list[tuple[UUID, float, float]]:
    """Return a balanced [(account_id, debit, credit), ...] for a bank movement.

    Income  (money in):  DR Bank / CR Income category
    Expense (money out): DR Expense category / CR Bank
    """
    amount = float(amount or 0)
    if is_income:
        return [
            (bank_gl_account_id, amount, 0.0),
            (category_account_id, 0.0, amount),
        ]
    return [
        (category_account_id, amount, 0.0),
        (bank_gl_account_id, 0.0, amount),
    ]
