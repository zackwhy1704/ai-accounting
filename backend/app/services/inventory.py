"""
Perpetual inventory with weighted-average costing.

The ONLY module that mutates Product.qty_on_hand / avg_cost. Every movement
writes a StockMove row (the auditable ledger that stock card / per-location
balances derive from). Costs are in org base currency.

Rules:
  IN  (GRN, bill, credit-note return, positive adjustment):
      new_avg = (old_qty*old_avg + in_qty*in_cost) / (old_qty + in_qty)
      (when old_qty <= 0 the receipt cost becomes the new average)
  OUT (invoice, sale receipt, negative adjustment):
      leaves at current avg_cost; avg unchanged. qty may go negative —
      backorder-style, like SQL Account; the cost used is the last average.
  Reversals insert opposite-signed moves at the original unit cost.
"""
from datetime import datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Product, StockMove


def weighted_avg(old_qty: float, old_avg: float, in_qty: float, in_cost: float) -> float:
    """New weighted-average cost after receiving in_qty at in_cost."""
    old_qty, old_avg = float(old_qty or 0), float(old_avg or 0)
    in_qty, in_cost = float(in_qty or 0), float(in_cost or 0)
    if in_qty <= 0:
        return old_avg
    if old_qty <= 0:
        return round(in_cost, 4)
    return round((old_qty * old_avg + in_qty * in_cost) / (old_qty + in_qty), 4)


async def has_moves(db: AsyncSession, source_type: str, source_id) -> bool:
    row = (await db.execute(
        select(StockMove.id).where(
            StockMove.source_type == source_type, StockMove.source_id == source_id
        ).limit(1)
    )).first()
    return row is not None


def _move(org_id, product: Product, qty: float, unit_cost: float, source_type: str,
          source_id, date: datetime, location_id=None, note: str | None = None) -> StockMove:
    return StockMove(
        organization_id=org_id, product_id=product.id, location_id=location_id,
        date=date, qty=round(float(qty), 4), unit_cost=round(float(unit_cost or 0), 4),
        source_type=source_type, source_id=source_id, note=note,
    )


async def stock_in(
    db: AsyncSession, org_id, product: Product, qty: float, unit_cost: float,
    source_type: str, source_id, date: datetime, location_id=None, note: str | None = None,
) -> StockMove:
    """Receive qty at unit_cost; updates weighted-average and qty_on_hand."""
    qty = float(qty or 0)
    if qty <= 0:
        raise ValueError("stock_in qty must be positive")
    product.avg_cost = weighted_avg(product.qty_on_hand, product.avg_cost, qty, unit_cost)
    product.qty_on_hand = round(float(product.qty_on_hand or 0) + qty, 4)
    mv = _move(org_id, product, qty, unit_cost, source_type, source_id, date, location_id, note)
    db.add(mv)
    return mv


async def stock_out(
    db: AsyncSession, org_id, product: Product, qty: float,
    source_type: str, source_id, date: datetime, location_id=None, note: str | None = None,
) -> float:
    """Issue qty at the current weighted-average cost. Returns the unit cost used."""
    qty = float(qty or 0)
    if qty <= 0:
        raise ValueError("stock_out qty must be positive")
    unit_cost = float(product.avg_cost or 0) or float(product.cost_price or 0)
    product.qty_on_hand = round(float(product.qty_on_hand or 0) - qty, 4)
    db.add(_move(org_id, product, -qty, unit_cost, source_type, source_id, date, location_id, note))
    return unit_cost


async def reverse_moves(db: AsyncSession, org_id, source_type: str, source_id, date: datetime) -> float:
    """Insert opposite moves for everything posted by (source_type, source_id) and
    restore qty_on_hand. Returns the total cost value reversed (positive)."""
    moves = (await db.execute(
        select(StockMove).where(
            StockMove.organization_id == org_id,
            StockMove.source_type == source_type,
            StockMove.source_id == source_id,
        )
    )).scalars().all()
    if not moves:
        return 0.0
    products = {p.id: p for p in (await db.execute(
        select(Product).where(Product.id.in_({m.product_id for m in moves}))
    )).scalars().all()}
    total_value = 0.0
    for m in moves:
        product = products.get(m.product_id)
        if product is None:
            continue
        product.qty_on_hand = round(float(product.qty_on_hand or 0) - float(m.qty), 4)
        db.add(StockMove(
            organization_id=org_id, product_id=m.product_id, location_id=m.location_id,
            date=date, qty=-float(m.qty), unit_cost=float(m.unit_cost),
            source_type=f"{source_type}_reversal", source_id=source_id,
            note=f"Reversal of {source_type}",
        ))
        total_value += float(m.qty) * float(m.unit_cost)
    return round(abs(total_value), 2)


async def issue_for_document_lines(
    db: AsyncSession, org_id, line_items, source_type: str, source_id, date: datetime,
) -> list[tuple[Product, float, float]]:
    """Stock OUT for every line linked to an inventory-tracked product.
    Returns [(product, qty, cost_value)] for COGS posting. Idempotent per source."""
    if await has_moves(db, source_type, source_id):
        return []
    def g(li, key, default=None):
        return li.get(key, default) if isinstance(li, dict) else getattr(li, key, default)

    product_ids = {g(li, "product_id") for li in line_items if g(li, "product_id")}
    if not product_ids:
        return []
    products = {p.id: p for p in (await db.execute(
        select(Product).where(Product.organization_id == org_id, Product.id.in_(product_ids))
    )).scalars().all()}

    issued = []
    for li in line_items:
        pid = g(li, "product_id")
        product = products.get(UUID(str(pid))) if pid and not isinstance(pid, UUID) else products.get(pid)
        qty = float(g(li, "quantity") or 0)
        if product is None or not product.track_inventory or qty <= 0:
            continue
        unit_cost = await stock_out(db, org_id, product, qty, source_type, source_id, date)
        issued.append((product, qty, round(qty * unit_cost, 2)))
    return issued


async def receive_for_document_lines(
    db: AsyncSession, org_id, line_items, source_type: str, source_id, date: datetime,
    rate: float = 1.0, qty_key: str = "quantity", cost_from: str = "unit_price",
) -> list[tuple[Product, float, float]]:
    """Stock IN for every line linked to an inventory-tracked product, at the
    line unit price converted to base currency (cost_from='unit_price'), or at
    the product's current weighted-average cost (cost_from='avg' — used for
    credit-note returns so a return never distorts the average). Idempotent
    per source. Returns [(product, qty, cost_value)]."""
    if await has_moves(db, source_type, source_id):
        return []
    def g(li, key, default=None):
        return li.get(key, default) if isinstance(li, dict) else getattr(li, key, default)

    product_ids = {g(li, "product_id") for li in line_items if g(li, "product_id")}
    if not product_ids:
        return []
    products = {p.id: p for p in (await db.execute(
        select(Product).where(Product.organization_id == org_id, Product.id.in_(product_ids))
    )).scalars().all()}

    received = []
    for li in line_items:
        pid = g(li, "product_id")
        product = products.get(UUID(str(pid))) if pid and not isinstance(pid, UUID) else products.get(pid)
        qty = float(g(li, qty_key) or 0)
        if product is None or not product.track_inventory or qty <= 0:
            continue
        if cost_from == "avg":
            unit_cost = float(product.avg_cost or 0) or float(product.cost_price or 0)
        else:
            unit_cost = round(float(g(li, "unit_price") or 0) * float(rate or 1.0), 4)
        await stock_in(db, org_id, product, qty, unit_cost, source_type, source_id, date)
        received.append((product, qty, round(qty * unit_cost, 2)))
    return received


async def location_balances(db: AsyncSession, org_id, product_id=None) -> list[dict]:
    """Per-location quantity from the moves ledger. location_id None = unassigned."""
    q = (
        select(StockMove.product_id, StockMove.location_id,
               func.coalesce(func.sum(StockMove.qty), 0).label("qty"))
        .where(StockMove.organization_id == org_id)
        .group_by(StockMove.product_id, StockMove.location_id)
    )
    if product_id:
        q = q.where(StockMove.product_id == product_id)
    rows = (await db.execute(q)).all()
    return [{"product_id": str(r.product_id),
             "location_id": str(r.location_id) if r.location_id else None,
             "qty": round(float(r.qty), 4)} for r in rows]
