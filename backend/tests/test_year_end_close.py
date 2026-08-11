"""
Year-end close logic — pure-function tests for the fiscal-year-end resolver and
the closing-entry builder (sign conventions + balance invariant).
"""
from datetime import datetime, timezone

from app.api.v1.year_end import build_close_entries, fiscal_year_end_for


class _Org:
    def __init__(self, month=12, day=31):
        self.fiscal_year_end_month = month
        self.fiscal_year_end_day = day


def _dt(y, m, d):
    return datetime(y, m, d, tzinfo=timezone.utc)


def test_fye_calendar_year():
    org = _Org(12, 31)
    assert fiscal_year_end_for(org, _dt(2026, 8, 11)).date().isoformat() == "2025-12-31"
    assert fiscal_year_end_for(org, _dt(2026, 12, 31)).date().isoformat() == "2026-12-31"


def test_fye_mid_year_end():
    org = _Org(6, 30)
    assert fiscal_year_end_for(org, _dt(2026, 8, 11)).date().isoformat() == "2026-06-30"
    assert fiscal_year_end_for(org, _dt(2026, 5, 1)).date().isoformat() == "2025-06-30"


def test_fye_invalid_day_clamped():
    org = _Org(2, 30)  # Feb 30 doesn't exist — clamp to 28
    assert fiscal_year_end_for(org, _dt(2026, 8, 11)).date().isoformat() == "2026-02-28"


def _balanced(entries):
    dr = round(sum(e[1] for e in entries), 2)
    cr = round(sum(e[2] for e in entries), 2)
    return abs(dr - cr) < 0.005


def test_close_profit_credits_retained_earnings():
    # Revenue 4000 has credit balance 10_000 (net -10000); expense 5000 debit 6_000
    balances = [("rev", -10000.0), ("exp", 6000.0)]
    entries, net_income = build_close_entries(balances, "re")
    assert net_income == 4000.0
    assert ("rev", 10000.0, 0.0) in entries      # debit revenue to zero
    assert ("exp", 0.0, 6000.0) in entries       # credit expense to zero
    assert ("re", 0.0, 4000.0) in entries        # profit → credit retained earnings
    assert _balanced(entries)


def test_close_loss_debits_retained_earnings():
    balances = [("rev", -1000.0), ("exp", 2500.0)]
    entries, net_income = build_close_entries(balances, "re")
    assert net_income == -1500.0
    assert ("re", 1500.0, 0.0) in entries        # loss → debit retained earnings
    assert _balanced(entries)


def test_close_breakeven_has_no_re_leg():
    balances = [("rev", -500.0), ("exp", 500.0)]
    entries, net_income = build_close_entries(balances, "re")
    assert net_income == 0.0
    assert all(e[0] != "re" for e in entries)
    assert _balanced(entries)


def test_zero_balance_accounts_skipped():
    entries, _ = build_close_entries([("a", 0.0), ("rev", -100.0)], "re")
    assert all(e[0] != "a" for e in entries)
    assert _balanced(entries)
