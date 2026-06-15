"""
Phase 5B — GL balance assertion.

post_gl / post_gl_by_id route through _write_txn, which now calls
_assert_balanced() and refuses to write an unbalanced transaction (the core
double-entry integrity guard). These test the guard directly (pure, no DB).
"""
import pytest
from fastapi import HTTPException

from app.api.v1.gl_helpers import _assert_balanced


class _Acct:
    pass


def _entries(*pairs):
    # pairs are (debit, credit); account object is irrelevant to the guard
    return [(_Acct(), d, c) for d, c in pairs]


class TestAssertBalanced:
    def test_balanced_two_entries_ok(self):
        _assert_balanced(_entries((100.0, 0.0), (0.0, 100.0)))  # no raise

    def test_balanced_multi_entry_ok(self):
        # split credit across two accounts (e.g. revenue + tax)
        _assert_balanced(_entries((106.0, 0.0), (0.0, 100.0), (0.0, 6.0)))

    def test_unbalanced_raises_400(self):
        with pytest.raises(HTTPException) as exc:
            _assert_balanced(_entries((100.0, 0.0), (0.0, 90.0)))
        assert exc.value.status_code == 400
        assert "do not balance" in exc.value.detail

    def test_sub_cent_rounding_tolerated(self):
        # within 0.01 tolerance
        _assert_balanced(_entries((100.004, 0.0), (0.0, 100.0)))

    def test_beyond_tolerance_raises(self):
        with pytest.raises(HTTPException):
            _assert_balanced(_entries((100.02, 0.0), (0.0, 100.0)))
