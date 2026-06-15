"""
Unit tests for app.services.pricing — the consolidated discount/tax/total math
extracted from invoices.py and bills.py during the Phase 4 refactor.

These pin the behavior so future migrations of the other routers
(sales.py, purchase_orders.py, etc.) onto this service can't drift.
"""
import pytest

from app.services import pricing


class TestLineTotal:
    def test_goods_line_is_qty_times_price(self):
        assert pricing.line_total(3, 20.0) == 60.0

    def test_zero_quantity(self):
        assert pricing.line_total(0, 100.0) == 0.0


class TestLineDiscountAmount:
    def test_percent_mode(self):
        # 10% of 100 = 10
        assert pricing.line_discount_amount(10, "percent", 100.0) == 10.0

    def test_amount_mode(self):
        # flat 25 off
        assert pricing.line_discount_amount(25, "amount", 100.0) == 25.0

    def test_amount_mode_clamps_to_line_total(self):
        # MYR800 flat discount on a 500 line cannot exceed 500
        assert pricing.line_discount_amount(800, "amount", 500.0) == 500.0

    def test_unknown_mode_defaults_to_percent(self):
        # anything that isn't "amount" is treated as percent
        assert pricing.line_discount_amount(10, "percent", 200.0) == 20.0


class TestLineAfterDiscount:
    def test_percent(self):
        # 3 x 20 = 60, less 10% = 54
        assert pricing.line_after_discount(3, 20.0, 10, "percent") == 54.0

    def test_amount_clamped_to_zero(self):
        # gross 500, flat 800 -> clamps so after-discount is exactly 0
        assert pricing.line_after_discount(5, 100.0, 800, "amount") == 0.0


class TestLineTax:
    def test_basic(self):
        # 6% SST on 90 = 5.40
        assert pricing.line_tax(90.0, 6) == pytest.approx(5.4)

    def test_zero_rate(self):
        assert pricing.line_tax(100.0, 0) == 0.0


class TestComputeTotals:
    def test_matches_grn_scenario_no_discount(self):
        # mirrors test_grn_gl_flow delivery_note_1: 3 lines, SST 6%
        items = [
            {"quantity": 1, "unit_price": 600.0, "discount": 0, "discount_mode": "percent", "tax_rate": 6},
            {"quantity": 2, "unit_price": 45.0, "discount": 0, "discount_mode": "percent", "tax_rate": 6},
            {"quantity": 3, "unit_price": 20.0, "discount": 0, "discount_mode": "percent", "tax_rate": 6},
        ]
        subtotal, tax, total = pricing.compute_totals(items)
        assert subtotal == pytest.approx(750.0)
        assert tax == pytest.approx(45.0)
        assert total == pytest.approx(795.0)

    def test_with_flat_amount_discount(self):
        # one line: 1000 gross, MYR200 flat off -> 800 subtotal, 6% tax = 48
        items = [
            {"quantity": 1, "unit_price": 1000.0, "discount": 200, "discount_mode": "amount", "tax_rate": 6},
        ]
        subtotal, tax, total = pricing.compute_totals(items)
        assert subtotal == pytest.approx(800.0)
        assert tax == pytest.approx(48.0)
        assert total == pytest.approx(848.0)
