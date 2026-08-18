"""Shared helpers for report endpoints."""
from datetime import datetime, timezone
from fastapi import HTTPException


def parse_date(value: str, field: str = "date", *, end_of_day: bool = False) -> datetime:
    """Parse a YYYY-MM-DD (ISO) date string into a UTC datetime, or raise 400.

    Without this, a malformed/empty date hits datetime.fromisoformat -> ValueError
    -> 500 -> "error loading data" with no useful message. Returns a 400 instead.
    Set end_of_day=True for the inclusive upper bound of a range.
    """
    try:
        dt = datetime.fromisoformat(value)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail=f"Invalid {field} — expected YYYY-MM-DD")
    if end_of_day:
        dt = dt.replace(hour=23, minute=59, second=59)
    return dt.replace(tzinfo=timezone.utc)


# ── Account nature classification ──────────────────────────────────────────────
# Malaysian accountants encode the account nature in the FIRST DIGIT of the
# account code: 1 Asset, 2 Liability, 3 Equity, 4 Revenue, 5 Cost (of sales),
# 6 Expense, 8 Other Income, 9 Other Expense. Reports classify by the stored
# account type first and fall back to the code digit, so no account can ever
# drop out of the statements just because its type label is unusual.

NATURE_ASSET = "asset"
NATURE_LIABILITY = "liability"
NATURE_EQUITY = "equity"
NATURE_REVENUE = "revenue"
NATURE_COST_OF_SALES = "cost_of_sales"
NATURE_EXPENSE = "expense"
NATURE_OTHER_INCOME = "other_income"
NATURE_OTHER_EXPENSE = "other_expense"

PL_NATURES = (NATURE_REVENUE, NATURE_COST_OF_SALES, NATURE_EXPENSE,
              NATURE_OTHER_INCOME, NATURE_OTHER_EXPENSE)
BS_NATURES = (NATURE_ASSET, NATURE_LIABILITY, NATURE_EQUITY)

# Credit-balance natures (positive balance = credit side)
CREDIT_NATURES = (NATURE_LIABILITY, NATURE_EQUITY, NATURE_REVENUE, NATURE_OTHER_INCOME)

_TYPE_TO_NATURE = {
    "asset": NATURE_ASSET, "assets": NATURE_ASSET, "bank": NATURE_ASSET,
    "cash": NATURE_ASSET, "fixed_asset": NATURE_ASSET, "current_asset": NATURE_ASSET,
    "liability": NATURE_LIABILITY, "liabilities": NATURE_LIABILITY,
    "current_liability": NATURE_LIABILITY,
    "equity": NATURE_EQUITY,
    "revenue": NATURE_REVENUE, "income": NATURE_REVENUE, "sales": NATURE_REVENUE,
    "cogs": NATURE_COST_OF_SALES, "cost_of_sales": NATURE_COST_OF_SALES,
    "cost": NATURE_COST_OF_SALES,
    "expense": NATURE_EXPENSE, "expenses": NATURE_EXPENSE,
    "operating_expense": NATURE_EXPENSE,
    "other_income": NATURE_OTHER_INCOME,
    "other_expense": NATURE_OTHER_EXPENSE, "other_expenses": NATURE_OTHER_EXPENSE,
}

_DIGIT_TO_NATURE = {
    "1": NATURE_ASSET, "2": NATURE_LIABILITY, "3": NATURE_EQUITY,
    "4": NATURE_REVENUE, "5": NATURE_COST_OF_SALES, "6": NATURE_EXPENSE,
    "7": NATURE_EXPENSE, "8": NATURE_OTHER_INCOME, "9": NATURE_OTHER_EXPENSE,
}


def account_nature(acct_type: str | None, code: str | None) -> str:
    """Resolve an account's nature from its type label, falling back to the
    Malaysian first-digit code convention. Unresolvable accounts land in
    'expense' so they always remain visible on the P&L rather than vanishing."""
    t = (acct_type or "").strip().lower().replace(" ", "_")
    if t in _TYPE_TO_NATURE:
        # The stored type wins EXCEPT when the generic labels disagree with an
        # explicit code digit for the P&L-detail natures (a chart imported with
        # everything typed "expense" still splits 5/6/8/9 correctly by code).
        nature = _TYPE_TO_NATURE[t]
        digit = (code or "").strip()[:1]
        digit_nature = _DIGIT_TO_NATURE.get(digit)
        if digit_nature and nature in (NATURE_EXPENSE, NATURE_REVENUE) and digit_nature in (
            NATURE_COST_OF_SALES, NATURE_EXPENSE, NATURE_OTHER_INCOME, NATURE_OTHER_EXPENSE, NATURE_REVENUE,
        ):
            # only refine WITHIN the P&L side (never flip income <-> expense side)
            income_side = {NATURE_REVENUE, NATURE_OTHER_INCOME}
            if (nature in income_side) == (digit_nature in income_side):
                return digit_nature
        return nature
    digit = (code or "").strip()[:1]
    return _DIGIT_TO_NATURE.get(digit, NATURE_EXPENSE)
