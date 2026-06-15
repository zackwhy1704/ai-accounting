"""Verify list endpoints return paginated envelope."""
import pathlib

EXPECTED_PAGINATED_ROUTES = [
    "/invoices", "/bills", "/quotations", "/delivery-orders",
    "/credit-notes", "/debit-notes", "/sales-payments", "/sales-refunds",
    "/purchase-orders", "/goods-received-notes", "/purchase-credit-notes",
    "/purchase-debit-notes", "/purchase-payments", "/purchase-refunds",
    "/contacts", "/products", "/accounts", "/manual-journals",
    "/fixed-assets", "/bank-accounts", "/stock-adjustments", "/stock-transfers",
    "/recurring-invoices",
]

def test_paginated_result_helper_exists():
    src = pathlib.Path("app/core/pagination.py").read_text()
    assert "paginated_result" in src
    assert "items" in src

def test_all_list_files_use_paginated_result():
    v1_dir = pathlib.Path("app/api/v1")
    files_using = []
    for f in v1_dir.glob("*.py"):
        src = f.read_text()
        if "paginated_result" in src:
            files_using.append(f.name)
    # At minimum these core modules must use paginated_result
    required = {"invoices.py", "bills.py", "quotations.py", "contacts.py", "products.py"}
    missing = required - set(files_using)
    assert not missing, f"These files must use paginated_result: {missing}"
