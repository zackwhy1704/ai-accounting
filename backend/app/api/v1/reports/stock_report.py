"""Stock/inventory reports: stock values and inventory summary."""
from collections import defaultdict
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user
from ._util import parse_date
from app.models.models import Product, StockAdjustment

router = APIRouter()


@router.get("/stock-values")
async def stock_values_report(
    as_of_date: str = Query(None, description="YYYY-MM-DD (unused, values are current)"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Stock valuation — current inventory value by product."""
    org_id = current_user["org_id"]

    result = await db.execute(
        select(Product)
        .where(
            Product.organization_id == org_id,
            Product.track_inventory == True,
        )
        .order_by(Product.code)
    )
    products = result.scalars().all()

    total_value = 0.0
    items = []

    for p in products:
        qty = float(p.qty_on_hand or 0)
        # Weighted-average cost from the perpetual-inventory engine; falls back
        # to the static cost_price for products that have never had a stock-in.
        cost = float(p.avg_cost or 0) or float(p.cost_price or 0)
        value = qty * cost
        total_value += value
        items.append({
            "code": p.code,
            "name": p.name,
            "product_type": p.product_type,
            "unit": p.unit,
            "qty_on_hand": qty,
            "cost_price": float(p.cost_price or 0),
            "avg_cost": cost,
            "total_value": value,
        })

    return {
        "items": items,
        "total_value": total_value,
    }


@router.get("/inventory-summary")
async def inventory_summary_report(
    start_date: str = Query(..., description="YYYY-MM-DD"),
    end_date: str = Query(..., description="YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Inventory summary — movements per tracked product in period."""
    org_id = current_user["org_id"]
    start = parse_date(start_date, "start_date")
    end = parse_date(end_date, "end_date", end_of_day=True)

    # Get all tracked products
    prod_result = await db.execute(
        select(Product)
        .where(
            Product.organization_id == org_id,
            Product.track_inventory == True,
        )
        .order_by(Product.code)
    )
    products = prod_result.scalars().all()
    product_map = {str(p.id): p for p in products}

    # Get confirmed stock adjustments in period
    adj_result = await db.execute(
        select(StockAdjustment)
        .where(
            StockAdjustment.organization_id == org_id,
            StockAdjustment.status == "confirmed",
            StockAdjustment.adjustment_date >= start,
            StockAdjustment.adjustment_date <= end,
        )
    )
    adjustments = adj_result.scalars().all()

    # Aggregate adjustment quantities per product
    adj_in = defaultdict(float)
    adj_out = defaultdict(float)

    for adj in adjustments:
        for line in (adj.lines or []):
            pid = str(line.get("product_id", ""))
            qty = float(line.get("qty", 0))
            if qty > 0:
                adj_in[pid] += qty
            elif qty < 0:
                adj_out[pid] += abs(qty)

    items = []
    for p in products:
        pid = str(p.id)
        closing_qty = float(p.qty_on_hand or 0)
        in_qty = adj_in.get(pid, 0.0)
        out_qty = adj_out.get(pid, 0.0)
        net_adj = in_qty - out_qty
        opening_qty = closing_qty - net_adj
        items.append({
            "code": p.code,
            "name": p.name,
            "opening_qty": opening_qty,
            "adjustments_in": in_qty,
            "adjustments_out": out_qty,
            "closing_qty": closing_qty,
        })

    return {
        "start_date": start_date,
        "end_date": end_date,
        "items": items,
    }
