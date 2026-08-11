"""Recurring-journal template validation + schedule advancement."""
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from app.api.v1.recurring_journals import validate_journal_lines
from app.api.v1.recurring_invoices import _calc_next_run


def test_balanced_lines_pass():
    validate_journal_lines([
        {"account_id": "a", "debit": 100.0, "credit": 0},
        {"account_id": "b", "debit": 0, "credit": 100.0},
    ])


def test_unbalanced_lines_rejected():
    with pytest.raises(HTTPException) as e:
        validate_journal_lines([
            {"account_id": "a", "debit": 100.0, "credit": 0},
            {"account_id": "b", "debit": 0, "credit": 90.0},
        ])
    assert e.value.status_code == 422


def test_single_line_rejected():
    with pytest.raises(HTTPException):
        validate_journal_lines([{"account_id": "a", "debit": 100.0, "credit": 0}])


def test_missing_account_rejected():
    with pytest.raises(HTTPException):
        validate_journal_lines([
            {"debit": 100.0, "credit": 0},
            {"account_id": "b", "debit": 0, "credit": 100.0},
        ])


def test_multi_line_balanced_ok():
    validate_journal_lines([
        {"account_id": "a", "debit": 60.0, "credit": 0},
        {"account_id": "b", "debit": 40.0, "credit": 0},
        {"account_id": "c", "debit": 0, "credit": 100.0},
    ])


def test_next_run_monthly_advances():
    start = datetime(2026, 1, 31, tzinfo=timezone.utc)
    nxt = _calc_next_run(start, "monthly", 1, from_date=start)
    assert (nxt.year, nxt.month) == (2026, 2)
    # month-end clamping (Jan 31 -> Feb 28)
    assert nxt.day in (28, 29)


def test_next_run_yearly():
    start = datetime(2026, 3, 15, tzinfo=timezone.utc)
    nxt = _calc_next_run(start, "yearly", 1, from_date=start)
    assert (nxt.year, nxt.month, nxt.day) == (2027, 3, 15)
