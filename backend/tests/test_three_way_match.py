"""3-way match line pairing + variance detection (pure matcher)."""
from app.api.v1.three_way_match import match_lines


class _L:
    def __init__(self, description="Widget", quantity=0, unit_price=0.0,
                 quantity_received=0, product_id=None, uom_factor=1):
        self.description = description
        self.quantity = quantity
        self.unit_price = unit_price
        self.quantity_received = quantity_received
        self.product_id = product_id
        self.uom_factor = uom_factor


def test_fully_matched():
    po = [_L(quantity=10, unit_price=5.0)]
    grn = [_L(quantity_received=10)]
    bill = [_L(quantity=10, unit_price=5.0)]
    rows = match_lines(po, grn, bill)
    assert len(rows) == 1
    assert rows[0]["matched"] is True
    assert rows[0]["issues"] == []


def test_billed_more_than_received():
    rows = match_lines(
        [_L(quantity=10, unit_price=5.0)],
        [_L(quantity_received=6)],
        [_L(quantity=10, unit_price=5.0)],
    )
    assert "billed_more_than_received" in rows[0]["issues"]


def test_price_mismatch():
    rows = match_lines(
        [_L(quantity=10, unit_price=5.0)],
        [_L(quantity_received=10)],
        [_L(quantity=10, unit_price=6.5)],
    )
    assert "price_mismatch" in rows[0]["issues"]
    assert rows[0]["price_variance"] == 1.5


def test_billed_more_than_ordered():
    rows = match_lines(
        [_L(quantity=10, unit_price=5.0)], [],
        [_L(quantity=12, unit_price=5.0)],
    )
    assert "billed_more_than_ordered" in rows[0]["issues"]
    assert rows[0]["qty_variance"] == 2.0


def test_line_not_on_po():
    rows = match_lines(
        [_L(description="Widget", quantity=10, unit_price=5.0)], [],
        [_L(description="Gadget", quantity=1, unit_price=9.0)],
    )
    gadget = next(r for r in rows if r["description"] == "Gadget")
    assert "not_on_po" in gadget["issues"]


def test_pairs_by_product_id_over_description():
    po = [_L(description="Widget (old name)", quantity=10, unit_price=5.0, product_id="p1")]
    bill = [_L(description="Widget NEW", quantity=10, unit_price=5.0, product_id="p1")]
    rows = match_lines(po, [], bill)
    assert len(rows) == 1  # same product id → one row despite different descriptions
    assert "billed_more_than_ordered" not in rows[0]["issues"]


def test_grn_uom_factor_converts_to_base():
    # PO in base units (24); GRN entered as 2 boxes of 12
    rows = match_lines(
        [_L(quantity=24, unit_price=1.0)],
        [_L(quantity_received=2, uom_factor=12)],
        [_L(quantity=24, unit_price=1.0)],
    )
    assert rows[0]["received_qty"] == 24.0
    assert rows[0]["matched"] is True
