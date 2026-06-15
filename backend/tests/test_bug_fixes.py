"""
Regression tests for bugs fixed in the ACCRULY production hardening pass.
These tests verify the exact bugs that were found and fixed.
"""
import pytest
from pydantic import ValidationError
from uuid import uuid4

from app.schemas.sales import LineItemCreate
from app.schemas.accounting import ManualJournalCreate, ManualJournalLineCreate
from app.core.line_items import calculate_line_items


# ─────────────────────────────────────────
# LineItemCreate validators
# ─────────────────────────────────────────

class TestLineItemValidators:
    def test_valid_percent_discount(self):
        item = LineItemCreate(description="Widget", quantity=2, unit_price=100.0, discount=10, discount_mode="percent")
        assert item.discount == 10
        assert item.discount_mode == "percent"

    def test_valid_amount_discount(self):
        item = LineItemCreate(description="Widget", quantity=1, unit_price=500.0, discount=50, discount_mode="amount")
        assert item.discount == 50
        assert item.discount_mode == "amount"

    def test_negative_quantity_rejected(self):
        with pytest.raises(ValidationError):
            LineItemCreate(description="Widget", quantity=-1, unit_price=100.0)

    def test_negative_discount_rejected(self):
        with pytest.raises(ValidationError):
            LineItemCreate(description="Widget", quantity=1, unit_price=100.0, discount=-5)

    def test_percent_over_100_rejected(self):
        with pytest.raises(ValidationError):
            LineItemCreate(description="Widget", quantity=1, unit_price=100.0, discount=101, discount_mode="percent")

    def test_invalid_discount_mode_rejected(self):
        with pytest.raises(ValidationError):
            LineItemCreate(description="Widget", quantity=1, unit_price=100.0, discount_mode="percentage")

    def test_discount_mode_defaults_to_percent(self):
        item = LineItemCreate(description="Widget", quantity=1, unit_price=100.0)
        assert item.discount_mode == "percent"


# ─────────────────────────────────────────
# ManualJournalCreate balance validator
# ─────────────────────────────────────────

class TestManualJournalBalance:
    def _line(self, debit=0.0, credit=0.0):
        return ManualJournalLineCreate(account_id=uuid4(), debit=debit, credit=credit)

    def test_balanced_journal_accepted(self):
        journal = ManualJournalCreate(
            date="2026-01-01T00:00:00Z",
            lines=[self._line(debit=1000.0), self._line(credit=1000.0)],
        )
        assert journal is not None

    def test_unbalanced_journal_rejected(self):
        with pytest.raises(ValidationError, match="does not balance"):
            ManualJournalCreate(
                date="2026-01-01T00:00:00Z",
                lines=[self._line(debit=1000.0), self._line(credit=900.0)],
            )

    def test_single_line_journal_rejected(self):
        with pytest.raises(ValidationError, match="at least two lines"):
            ManualJournalCreate(
                date="2026-01-01T00:00:00Z",
                lines=[self._line(debit=500.0)],
            )

    def test_multi_line_balanced_accepted(self):
        journal = ManualJournalCreate(
            date="2026-01-01T00:00:00Z",
            lines=[
                self._line(debit=600.0),
                self._line(debit=400.0),
                self._line(credit=1000.0),
            ],
        )
        assert len(journal.lines) == 3


# ─────────────────────────────────────────
# calculate_line_items discount round-trips
# ─────────────────────────────────────────

class TestDiscountRoundTrip:
    def test_percent_discount_10_on_1000(self):
        # subtotal from calculate_line_items is after-discount (net amount)
        items = [{"quantity": 1, "unit_price": 1000.0, "discount": 10, "discount_mode": "percent", "tax_rate": 0.0}]
        subtotal, tax, discount_total, total = calculate_line_items(items)
        assert subtotal == 900.0       # after-discount net
        assert discount_total == 100.0
        assert total == 900.0

    def test_amount_discount_50_on_500(self):
        items = [{"quantity": 1, "unit_price": 500.0, "discount": 50, "discount_mode": "amount", "tax_rate": 0.0}]
        subtotal, tax, discount_total, total = calculate_line_items(items)
        assert subtotal == 450.0       # after-discount net
        assert discount_total == 50.0
        assert total == 450.0

    def test_no_double_discount_with_tax(self):
        """Verify total = net_subtotal + tax (no double-deduction of discount)."""
        items = [{"quantity": 1, "unit_price": 1000.0, "discount": 10, "discount_mode": "percent", "tax_rate": 10.0}]
        subtotal, tax, discount_total, total = calculate_line_items(items)
        assert subtotal == 900.0       # after-discount net
        assert discount_total == 100.0
        assert round(tax, 2) == 90.0   # 10% of 900
        assert round(total, 2) == 990.0  # 900 + 90

    def test_zero_quantity_gives_zero_total(self):
        items = [{"quantity": 0, "unit_price": 1000.0, "discount": 0, "discount_mode": "percent", "tax_rate": 0.0}]
        subtotal, tax, discount_total, total = calculate_line_items(items)
        assert total == 0.0

    def test_do_percent_discount_sent_raw_not_computed(self):
        """DO/receipt lines must send raw discount + mode, not a pre-computed RM amount."""
        # discount=10 with mode=percent on unit_price=100 qty=2 → line total=180
        items = [{"quantity": 2, "unit_price": 100.0, "discount": 10, "discount_mode": "percent", "tax_rate": 0.0}]
        subtotal, tax, discount_total, total = calculate_line_items(items)
        assert total == 180.0  # not 200 - 10 = 190 (wrong: treating discount as RM amount)
