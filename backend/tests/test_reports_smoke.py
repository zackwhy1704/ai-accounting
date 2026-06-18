"""Smoke test: every report + bank-reconciliation READ endpoint must return 200
with its documented top-level keys, against a freshly-seeded org.

This is the regression guard for the whole class of "ERROR LOADING DATA" /
"Something went wrong loading data" bugs:
  - a missing migration (bank_statement_lines / reconciliation_rules did not
    exist -> 500 UndefinedTableError),
  - an AttributeError in a report query (Bill.bill_date),
  - a frontend<->backend key contract drift (creditor-ledger 'vendors',
    summary 'total_lines').

If any of these endpoints 500s or drops a key the frontend reads, this test
fails before it ever ships.
"""
import pytest

pytestmark = pytest.mark.asyncio

FROM = "2026-01-01"
TO = "2026-12-31"

# (path, required-query-params, expected top-level keys the frontend reads)
REPORT_CASES = [
    (f"/reports/profit-loss?start_date={FROM}&end_date={TO}", {"sections", "net_income"}),
    (f"/reports/balance-sheet?as_of_date={TO}", {"assets", "liabilities", "equity", "is_balanced"}),
    (f"/reports/trial-balance?as_of_date={TO}", {"lines", "totals", "is_balanced"}),
    (f"/reports/cash-flow?start_date={FROM}&end_date={TO}", {"cash_inflows", "cash_outflows", "net_change"}),
    (f"/reports/general-ledger?from_date={FROM}&to_date={TO}", {"accounts"}),
    (f"/reports/transaction-list?start_date={FROM}&end_date={TO}", {"transactions", "total_debit", "total_credit"}),
    (f"/reports/debtor-ledger?start_date={FROM}&end_date={TO}", {"customers", "grand_total_balance"}),
    (f"/reports/creditor-ledger?start_date={FROM}&end_date={TO}", {"vendors", "grand_total_balance"}),
    ("/reports/ar-aging", {"buckets", "summary", "grand_total"}),
    ("/reports/ap-aging", {"buckets", "summary", "grand_total"}),
    (f"/reports/invoice-summary?start_date={FROM}&end_date={TO}", {"items"}),
    (f"/reports/bill-summary?start_date={FROM}&end_date={TO}", {"items"}),
    (f"/reports/payment-summary?start_date={FROM}&end_date={TO}", {"items", "total"}),
    (f"/reports/inventory-summary?start_date={FROM}&end_date={TO}", {"items"}),
    (f"/reports/sst-02?from_date={FROM}&to_date=2026-03-31", {"taxable_items", "net_tax_payable"}),
    (f"/reports/sst-sales-detail?start_date={FROM}&end_date={TO}", {"items", "total_tax", "total_taxable"}),
    (f"/reports/sst-purchase-detail?start_date={FROM}&end_date={TO}", {"items", "total_tax", "total_taxable"}),
]

BANK_REC_CASES = [
    ("/bank-reconciliation/lines", None),                                  # bare list
    ("/bank-reconciliation/summary", {"total_lines", "matched", "reconciled", "unmatched"}),
]


@pytest.mark.parametrize("path, keys", REPORT_CASES)
async def test_report_endpoint_200_and_shape(client, path, keys):
    r = await client.get(path)
    assert r.status_code == 200, f"{path} -> {r.status_code}: {r.text[:300]}"
    body = r.json()
    assert isinstance(body, dict), f"{path} did not return an object"
    missing = keys - set(body.keys())
    assert not missing, f"{path} missing keys the frontend reads: {missing} (got {sorted(body.keys())})"


@pytest.mark.parametrize("path, keys", BANK_REC_CASES)
async def test_bank_reconciliation_endpoint_200_and_shape(client, path, keys):
    r = await client.get(path)
    assert r.status_code == 200, f"{path} -> {r.status_code}: {r.text[:300]}"
    body = r.json()
    if keys is None:
        assert isinstance(body, list), f"{path} should return a bare array"
    else:
        missing = keys - set(body.keys())
        assert not missing, f"{path} missing keys the frontend reads: {missing} (got {sorted(body.keys())})"


async def test_report_bad_date_returns_400_not_500(client):
    """Malformed date must be a 400, never a 500 (the date-parse guard)."""
    r = await client.get(f"/reports/general-ledger?from_date=NOTADATE&to_date={TO}")
    assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text[:200]}"
