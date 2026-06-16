"""
Recurrence guard for the paginated-envelope bug class.

Backend list endpoints return {items,total,page,limit,pages}. A frontend page that
does `api.get("/<list-endpoint>").then(r => r.data)` and treats the result as a
bare array silently breaks at runtime (calls .map/.filter on the envelope object),
and tsc can't catch it because api.get is untyped.

This test scans the frontend for raw api.get calls to KNOWN list-envelope endpoints
that don't normalize (no `.items` and no `Array.isArray`). It fails with the exact
file:line so the bug can't ship again. The correct pattern is either a normalizing
hook or `r => Array.isArray(r.data) ? r.data : (r.data.items ?? [])`.
"""
import re
import pathlib
import pytest

# Endpoints whose GET-list returns a paginated envelope (return paginated_result).
ENVELOPE_ENDPOINTS = [
    "/custom-fields", "/invoice-templates", "/accounts", "/contact-groups",
    "/products", "/contacts", "/invoices", "/bills", "/quotations",
    "/credit-notes", "/debit-notes", "/delivery-orders", "/purchase-orders",
    "/goods-received-notes", "/purchase-credit-notes", "/purchase-debit-notes",
    "/sales-payments", "/purchase-payments", "/sales-refunds", "/purchase-refunds",
    "/sale-receipts", "/recurring-invoices", "/manual-journals", "/tax-rates",
    "/exchange-rates", "/fixed-assets", "/bank-accounts", "/bank-transactions",
    "/stock-adjustments", "/stock-transfers",
]

FRONTEND_PAGES = pathlib.Path(__file__).resolve().parents[2] / "frontend" / "src" / "pages"

# Matches:  api.get("/accounts" ...).then(r => r.data)  with no normalization on that line
RAW_GET = re.compile(r'api\.get\(\s*[`"\']([^`"\']+)[`"\']')


@pytest.mark.skipif(not FRONTEND_PAGES.exists(), reason="frontend not present")
def test_no_raw_envelope_consumers():
    violations = []
    for tsx in FRONTEND_PAGES.rglob("*.tsx"):
        text = tsx.read_text(encoding="utf-8", errors="ignore")
        for i, line in enumerate(text.splitlines(), 1):
            if ".then(r => r.data)" not in line:
                continue
            if "Array.isArray" in line or ".items" in line:
                continue  # normalized — fine
            m = RAW_GET.search(line)
            if not m:
                continue
            url = m.group(1)
            path = url.split("?")[0]
            if path in ENVELOPE_ENDPOINTS:
                violations.append(f"{tsx.relative_to(FRONTEND_PAGES.parent.parent)}:{i}  ->  api.get('{url}') not normalized")
    assert not violations, (
        "Raw api.get on a paginated-envelope endpoint without .items normalization "
        "(would break at runtime):\n  " + "\n  ".join(violations)
    )
