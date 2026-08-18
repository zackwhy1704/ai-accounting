"""Account-nature classification + per-line GL posting (the 6/8/9 fix)."""
import asyncio

import pytest

import app.services.gl_posting as gp
from app.api.v1.reports._util import account_nature


# ── nature classification ──────────────────────────────────────────────────────

def test_first_digit_convention():
    assert account_nature(None, "1000") == "asset"
    assert account_nature(None, "2100") == "liability"
    assert account_nature(None, "3100") == "equity"
    assert account_nature(None, "4000") == "revenue"
    assert account_nature(None, "5000") == "cost_of_sales"
    assert account_nature(None, "6100") == "expense"
    assert account_nature(None, "8100") == "other_income"
    assert account_nature(None, "9200") == "other_expense"


def test_type_wins_for_balance_sheet_natures():
    assert account_nature("asset", "9000") == "asset"       # explicit BS type is never re-bucketed
    assert account_nature("liability", "1000") == "liability"


def test_digit_refines_generic_pl_types_within_side():
    assert account_nature("expense", "5100") == "cost_of_sales"
    assert account_nature("expense", "9100") == "other_expense"
    assert account_nature("revenue", "8100") == "other_income"
    assert account_nature("expense", "8100") == "expense"   # never flips expense → income
    assert account_nature("revenue", "5100") == "revenue"   # never flips income → expense


def test_unknown_type_and_code_defaults_to_expense():
    assert account_nature("mystery", "X9") == "expense"


# ── per-line posting legs ──────────────────────────────────────────────────────

class _Capture:
    def __init__(self):
        self.entries = None

    async def fake_post_gl_by_id(self, db, org_id, date, desc, ref, source, sid, entries, **kwargs):
        self.entries = entries
        return object()


@pytest.fixture
def cap(monkeypatch):
    c = _Capture()
    monkeypatch.setattr(gp, "post_gl_by_id", c.fake_post_gl_by_id.__get__(c))

    async def fake_defaults(db, org_id):
        return {"ar": "ar", "ap": "ap", "revenue": "rev", "expense": "exp",
                "output_tax": "otax", "input_tax": "itax", "bank": "bank"}
    monkeypatch.setattr(gp, "get_default_accounts", fake_defaults)
    return c


def _balanced(entries):
    dr = round(sum(e[1] for e in entries), 2)
    cr = round(sum(e[2] for e in entries), 2)
    return abs(dr - cr) < 0.005


def test_invoice_posts_to_each_lines_account(cap):
    # Two lines on custom accounts (a 6xxx expense-recovery and an 8xxx other
    # income), one line with no account → default revenue.
    asyncio.run(gp.post_invoice_gl(
        None, "org", issue_date=None, number="INV1", invoice_id="x",
        subtotal=300.0, tax_amount=18.0, total=318.0,
        lines=[("acct-8100", 100.0), ("acct-6100", 100.0), (None, 100.0)],
    ))
    e = cap.entries
    assert ("ar", 318.0, 0.0) in e
    assert ("acct-8100", 0.0, 100.0) in e
    assert ("acct-6100", 0.0, 100.0) in e
    assert ("rev", 0.0, 100.0) in e
    assert ("otax", 0.0, 18.0) in e
    assert _balanced(e)


def test_bill_posts_to_each_lines_account(cap):
    asyncio.run(gp.post_bill_gl(
        None, "org", issue_date=None, number="B1", bill_id="x",
        subtotal=200.0, tax_amount=12.0, total=212.0,
        lines=[("acct-9100", 150.0), (None, 50.0)],
    ))
    e = cap.entries
    assert ("ap", 0.0, 212.0) in e
    assert ("acct-9100", 150.0, 0.0) in e
    assert ("exp", 50.0, 0.0) in e
    assert ("itax", 12.0, 0.0) in e
    assert _balanced(e)


def test_lines_same_account_grouped(cap):
    asyncio.run(gp.post_invoice_gl(
        None, "org", issue_date=None, number="INV2", invoice_id="x",
        subtotal=200.0, tax_amount=0.0, total=200.0,
        lines=[("a1", 120.0), ("a1", 80.0)],
    ))
    assert ("a1", 0.0, 200.0) in cap.entries
    assert len(cap.entries) == 2  # AR + one grouped leg
    assert _balanced(cap.entries)


def test_fx_rounding_absorbed_no_tax(cap):
    # Awkward rate, no tax: rounding residual folds into the last line leg
    asyncio.run(gp.post_invoice_gl(
        None, "org", issue_date=None, number="INV3", invoice_id="x",
        subtotal=100.0, tax_amount=0.0, total=100.0, rate=4.4567,
        lines=[("a1", 33.33), ("a2", 33.33), ("a3", 33.34)],
    ))
    assert _balanced(cap.entries)


def test_fx_rounding_absorbed_by_tax_leg(cap):
    asyncio.run(gp.post_bill_gl(
        None, "org", issue_date=None, number="B2", bill_id="x",
        subtotal=100.0, tax_amount=6.0, total=106.0, rate=3.7777,
        lines=[("a1", 60.0), ("a2", 40.0)],
    ))
    assert _balanced(cap.entries)


def test_credit_note_lines_reverse_side(cap):
    asyncio.run(gp.post_credit_note_gl(
        None, "org", issue_date=None, number="CN1", cn_id="x",
        subtotal=100.0, tax_amount=6.0, total=106.0,
        lines=[("acct-4000", 100.0)],
    ))
    e = cap.entries
    assert ("ar", 0.0, 106.0) in e
    assert ("acct-4000", 100.0, 0.0) in e   # DR revenue (reversal)
    assert _balanced(e)


def test_no_lines_falls_back_to_legacy_single_leg(cap):
    asyncio.run(gp.post_invoice_gl(
        None, "org", issue_date=None, number="INV4", invoice_id="x",
        subtotal=100.0, tax_amount=6.0, total=106.0,
    ))
    assert ("rev", 0.0, 100.0) in cap.entries
    assert _balanced(cap.entries)
