"""Phase 4B — canonical calculate_line_items() dict utility."""
import pytest
from app.core.line_items import calculate_line_items


def test_single_line_percent_discount():
    items = [{"quantity": 3, "unit_price": 20, "discount": 10, "discount_mode": "percent", "tax_rate": 6}]
    sub, tax, disc, total = calculate_line_items(items)
    assert sub == 54.0
    assert round(tax, 2) == 3.24
    assert disc == 6.0
    assert round(total, 2) == 57.24
    assert items[0]["amount"] == 54.0  # mutated in place


def test_flat_amount_discount_clamped():
    items = [{"quantity": 1, "unit_price": 500, "discount": 800, "discount_mode": "amount", "tax_rate": 0}]
    sub, tax, disc, total = calculate_line_items(items)
    assert sub == 0.0 and disc == 500.0 and total == 0.0


def test_multi_line_sum():
    items = [
        {"quantity": 1, "unit_price": 600, "discount": 0, "discount_mode": "percent", "tax_rate": 6},
        {"quantity": 2, "unit_price": 45, "discount": 0, "discount_mode": "percent", "tax_rate": 6},
        {"quantity": 3, "unit_price": 20, "discount": 0, "discount_mode": "percent", "tax_rate": 6},
    ]
    sub, tax, disc, total = calculate_line_items(items)
    assert sub == 750.0 and tax == 45.0 and total == 795.0


def test_missing_fields_default_safely():
    sub, tax, disc, total = calculate_line_items([{"unit_price": 100}])
    # qty defaults to 1, no discount, no tax
    assert sub == 100.0 and tax == 0.0 and total == 100.0
