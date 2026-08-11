"""
FX-1 wiring tests — multi-currency documents convert GL legs to base currency
and payments post realised FX gain/loss to 5900.

Same monkeypatch style as test_gl_posting_service.py: post_gl / post_gl_by_id
are captured so no DB is needed.
"""
import asyncio
import pytest

import app.services.gl_posting as gp
from app.services.fx import convert_doc_amounts, to_base, realised_fx_gain_loss


class _Capture:
    def __init__(self):
        self.by_id = None
        self.by_code = None

    async def fake_post_gl_by_id(self, db, org_id, date, desc, ref, source, sid, entries):
        self.by_id = entries
        return object()

    async def fake_post_gl(self, db, org_id, date, desc, ref, source, sid, entries):
        self.by_code = entries
        return object()


def _balanced(entries):
    dr = round(sum(float(e[1]) for e in entries), 2)
    cr = round(sum(float(e[2]) for e in entries), 2)
    return abs(dr - cr) < 0.005, dr, cr


FULL_DEFAULTS = {
    "ar": "ar", "ap": "ap", "bank": "bank", "revenue": "rev",
    "expense": "exp", "output_tax": "otax", "input_tax": "itax",
}


@pytest.fixture
def cap(monkeypatch):
    c = _Capture()
    monkeypatch.setattr(gp, "post_gl_by_id", c.fake_post_gl_by_id.__get__(c))
    monkeypatch.setattr(gp, "post_gl", c.fake_post_gl.__get__(c))

    async def fake_get_defaults(db, org_id):
        return FULL_DEFAULTS
    monkeypatch.setattr(gp, "get_default_accounts", fake_get_defaults)
    return c


def _with_fx_account(monkeypatch, account_id):
    async def fake_fx_account(db, org_id):
        return account_id
    monkeypatch.setattr(gp, "_fx_account_id", fake_fx_account)


# ── convert_doc_amounts invariants ─────────────────────────────────────────────

@pytest.mark.parametrize("subtotal,tax,total,rate", [
    (100.0, 6.0, 106.0, 4.4567),   # awkward rate forces per-leg rounding
    (33.33, 2.0, 35.33, 3.141592),
    (0.01, 0.01, 0.02, 4.75),
    (100.0, 6.0, 106.0, 1.0),
    (999999.99, 60000.0, 1059999.99, 0.2231),
])
def test_convert_doc_amounts_always_balances(subtotal, tax, total, rate):
    sub_b, tax_b, total_b = convert_doc_amounts(subtotal, tax, total, rate)
    assert round(sub_b + tax_b, 2) == total_b


def test_convert_doc_amounts_no_tax_uses_total():
    sub_b, tax_b, total_b = convert_doc_amounts(100.0, 0.0, 100.0, 4.5)
    assert (sub_b, tax_b, total_b) == (450.0, 0.0, 450.0)


def test_convert_doc_amounts_rate_one_is_identity():
    assert convert_doc_amounts(100.0, 6.0, 106.0, 1.0) == (100.0, 6.0, 106.0)


# ── Document postings convert to base currency ────────────────────────────────

def test_invoice_gl_converts_at_rate_and_balances(cap):
    asyncio.run(gp.post_invoice_gl(
        None, "org", issue_date=None, number="INV1", invoice_id="x",
        subtotal=100.0, tax_amount=6.0, total=106.0, rate=4.4567,
    ))
    entries = cap.by_id
    assert entries is not None
    ok, dr, cr = _balanced(entries)
    assert ok, f"unbalanced: dr={dr} cr={cr}"
    # AR leg is total x rate, rounded
    assert entries[0] == ("ar", to_base(106.0, 4.4567), 0.0)


def test_bill_gl_converts_at_rate_and_balances(cap):
    asyncio.run(gp.post_bill_gl(
        None, "org", issue_date=None, number="B1", bill_id="x",
        subtotal=100.0, tax_amount=6.0, total=106.0, rate=3.7,
    ))
    ok, dr, cr = _balanced(cap.by_id)
    assert ok, f"unbalanced: dr={dr} cr={cr}"
    ap_leg = [e for e in cap.by_id if e[0] == "ap"][0]
    assert ap_leg[2] == to_base(106.0, 3.7)


def test_refund_gl_converts_amount(cap):
    asyncio.run(gp.post_sales_refund_gl(
        None, "org", refund_date=None, number="SR1", refund_id="x",
        amount=50.0, rate=4.5,
    ))
    assert cap.by_id == [("ar", 225.0, 0.0), ("bank", 0.0, 225.0)]


# ── Realised FX on payments ───────────────────────────────────────────────────

def test_sales_payment_fx_gain_credits_5900(cap, monkeypatch):
    _with_fx_account(monkeypatch, "fx")
    # USD 100 invoice booked at 4.40 (AR 440); paid when rate is 4.50 (bank 450)
    asyncio.run(gp.post_sales_payment_gl(
        None, "org", payment_date=None, number="P1", payment_id="x",
        amount=100.0, rate=4.50, cleared_base=440.0,
    ))
    entries = cap.by_id
    assert ("bank", 450.0, 0.0) in entries
    assert ("ar", 0.0, 440.0) in entries
    assert ("fx", 0.0, 10.0) in entries  # gain -> credit 5900
    ok, dr, cr = _balanced(entries)
    assert ok, f"unbalanced: dr={dr} cr={cr}"


def test_sales_payment_fx_loss_debits_5900(cap, monkeypatch):
    _with_fx_account(monkeypatch, "fx")
    # booked at 4.60 (AR 460); paid at 4.50 (bank 450) -> loss 10
    asyncio.run(gp.post_sales_payment_gl(
        None, "org", payment_date=None, number="P2", payment_id="x",
        amount=100.0, rate=4.50, cleared_base=460.0,
    ))
    assert ("fx", 10.0, 0.0) in cap.by_id
    ok, dr, cr = _balanced(cap.by_id)
    assert ok


def test_purchase_payment_fx_gain_credits_5900(cap, monkeypatch):
    _with_fx_account(monkeypatch, "fx")
    # bill booked at 4.60 (AP 460); settled at 4.50 (bank 450) -> pay less base = gain
    asyncio.run(gp.post_purchase_payment_gl(
        None, "org", payment_date=None, number="PP1", payment_id="x",
        amount=100.0, rate=4.50, cleared_base=460.0,
    ))
    entries = cap.by_id
    assert ("ap", 460.0, 0.0) in entries
    assert ("bank", 0.0, 450.0) in entries
    assert ("fx", 0.0, 10.0) in entries
    ok, dr, cr = _balanced(entries)
    assert ok


def test_purchase_payment_fx_loss_debits_5900(cap, monkeypatch):
    _with_fx_account(monkeypatch, "fx")
    asyncio.run(gp.post_purchase_payment_gl(
        None, "org", payment_date=None, number="PP2", payment_id="x",
        amount=100.0, rate=4.60, cleared_base=450.0,
    ))
    assert ("fx", 10.0, 0.0) in cap.by_id
    ok, dr, cr = _balanced(cap.by_id)
    assert ok


def test_payment_without_5900_account_stays_balanced(cap, monkeypatch):
    # No 5900 in the chart: AR clears at the bank value (pre-FX behaviour), 2 legs
    _with_fx_account(monkeypatch, None)
    asyncio.run(gp.post_sales_payment_gl(
        None, "org", payment_date=None, number="P3", payment_id="x",
        amount=100.0, rate=4.50, cleared_base=440.0,
    ))
    assert cap.by_id == [("bank", 450.0, 0.0), ("ar", 0.0, 450.0)]


def test_same_currency_payment_has_no_fx_leg(cap):
    asyncio.run(gp.post_sales_payment_gl(
        None, "org", payment_date=None, number="P4", payment_id="x",
        amount=100.0, rate=1.0, cleared_base=100.0,
    ))
    assert cap.by_id == [("bank", 100.0, 0.0), ("ar", 0.0, 100.0)]


def test_realised_fx_helper_signs():
    assert realised_fx_gain_loss(100.0, 4.40, 4.50) == 10.0   # gain
    assert realised_fx_gain_loss(100.0, 4.60, 4.50) == -10.0  # loss
