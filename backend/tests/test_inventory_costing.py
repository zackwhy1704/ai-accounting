"""
Perpetual-inventory costing — weighted-average math and the COGS journal
builder. Service DB paths are exercised via monkeypatched posting fakes.
"""
import asyncio

import pytest

import app.services.gl_posting as gp
from app.services.inventory import weighted_avg


# ── Weighted-average math ──────────────────────────────────────────────────────

def test_first_receipt_sets_average():
    assert weighted_avg(0, 0, 10, 5.00) == 5.0


def test_receipt_blends_average():
    # 10 @ 5.00 on hand, receive 10 @ 7.00 -> avg 6.00
    assert weighted_avg(10, 5.00, 10, 7.00) == 6.0


def test_receipt_weighted_not_simple_mean():
    # 30 @ 4.00 on hand, receive 10 @ 8.00 -> (120+80)/40 = 5.00
    assert weighted_avg(30, 4.00, 10, 8.00) == 5.0


def test_negative_on_hand_resets_to_receipt_cost():
    # Oversold stock: next receipt cost becomes the new average
    assert weighted_avg(-5, 4.00, 10, 6.50) == 6.5


def test_zero_receipt_keeps_average():
    assert weighted_avg(10, 5.00, 0, 99.0) == 5.0


def test_average_rounds_4dp():
    assert weighted_avg(3, 1.0, 7, 2.0) == round((3 * 1 + 7 * 2) / 10, 4)


# ── COGS / inventory journal builder ───────────────────────────────────────────

class _Product:
    def __init__(self, exp=None, inv=None):
        self.expense_account_id = exp
        self.inventory_account_id = inv


class _Capture:
    def __init__(self):
        self.entries = None
        self.args = None

    async def fake_post_gl_by_id(self, db, org_id, date, desc, ref, source, sid, entries, **kwargs):
        self.entries = entries
        self.args = (desc, source)
        return object()


@pytest.fixture
def cap(monkeypatch):
    c = _Capture()
    monkeypatch.setattr(gp, "post_gl_by_id", c.fake_post_gl_by_id.__get__(c))

    async def fake_code_id(db, org_id, code):
        return {"5000": "cogs-id", "1300": "inv-id"}.get(code)
    monkeypatch.setattr(gp, "_account_id_by_code", fake_code_id)
    return c


def _balanced(entries):
    dr = round(sum(e[1] for e in entries), 2)
    cr = round(sum(e[2] for e in entries), 2)
    return abs(dr - cr) < 0.005


def test_cogs_out_debits_cogs_credits_inventory(cap):
    issued = [(_Product(), 2, 100.0), (_Product(), 1, 50.0)]
    asyncio.run(gp.post_inventory_gl(
        None, "org", date=None, number="INV1", source="invoice", source_id="x",
        issued=issued, direction="out",
    ))
    assert ("cogs-id", 150.0, 0.0) in cap.entries
    assert ("inv-id", 0.0, 150.0) in cap.entries
    assert _balanced(cap.entries)
    assert cap.args[0].startswith("COGS")


def test_inventory_in_debits_inventory_credits_expense(cap):
    received = [(_Product(), 5, 500.0)]
    asyncio.run(gp.post_inventory_gl(
        None, "org", date=None, number="BILL1", source="bill", source_id="x",
        issued=received, direction="in",
    ))
    assert ("inv-id", 500.0, 0.0) in cap.entries
    assert ("cogs-id", 0.0, 500.0) in cap.entries
    assert _balanced(cap.entries)


def test_product_specific_accounts_grouped(cap):
    issued = [
        (_Product(exp="exp-a", inv="inv-a"), 1, 10.0),
        (_Product(exp="exp-a", inv="inv-a"), 1, 20.0),
        (_Product(), 1, 5.0),  # falls back to 5000/1300
    ]
    asyncio.run(gp.post_inventory_gl(
        None, "org", date=None, number="INV2", source="invoice", source_id="x",
        issued=issued, direction="out",
    ))
    assert ("exp-a", 30.0, 0.0) in cap.entries
    assert ("inv-a", 0.0, 30.0) in cap.entries
    assert ("cogs-id", 5.0, 0.0) in cap.entries
    assert _balanced(cap.entries)


def test_no_resolvable_accounts_skips_posting(cap, monkeypatch):
    async def no_codes(db, org_id, code):
        return None
    monkeypatch.setattr(gp, "_account_id_by_code", no_codes)
    result = asyncio.run(gp.post_inventory_gl(
        None, "org", date=None, number="INV3", source="invoice", source_id="x",
        issued=[(_Product(), 1, 10.0)], direction="out",
    ))
    assert result is None
    assert cap.entries is None


def test_zero_value_lines_ignored(cap):
    result = asyncio.run(gp.post_inventory_gl(
        None, "org", date=None, number="INV4", source="invoice", source_id="x",
        issued=[(_Product(), 1, 0.0)], direction="out",
    ))
    assert result is None
