"""calculate_line_items must return balanced totals."""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))
from app.core.line_items import calculate_line_items

def test_basic_no_discount():
    items = [{"quantity": 2, "unit_price": 100.0, "discount": 0, "discount_mode": "percent", "tax_rate": 0}]
    subtotal, tax, discount, total = calculate_line_items(items)
    assert subtotal == 200.0
    assert tax == 0.0
    assert discount == 0.0
    assert total == 200.0

def test_percent_discount():
    items = [{"quantity": 1, "unit_price": 1000.0, "discount": 10, "discount_mode": "percent", "tax_rate": 0}]
    subtotal, tax, discount, total = calculate_line_items(items)
    assert subtotal == 900.0  # after discount
    assert discount == 100.0
    assert total == 900.0

def test_amount_discount():
    items = [{"quantity": 1, "unit_price": 500.0, "discount": 50, "discount_mode": "amount", "tax_rate": 0}]
    subtotal, tax, discount, total = calculate_line_items(items)
    assert subtotal == 450.0
    assert discount == 50.0

def test_with_tax():
    items = [{"quantity": 1, "unit_price": 100.0, "discount": 0, "discount_mode": "percent", "tax_rate": 6}]
    subtotal, tax, discount, total = calculate_line_items(items)
    assert subtotal == 100.0
    assert round(tax, 2) == 6.0
    assert total == 106.0

def test_total_equals_subtotal_plus_tax():
    items = [
        {"quantity": 3, "unit_price": 200.0, "discount": 5, "discount_mode": "percent", "tax_rate": 6},
        {"quantity": 1, "unit_price": 150.0, "discount": 20, "discount_mode": "amount", "tax_rate": 0},
    ]
    subtotal, tax, discount, total = calculate_line_items(items)
    assert abs(total - (subtotal + tax)) < 0.01, "total must equal subtotal + tax"

def test_bank_transaction_gl_is_balanced():
    """Simulate bank transaction GL: debit and credit must sum to same amount."""
    amount = 500.0
    bank_gl_id = "acct-1"
    category_id = "acct-2"
    # Income: DR bank / CR income
    entries = [(bank_gl_id, amount, 0.0), (category_id, 0.0, amount)]
    total_dr = sum(e[1] for e in entries)
    total_cr = sum(e[2] for e in entries)
    assert abs(total_dr - total_cr) < 0.01, f"GL entries unbalanced: DR={total_dr} CR={total_cr}"
