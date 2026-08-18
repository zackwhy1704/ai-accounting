"""Standard Malaysian chart fixture — integrity + nature consistency."""
from app.api.v1.reports._util import account_nature
from app.core.standard_chart_my import STANDARD_CHART_MY


def test_chart_size_and_unique_codes():
    codes = [c for c, _, _, _ in STANDARD_CHART_MY]
    assert len(codes) == 214
    assert len(set(codes)) == 214


def test_eight_top_level_headers():
    headers = [(c, n) for c, n, _, r in STANDARD_CHART_MY if r == "header"]
    assert len(headers) == 8
    assert {c for c, _ in headers} == {"10000", "20000", "30000", "40000", "50000", "60000", "80000", "90000"}


def test_types_follow_first_digit():
    expected = {"1": "asset", "2": "liability", "3": "equity", "4": "revenue",
                "5": "cost_of_sales", "6": "expense", "8": "other_income", "9": "other_expense"}
    for code, _name, acct_type, _role in STANDARD_CHART_MY:
        assert acct_type == expected[code[0]], f"{code} typed {acct_type}"


def test_nature_classifier_agrees_with_chart():
    for code, _name, acct_type, role in STANDARD_CHART_MY:
        if role != "account":
            continue  # headers are not postable/classified
        nature = account_nature(acct_type, code)
        assert nature == acct_type, f"{code}: nature {nature} != type {acct_type}"


def test_key_accounts_present():
    by_code = {c: (n, t, r) for c, n, t, r in STANDARD_CHART_MY}
    assert by_code["32100"][0] == "Retained Earnings"
    assert by_code["32100"][2] == "account"           # postable, not a header
    assert by_code["12310"][1] == "asset"             # Trade Receivables
    assert by_code["21110"][1] == "liability"         # Trade Payables
    assert by_code["81200"][1] == "other_income"      # Forex - Realised
    assert by_code["91500"][1] == "other_expense"     # Other Bank Charges
    assert by_code["51200"][1] == "cost_of_sales"     # Purchases
