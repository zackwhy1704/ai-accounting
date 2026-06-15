"""
Property tests for the double-entry invariant enforced by
manual_journals.create_journal:

  1. A journal must have at least 2 lines.
  2. Total debits must equal total credits within a 0.01 tolerance.

The endpoint itself needs a DB + auth context, so here we test the pure
validation rule it applies. If you change the rule in
manual_journals.py (line count or tolerance), update this test to match.
"""
import pytest

# Mirror of the exact rule in manual_journals.create_journal.
MIN_LINES = 2
BALANCE_TOLERANCE = 0.01


def journal_is_valid(lines: list[dict]) -> tuple[bool, str | None]:
    if not lines or len(lines) < MIN_LINES:
        return False, "Journal must have at least 2 lines"
    total_debit = sum(l.get("debit", 0) for l in lines)
    total_credit = sum(l.get("credit", 0) for l in lines)
    if abs(total_debit - total_credit) > BALANCE_TOLERANCE:
        return False, "Debits must equal credits"
    return True, None


class TestLineCount:
    def test_rejects_zero_lines(self):
        ok, err = journal_is_valid([])
        assert not ok and "at least 2 lines" in err

    def test_rejects_single_line(self):
        ok, err = journal_is_valid([{"debit": 100, "credit": 0}])
        assert not ok and "at least 2 lines" in err


class TestBalance:
    def test_balanced_two_line_journal(self):
        ok, err = journal_is_valid([
            {"debit": 100.0, "credit": 0},
            {"debit": 0, "credit": 100.0},
        ])
        assert ok and err is None

    def test_unbalanced_is_rejected(self):
        ok, err = journal_is_valid([
            {"debit": 100.0, "credit": 0},
            {"debit": 0, "credit": 90.0},
        ])
        assert not ok and "Debits must equal credits" in err

    def test_rounding_within_tolerance_passes(self):
        # a sub-cent difference (< 0.01) is allowed for float rounding
        ok, _ = journal_is_valid([
            {"debit": 100.000, "credit": 0},
            {"debit": 0, "credit": 100.005},
        ])
        assert ok

    def test_difference_beyond_tolerance_fails(self):
        # a 1-cent-plus difference is rejected (abs(diff) > 0.01)
        ok, _ = journal_is_valid([
            {"debit": 100.00, "credit": 0},
            {"debit": 0, "credit": 100.02},
        ])
        assert not ok

    @pytest.mark.parametrize("amounts", [
        [(600, 0), (0, 600)],
        [(750, 0), (0, 750)],
        [(600, 0), (90, 0), (60, 0), (0, 750)],  # multi-line balanced (matches GRN scenario)
        [(795, 0), (0, 750), (0, 45)],            # Dr AP, Cr expense+tax
    ])
    def test_multi_line_balanced_journals(self, amounts):
        lines = [{"debit": d, "credit": c} for d, c in amounts]
        ok, _ = journal_is_valid(lines)
        assert ok
