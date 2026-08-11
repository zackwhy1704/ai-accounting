"""
Stock ledger endpoints — the read side of the perpetual-inventory engine.

- GET /stock/moves            — paginated movement ledger (filter by product)
- GET /stock/levels-by-location — per-location balances derived from moves
- GET /products/{id}/stock-card — running-balance stock card for one product
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.pagination import PaginationParams, paginated_result
from app.core.security import get_current_user
from app.models.models import Location, Product, StockMove
from app.services.inventory import location_balances

router = APIRouter(tags=["stock-ledger"])


@router.get("/stock/moves")
async def list_stock_moves(
    product_id: UUID | None = None,
    source_type: str | None = None,
    p: PaginationParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    org_id = current_user["org_id"]
    base = select(StockMove).where(StockMove.organization_id == org_id)
    if product_id:
        base = base.where(StockMove.product_id == product_id)
    if source_type:
        base = base.where(StockMove.source_type == source_type)
    if p.date_from:
        base = base.where(StockMove.date >= p.date_from)
    if p.date_to:
        base = base.where(StockMove.date <= p.date_to)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    rows = (await db.execute(
        base.order_by(StockMove.date.desc(), StockMove.created_at.desc()).offset(p.offset).limit(p.limit)
    )).scalars().all()
    items = [{
        "id": str(m.id), "product_id": str(m.product_id),
        "location_id": str(m.location_id) if m.location_id else None,
        "date": m.date.isoformat() if m.date else None,
        "qty": float(m.qty), "unit_cost": float(m.unit_cost),
        "value": round(float(m.qty) * float(m.unit_cost), 2),
        "source_type": m.source_type,
        "source_id": str(m.source_id) if m.source_id else None,
        "note": m.note,
    } for m in rows]
    return paginated_result(items, total, p)


@router.get("/stock/levels-by-location")
async def stock_levels_by_location(
    product_id: UUID | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    org_id = current_user["org_id"]
    balances = await location_balances(db, org_id, product_id)
    product_ids = {UUID(b["product_id"]) for b in balances}
    location_ids = {UUID(b["location_id"]) for b in balances if b["location_id"]}
    products = {str(p.id): p for p in (await db.execute(
        select(Product).where(Product.id.in_(product_ids))
    )).scalars().all()} if product_ids else {}
    locations = {str(l.id): l for l in (await db.execute(
        select(Location).where(Location.id.in_(location_ids))
    )).scalars().all()} if location_ids else {}
    for b in balances:
        prod = products.get(b["product_id"])
        loc = locations.get(b["location_id"]) if b["location_id"] else None
        b["product_code"] = prod.code if prod else None
        b["product_name"] = prod.name if prod else None
        b["location_name"] = loc.name if loc else "Unassigned"
        b["avg_cost"] = float(prod.avg_cost or 0) if prod else 0.0
        b["value"] = round(b["qty"] * (float(prod.avg_cost or 0) if prod else 0.0), 2)
    return {"rows": balances}


@router.get("/products/{product_id}/stock-card")
async def product_stock_card(
    product_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Movement history with running balance, oldest first."""
    org_id = current_user["org_id"]
    product = (await db.execute(
        select(Product).where(Product.id == product_id, Product.organization_id == org_id)
    )).scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    moves = (await db.execute(
        select(StockMove).where(
            StockMove.organization_id == org_id, StockMove.product_id == product_id
        ).order_by(StockMove.date, StockMove.created_at)
    )).scalars().all()
    running = 0.0
    rows = []
    for m in moves:
        running = round(running + float(m.qty), 4)
        rows.append({
            "date": m.date.isoformat() if m.date else None,
            "source_type": m.source_type,
            "source_id": str(m.source_id) if m.source_id else None,
            "note": m.note,
            "qty_in": float(m.qty) if float(m.qty) > 0 else 0.0,
            "qty_out": -float(m.qty) if float(m.qty) < 0 else 0.0,
            "unit_cost": float(m.unit_cost),
            "balance": running,
        })
    return {
        "product_id": str(product.id), "code": product.code, "name": product.name,
        "qty_on_hand": float(product.qty_on_hand or 0),
        "avg_cost": float(product.avg_cost or 0),
        "moves": rows,
    }
