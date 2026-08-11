"""
Stock reports over the perpetual-inventory ledger (stock_moves):

- /reports/stock-aging          — on-hand quantity aged by receipt date (FIFO)
- /reports/stock-reorder-advice — below-reorder-point products + suggested qty
- /reports/stock-movement       — per-product in/out/net for a period
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import Product, StockMove
from ._util import parse_date

router = APIRouter()

AGING_BUCKETS = [(0, 30), (31, 60), (61, 90), (91, None)]


@router.get("/stock-aging")
async def stock_aging_report(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Age each product's on-hand quantity by when it was received (FIFO walk:
    the newest receipts are assumed to still be on the shelf)."""
    org_id = current_user["org_id"]
    now = datetime.now(timezone.utc)
    products = (await db.execute(
        select(Product).where(
            Product.organization_id == org_id, Product.track_inventory == True,
        ).order_by(Product.code)
    )).scalars().all()

    rows = []
    for p in products:
        on_hand = float(p.qty_on_hand or 0)
        if on_hand <= 0:
            continue
        in_moves = (await db.execute(
            select(StockMove).where(
                StockMove.organization_id == org_id,
                StockMove.product_id == p.id,
                StockMove.qty > 0,
            ).order_by(StockMove.date.desc())
        )).scalars().all()

        buckets = {f"{lo}-{hi}" if hi else f"{lo}+": 0.0 for lo, hi in AGING_BUCKETS}
        remaining = on_hand
        for m in in_moves:
            if remaining <= 0:
                break
            take = min(remaining, float(m.qty))
            age_days = (now - m.date).days if m.date else 0
            for lo, hi in AGING_BUCKETS:
                if age_days >= lo and (hi is None or age_days <= hi):
                    buckets[f"{lo}-{hi}" if hi else f"{lo}+"] += take
                    break
            remaining = round(remaining - take, 4)
        if remaining > 0:  # opening stock with no ledger history: oldest bucket
            buckets["91+"] += remaining

        cost = float(p.avg_cost or 0) or float(p.cost_price or 0)
        rows.append({
            "code": p.code, "name": p.name, "qty_on_hand": on_hand,
            "avg_cost": cost, "value": round(on_hand * cost, 2),
            "buckets": {k: round(v, 4) for k, v in buckets.items()},
        })
    return {"as_of": now.isoformat(), "rows": rows}


@router.get("/stock-reorder-advice")
async def stock_reorder_advice(
    usage_days: int = Query(90, ge=7, le=365, description="Window for average daily usage"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Products at/below their reorder point, with recent usage and a suggested
    order quantity (cover the usage window, at least back up to the reorder point)."""
    org_id = current_user["org_id"]
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=usage_days)

    products = (await db.execute(
        select(Product).where(
            Product.organization_id == org_id,
            Product.track_inventory == True,
            Product.reorder_point.isnot(None),
        ).order_by(Product.code)
    )).scalars().all()
    if not products:
        return {"rows": [], "usage_days": usage_days}

    usage_rows = (await db.execute(
        select(StockMove.product_id, func.coalesce(func.sum(-StockMove.qty), 0))
        .where(
            StockMove.organization_id == org_id,
            StockMove.product_id.in_([p.id for p in products]),
            StockMove.qty < 0,
            StockMove.date >= since,
            StockMove.source_type.in_(["invoice", "sale_receipt"]),
        )
        .group_by(StockMove.product_id)
    )).all()
    usage = {r[0]: float(r[1]) for r in usage_rows}

    rows = []
    for p in products:
        on_hand = float(p.qty_on_hand or 0)
        reorder = float(p.reorder_point or 0)
        if on_hand > reorder:
            continue
        sold = usage.get(p.id, 0.0)
        daily = sold / usage_days
        suggested = max(round(reorder - on_hand + daily * usage_days, 4), round(reorder - on_hand, 4))
        rows.append({
            "code": p.code, "name": p.name, "unit": p.unit,
            "qty_on_hand": on_hand, "reorder_point": reorder,
            "sold_last_period": sold, "daily_usage": round(daily, 4),
            "suggested_order_qty": suggested,
        })
    return {"rows": rows, "usage_days": usage_days}


@router.get("/stock-movement")
async def stock_movement_report(
    start_date: str = Query(..., description="YYYY-MM-DD"),
    end_date: str = Query(..., description="YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Per-product opening / in / out / closing for a period, from the moves ledger."""
    org_id = current_user["org_id"]
    start = parse_date(start_date, "start_date")
    end = parse_date(end_date, "end_date", end_of_day=True)

    products = (await db.execute(
        select(Product).where(
            Product.organization_id == org_id, Product.track_inventory == True,
        ).order_by(Product.code)
    )).scalars().all()
    if not products:
        return {"rows": [], "start_date": start_date, "end_date": end_date}
    pids = [p.id for p in products]

    opening_rows = (await db.execute(
        select(StockMove.product_id, func.coalesce(func.sum(StockMove.qty), 0))
        .where(StockMove.organization_id == org_id, StockMove.product_id.in_(pids),
               StockMove.date < start)
        .group_by(StockMove.product_id)
    )).all()
    opening = {r[0]: float(r[1]) for r in opening_rows}

    period_rows = (await db.execute(
        select(
            StockMove.product_id,
            func.coalesce(func.sum(func.greatest(StockMove.qty, 0)), 0).label("qty_in"),
            func.coalesce(func.sum(func.least(StockMove.qty, 0)), 0).label("qty_out"),
        )
        .where(StockMove.organization_id == org_id, StockMove.product_id.in_(pids),
               StockMove.date >= start, StockMove.date <= end)
        .group_by(StockMove.product_id)
    )).all()
    period = {r.product_id: (float(r.qty_in), float(r.qty_out)) for r in period_rows}

    rows = []
    for p in products:
        o = opening.get(p.id, 0.0)
        qty_in, qty_out = period.get(p.id, (0.0, 0.0))
        if o == 0 and qty_in == 0 and qty_out == 0:
            continue
        rows.append({
            "code": p.code, "name": p.name, "unit": p.unit,
            "opening": round(o, 4), "qty_in": round(qty_in, 4),
            "qty_out": round(-qty_out, 4), "closing": round(o + qty_in + qty_out, 4),
        })
    return {"rows": rows, "start_date": start_date, "end_date": end_date}


@router.get("/batch-expiry")
async def batch_expiry_report(
    within_days: int = Query(90, ge=1, le=730, description="Show batches expiring within N days (expired included)"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Batches with stock on hand that are expired or expiring soon."""
    from app.models.models import StockBatch
    org_id = current_user["org_id"]
    now = datetime.now(timezone.utc)
    horizon = now + timedelta(days=within_days)
    rows = (await db.execute(
        select(StockBatch, Product)
        .join(Product, Product.id == StockBatch.product_id)
        .where(
            StockBatch.organization_id == org_id,
            StockBatch.qty_on_hand > 0,
            StockBatch.expiry_date.isnot(None),
            StockBatch.expiry_date <= horizon,
        )
        .order_by(StockBatch.expiry_date)
    )).all()
    return {
        "as_of": now.isoformat(), "within_days": within_days,
        "rows": [{
            "product_code": p.code, "product_name": p.name,
            "batch_no": b.batch_no,
            "expiry_date": b.expiry_date.isoformat(),
            "days_to_expiry": (b.expiry_date - now).days,
            "expired": b.expiry_date < now,
            "qty_on_hand": float(b.qty_on_hand or 0),
        } for b, p in rows],
    }
