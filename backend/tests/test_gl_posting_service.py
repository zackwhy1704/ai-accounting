"""
Unit tests for services/gl_posting.py — assert every document posting builds a
BALANCED entry list (sum debit == sum credit), on both the org-defaults path and
the hardcoded-code fallback path.

These call the real service functions with post_gl / post_gl_by_id monkeypatched
to capture the entry list, so no DB is needed. This guards against the class of
bug where a document's GL legs don't balance (CN-with-discount, PDN tax leg).
"""
import asyncio
import pytest

import app.services.gl_posting as gp


class _Capture:
    """Captures the entries passed to post_gl / post_gl_by_id."""
    def __init__(self):
        self.by_id = None
        self.by_code = None

    async def fake_post_gl_by_id(self, db, org_id, date, desc, ref, source, sid, entries, **kwargs):
        self.by_id = entries
        return object()

    async def fake_post_gl(self, db, org_id, date, desc, ref, source, sid, entries, **kwargs):
        self.by_code = entries
        return object()


def _balanced(entries):
    dr = round(sum(float(e[1]) for e in entries), 2)
    cr = round(sum(float(e[2]) for e in entries), 2)
    return abs(dr - cr) < 0.01, dr, cr


# Org-defaults: all 7 keys present (UUID-ish placeholders)
FULL_DEFAULTS = {
    "ar": "ar", "ap": "ap", "bank": "bank", "revenue": "rev",
    "expense": "exp", "output_tax": "otax", "input_tax": "itax",
}
NO_DEFAULTS: dict = {}


@pytest.fixture
def cap(monkeypatch):
    c = _Capture()
    monkeypatch.setattr(gp, "post_gl_by_id", c.fake_post_gl_by_id.__get__(c))
    monkeypatch.setattr(gp, "post_gl", c.fake_post_gl.__get__(c))
    return c


def _set_defaults(monkeypatch, defaults):
    async def fake_get_defaults(db, org_id):
        return defaults
    monkeypatch.setattr(gp, "get_default_accounts", fake_get_defaults)


# Each case: (service_fn, kwargs builder). subtotal 100, tax 6, total 106.
DOC_CASES = [
    ("post_credit_note_gl", dict(cn_id="x", subtotal=100.0, tax_amount=6.0, total=106.0, issue_date=None, number="CN1")),
    ("post_debit_note_gl", dict(dn_id="x", subtotal=100.0, tax_amount=6.0, total=106.0, issue_date=None, number="DN1")),
    ("post_sale_receipt_gl", dict(receipt_id="x", subtotal=100.0, tax_amount=6.0, total=106.0, receipt_date=None, number="R1")),
    ("post_purchase_credit_note_gl", dict(pcn_id="x", subtotal=100.0, tax_amount=6.0, total=106.0, issue_date=None, number="PCN1")),
    ("post_purchase_debit_note_gl", dict(pdn_id="x", subtotal=100.0, tax_amount=6.0, total=106.0, issue_date=None, number="PDN1")),
]

REFUND_CASES = [
    ("post_sales_refund_gl", dict(refund_id="x", amount=50.0, refund_date=None, number="SR1")),
    ("post_purchase_refund_gl", dict(refund_id="x", amount=50.0, refund_date=None, number="PR1")),
]


@pytest.mark.parametrize("fn_name,kwargs", DOC_CASES)
def test_taxed_document_balances_on_defaults_path(cap, monkeypatch, fn_name, kwargs):
    _set_defaults(monkeypatch, FULL_DEFAULTS)
    fn = getattr(gp, fn_name)
    asyncio.run(fn(None, "org", **kwargs))
    assert cap.by_id is not None, f"{fn_name} did not use the org-defaults (by_id) path"
    assert len(cap.by_id) == 3, f"{fn_name} taxed entry must have 3 legs"
    ok, dr, cr = _balanced(cap.by_id)
    assert ok, f"{fn_name} unbalanced on defaults path: dr={dr} cr={cr}"


@pytest.mark.parametrize("fn_name,kwargs", DOC_CASES)
def test_taxed_document_balances_on_fallback_path(cap, monkeypatch, fn_name, kwargs):
    _set_defaults(monkeypatch, NO_DEFAULTS)
    fn = getattr(gp, fn_name)
    asyncio.run(fn(None, "org", **kwargs))
    assert cap.by_code is not None, f"{fn_name} did not use the code fallback path"
    ok, dr, cr = _balanced(cap.by_code)
    assert ok, f"{fn_name} unbalanced on fallback path: dr={dr} cr={cr}"


@pytest.mark.parametrize("fn_name,kwargs", DOC_CASES)
def test_untaxed_document_two_legs_balanced(cap, monkeypatch, fn_name, kwargs):
    _set_defaults(monkeypatch, FULL_DEFAULTS)
    kwargs = {**kwargs, "tax_amount": 0.0, "total": 100.0}
    fn = getattr(gp, fn_name)
    asyncio.run(fn(None, "org", **kwargs))
    assert len(cap.by_id) == 2
    ok, dr, cr = _balanced(cap.by_id)
    assert ok, f"{fn_name} untaxed unbalanced: dr={dr} cr={cr}"


@pytest.mark.parametrize("fn_name,kwargs", REFUND_CASES)
def test_refund_two_legs_balanced(cap, monkeypatch, fn_name, kwargs):
    _set_defaults(monkeypatch, FULL_DEFAULTS)
    fn = getattr(gp, fn_name)
    asyncio.run(fn(None, "org", **kwargs))
    assert cap.by_id is not None and len(cap.by_id) == 2
    ok, dr, cr = _balanced(cap.by_id)
    assert ok, f"{fn_name} refund unbalanced: dr={dr} cr={cr}"


def test_credit_note_revenue_leg_uses_net_subtotal_not_minus_discount(cap, monkeypatch):
    """Regression: the old CN code posted (subtotal - discount) for the revenue
    leg which double-counted the discount and unbalanced the txn. The service must
    use the NET subtotal directly so DR revenue + tax == CR AR."""
    _set_defaults(monkeypatch, FULL_DEFAULTS)
    # net subtotal 900 (after 10% off 1000), tax 54, total 954
    asyncio.run(gp.post_credit_note_gl(None, "org", issue_date=None, number="CN9",
                                       cn_id="x", subtotal=900.0, tax_amount=54.0, total=954.0))
    revenue_leg = [e for e in cap.by_id if e[0] == "rev"][0]
    assert revenue_leg[1] == 900.0, "revenue debit must equal net subtotal (900), not 800"
    ok, dr, cr = _balanced(cap.by_id)
    assert ok, f"CN with discount must balance: dr={dr} cr={cr}"
