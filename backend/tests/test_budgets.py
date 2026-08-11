"""Budget-vs-actual: period bucket math + payload validation."""
import pytest
from pydantic import ValidationError

from app.api.v1.budgets import BudgetLineIn, budget_amount_for_period


def test_full_year_sums_all_buckets():
    amounts = [100] * 12
    assert budget_amount_for_period(amounts, 1, 12) == 1200.0


def test_partial_period():
    amounts = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]
    assert budget_amount_for_period(amounts, 3, 5) == 120.0  # Mar+Apr+May
    assert budget_amount_for_period(amounts, 12, 12) == 120.0


def test_short_or_empty_amounts_tolerated():
    assert budget_amount_for_period([], 1, 12) == 0.0
    assert budget_amount_for_period([100, 200], 1, 12) == 300.0
    assert budget_amount_for_period(None, 1, 3) == 0.0


def test_line_requires_exactly_12_months():
    with pytest.raises(ValidationError):
        BudgetLineIn(account_id="0" * 32, amounts=[100] * 11)
    line = BudgetLineIn(account_id="00000000-0000-0000-0000-000000000000", amounts=[100.005] * 12)
    assert line.amounts[0] == 100.0  # rounded to 2dp
