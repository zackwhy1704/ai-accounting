"""
H5: GL integration tests.

Tests _assert_balanced from gl_helpers (the core double-entry guard) and
calculate_line_items from app.core.line_items (the canonical total calculator).

NOTE: test_gl_balance.py already has comprehensive _assert_balanced tests
(balanced, unbalanced, rounding tolerance, multi-entry). This file extends
coverage with additional edge cases and focuses on the calculate_line_items
function with the correct field names (quantity, unit_price, discount_mode).
"""
import pytest
from fastapi import HTTPException
from app.api.v1.gl_helpers import _assert_balanced
from app.core.line_items import calculate_line_items


# ── _assert_balanced: additional edge cases ───────────────────────────────────

class _Acct:
    pass


def _entries(*pairs):
    return [(_Acct(), d, c) for d, c in pairs]


class TestAssertBalancedEdgeCases:
    def test_zero_amount_journal_passes(self):
        """A fully-zero journal (e.g. reversed entry) should still pass."""
        _assert_balanced(_entries((0.0, 0.0), (0.0, 0.0)))  # no raise

    def test_single_entry_that_is_zero_passes(self):
        _assert_balanced(_entries((0.0, 0.0)))

    def test_large_balanced_amount_passes(self):
        _assert_balanced(_entries((1_000_000.00, 0.0), (0.0, 1_000_000.00)))

    def test_large_unbalanced_raises(self):
        with pytest.raises(HTTPException) as exc:
            _assert_balanced(_entries((1_000_000.00, 0.0), (0.0, 999_999.00)))
        assert exc.value.status_code == 400

    def test_sub_cent_within_tolerance_passes(self):
        """0.005 difference is within the 0.01 tolerance."""
        _assert_balanced(_entries((100.005, 0.0), (0.0, 100.00)))

    def test_exactly_at_tolerance_boundary_raises(self):
        """0.01 difference raises due to floating-point representation — abs diff ends up > 0.01."""
        # The guard uses > 0.01; 100.01 - 100.00 in float is 0.010000000000005116 which IS > 0.01
        with pytest.raises(HTTPException) as exc:
            _assert_balanced(_entries((100.01, 0.0), (0.0, 100.00)))
        assert exc.value.status_code == 400

    def test_just_over_tolerance_raises(self):
        """0.02 difference is beyond the 0.01 tolerance."""
        with pytest.raises(HTTPException) as exc:
            _assert_balanced(_entries((100.02, 0.0), (0.0, 100.00)))
        assert exc.value.status_code == 400

    def test_detail_message_mentions_balance(self):
        with pytest.raises(HTTPException) as exc:
            _assert_balanced(_entries((100.0, 0.0), (0.0, 50.0)))
        assert "balance" in exc.value.detail.lower() or "debit" in exc.value.detail.lower()

    def test_three_leg_balanced(self):
        """Three-leg entry: Dr AR 106, Cr Revenue 100, Cr Tax 6."""
        _assert_balanced(_entries((106.0, 0.0), (0.0, 100.0), (0.0, 6.0)))

    def test_three_leg_unbalanced_raises(self):
        with pytest.raises(HTTPException):
            _assert_balanced(_entries((106.0, 0.0), (0.0, 100.0), (0.0, 5.0)))

    def test_split_debit_balanced(self):
        """Split debit: two Dr entries totalling the same as one Cr."""
        _assert_balanced(_entries((50.0, 0.0), (50.0, 0.0), (0.0, 100.0)))


# ── calculate_line_items: basic and edge cases ────────────────────────────────

class TestCalculateLineItems:
    def test_basic_calculation_no_tax_no_discount(self):
        items = [{"quantity": 2, "unit_price": 50.0, "tax_rate": 0.0, "discount": 0.0, "discount_mode": "percent"}]
        subtotal, tax, discount, total = calculate_line_items(items)
        assert subtotal == 100.0
        assert tax == 0.0
        assert discount == 0.0
        assert total == 100.0

    def test_with_tax(self):
        items = [{"quantity": 1, "unit_price": 100.0, "tax_rate": 10.0, "discount": 0.0, "discount_mode": "percent"}]
        subtotal, tax, discount, total = calculate_line_items(items)
        assert tax == 10.0
        assert total == 110.0

    def test_with_percent_discount(self):
        items = [{"quantity": 1, "unit_price": 200.0, "tax_rate": 0.0, "discount": 25.0, "discount_mode": "percent"}]
        subtotal, tax, discount, total = calculate_line_items(items)
        assert discount == 50.0
        assert subtotal == 150.0
        assert total == 150.0

    def test_with_amount_discount(self):
        items = [{"quantity": 1, "unit_price": 200.0, "tax_rate": 0.0, "discount": 30.0, "discount_mode": "amount"}]
        subtotal, tax, discount, total = calculate_line_items(items)
        assert discount == 30.0
        assert subtotal == 170.0
        assert total == 170.0

    def test_amount_discount_clamped_to_gross(self):
        """Discount amount larger than the line total should be clamped to zero net."""
        items = [{"quantity": 1, "unit_price": 100.0, "tax_rate": 0.0, "discount": 500.0, "discount_mode": "amount"}]
        subtotal, tax, discount, total = calculate_line_items(items)
        assert subtotal == 0.0
        assert total == 0.0

    def test_multi_line_sum(self):
        items = [
            {"quantity": 2, "unit_price": 100.0, "tax_rate": 0.0, "discount": 0.0, "discount_mode": "percent"},
            {"quantity": 3, "unit_price": 50.0, "tax_rate": 0.0, "discount": 0.0, "discount_mode": "percent"},
        ]
        subtotal, tax, discount, total = calculate_line_items(items)
        assert subtotal == 350.0
        assert total == 350.0

    def test_multi_line_with_tax(self):
        items = [
            {"quantity": 1, "unit_price": 100.0, "tax_rate": 6.0, "discount": 0.0, "discount_mode": "percent"},
            {"quantity": 1, "unit_price": 200.0, "tax_rate": 6.0, "discount": 0.0, "discount_mode": "percent"},
        ]
        subtotal, tax, discount, total = calculate_line_items(items)
        assert subtotal == 300.0
        assert round(tax, 2) == 18.0
        assert round(total, 2) == 318.0

    def test_amount_mutated_in_place(self):
        """calculate_line_items mutates item['amount'] to after-discount, pre-tax."""
        item = {"quantity": 1, "unit_price": 100.0, "tax_rate": 10.0, "discount": 20.0, "discount_mode": "percent"}
        calculate_line_items([item])
        assert item["amount"] == 80.0  # after 20% discount, before tax

    def test_zero_quantity_line(self):
        items = [{"quantity": 0, "unit_price": 100.0, "tax_rate": 10.0, "discount": 0.0, "discount_mode": "percent"}]
        subtotal, tax, discount, total = calculate_line_items(items)
        assert subtotal == 0.0 and total == 0.0

    def test_empty_items_list(self):
        subtotal, tax, discount, total = calculate_line_items([])
        assert subtotal == 0.0 and tax == 0.0 and discount == 0.0 and total == 0.0

    def test_missing_fields_default_safely(self):
        """Partial dicts (missing quantity, discount etc.) should not crash."""
        subtotal, tax, discount, total = calculate_line_items([{"unit_price": 100.0}])
        assert subtotal == 100.0
        assert tax == 0.0
        assert total == 100.0

    def test_returns_four_tuple(self):
        result = calculate_line_items([])
        assert len(result) == 4

    def test_discount_and_tax_combined(self):
        """10% discount then 10% tax on the remainder."""
        items = [{"quantity": 1, "unit_price": 100.0, "tax_rate": 10.0, "discount": 10.0, "discount_mode": "percent"}]
        subtotal, tax, discount, total = calculate_line_items(items)
        assert subtotal == 90.0
        assert round(tax, 2) == 9.0
        assert round(total, 2) == 99.0
