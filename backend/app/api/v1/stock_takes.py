"""
Stock takes — physical count workflow (SQL Account's stock-take module):

1. POST /stock-takes            — snapshot expected quantities into a worksheet
2. PATCH /{id}                  — enter counted quantities
3. POST /{id}/complete          — variances move stock (costing service) and
                                  post GL Inventory 1300 <-> Adjustment 5800
4. POST /{id}/void              — reverse a completed take (moves + GL)

GET /{id} doubles as the printable physical worksheet.
"""
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_audit
from app.core.database import get_db
from app.core.pagination import PaginationParams, paginated_result, apply_sort
from app.core.permissions import require_write
from app.core.security import get_current_user
from app.core.sequences import next_sequence_number
from app.models.models import Product, StockTake
from app.services import inventory as inv
from .gl_helpers import post_gl, revert_gl

router = APIRouter(prefix="/stock-takes", tags=["stock-takes"])


class StockTakeCreate(BaseModel):
    location_id: UUID | None = None
    product_ids: list[UUID] | None = None  # default: every tracked product
    notes: str | None = None


class StockTakeCount(BaseModel):
    counts: dict[UUID, float]  # product_id -> counted qty
    notes: str | None = None


def _dict(st: StockTake) -> dict:
    lines = st.lines or []
    variance_value = sum(
        (float(l.get("counted_qty")) - float(l.get("expected_qty") or 0)) * float(l.get("unit_cost") or 0)
        for l in lines if l.get("counted_qty") is not None
    )
    return {
        "id": str(st.id), "stock_take_number": st.stock_take_number, "status": st.status,
        "count_date": st.count_date.isoformat() if st.count_date else None,
        "location_id": str(st.location_id) if st.location_id else None,
        "notes": st.notes, "lines": lines,
        "counted": sum(1 for l in lines if l.get("counted_qty") is not None),
        "total_lines": len(lines),
        "variance_value": round(variance_value, 2),
        "completed_at": st.completed_at.isoformat() if st.completed_at else None,
    }


@router.get("")
async def list_stock_takes(
    status: str | None = None,
    p: PaginationParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    org_id = current_user["org_id"]
    base = select(StockTake).where(StockTake.organization_id == org_id)
    if status:
        base = base.where(StockTake.status == status)
    if p.search:
        base = base.where(StockTake.stock_take_number.ilike(f"%{p.search}%"))
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    rows = (await db.execute(
        apply_sort(base, StockTake, p, "count_date").offset(p.offset).limit(p.limit)
    )).scalars().all()
    return paginated_result([_dict(r) for r in rows], total, p)


@router.post("", status_code=201)
async def create_stock_take(payload: StockTakeCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_write())):
    """Snapshot expected quantities NOW — the count sheet users take to the shelf."""
    org_id = current_user["org_id"]
    q = select(Product).where(Product.organization_id == org_id, Product.track_inventory == True)
    if payload.product_ids:
        q = q.where(Product.id.in_(payload.product_ids))
    products = (await db.execute(q.order_by(Product.code))).scalars().all()
    if not products:
        raise HTTPException(status_code=400, detail="No inventory-tracked products to count")

    expected_by_product: dict = {}
    if payload.location_id:
        for b in await inv.location_balances(db, org_id):
            if b["location_id"] == str(payload.location_id):
                expected_by_product[b["product_id"]] = b["qty"]

    lines = []
    for p in products:
        expected = (expected_by_product.get(str(p.id), 0.0) if payload.location_id
                    else float(p.qty_on_hand or 0))
        lines.append({
            "product_id": str(p.id), "code": p.code, "name": p.name, "unit": p.unit,
            "expected_qty": round(expected, 4),
            "counted_qty": None,
            "unit_cost": float(p.avg_cost or 0) or float(p.cost_price or 0),
        })

    st = StockTake(
        organization_id=org_id,
        stock_take_number=await next_sequence_number(db, StockTake, StockTake.stock_take_number, org_id, "ST"),
        location_id=payload.location_id, notes=payload.notes, lines=lines,
        created_by=current_user["sub"], count_date=datetime.now(timezone.utc),
    )
    db.add(st)
    await db.commit()
    await log_audit(db, org_id, current_user["sub"], "create", "stock_take", st.id)
    return _dict(st)


async def _load(db: AsyncSession, st_id: UUID, org_id) -> StockTake:
    st = (await db.execute(
        select(StockTake).where(StockTake.id == st_id, StockTake.organization_id == org_id)
    )).scalar_one_or_none()
    if not st:
        raise HTTPException(status_code=404, detail="Stock take not found")
    return st


@router.get("/{st_id}")
async def get_stock_take(st_id: UUID, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    return _dict(await _load(db, st_id, current_user["org_id"]))


@router.patch("/{st_id}")
async def enter_counts(st_id: UUID, payload: StockTakeCount, db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_write())):
    st = await _load(db, st_id, current_user["org_id"])
    if st.status != "draft":
        raise HTTPException(status_code=400, detail=f"Cannot edit a {st.status} stock take")
    counts = {str(k): float(v) for k, v in payload.counts.items()}
    if any(v < 0 for v in counts.values()):
        raise HTTPException(status_code=422, detail="Counted quantities cannot be negative")
    lines = list(st.lines or [])
    for l in lines:
        if l["product_id"] in counts:
            l["counted_qty"] = round(counts[l["product_id"]], 4)
    st.lines = lines
    if payload.notes is not None:
        st.notes = payload.notes
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "update", "stock_take", st_id)
    return _dict(st)


@router.post("/{st_id}/complete")
async def complete_stock_take(st_id: UUID, db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_write())):
    """Post count variances: stock in/out through the costing service + GL
    Inventory (1300) <-> Inventory Adjustment (5800). Uncounted lines are skipped."""
    org_id = current_user["org_id"]
    st = await _load(db, st_id, org_id)
    if st.status != "draft":
        raise HTTPException(status_code=400, detail=f"Stock take is already {st.status}")

    counted = [l for l in (st.lines or []) if l.get("counted_qty") is not None]
    if not counted:
        raise HTTPException(status_code=400, detail="No counted quantities entered yet")

    net_value, adjusted = 0.0, 0
    for l in counted:
        variance = round(float(l["counted_qty"]) - float(l.get("expected_qty") or 0), 4)
        if variance == 0:
            continue
        product = (await db.execute(
            select(Product).where(Product.id == l["product_id"], Product.organization_id == org_id)
        )).scalar_one_or_none()
        if product is None:
            continue
        if variance > 0:
            cost = float(l.get("unit_cost") or 0) or float(product.avg_cost or 0)
            await inv.stock_in(db, org_id, product, variance, cost, "stock_take", st.id,
                               st.count_date, location_id=st.location_id, note=st.stock_take_number)
            net_value += variance * cost
        else:
            used = await inv.stock_out(db, org_id, product, -variance, "stock_take", st.id,
                                       st.count_date, location_id=st.location_id, note=st.stock_take_number)
            net_value += variance * used
        adjusted += 1

    if abs(net_value) > 0.005:
        if net_value > 0:
            entries = [("1300", round(net_value, 2), 0.0), ("5800", 0.0, round(net_value, 2))]
        else:
            amt = round(abs(net_value), 2)
            entries = [("5800", amt, 0.0), ("1300", 0.0, amt)]
        await post_gl(db, org_id, st.count_date, f"Stock take {st.stock_take_number}",
                      st.stock_take_number, "stock_take", st.id, entries)

    st.status = "completed"
    st.completed_at = datetime.now(timezone.utc)
    await db.commit()
    await log_audit(db, org_id, current_user["sub"], "complete", "stock_take", st_id,
                    {"adjusted_lines": adjusted, "variance_value": round(net_value, 2)})
    return {**_dict(st), "adjusted_lines": adjusted, "posted_value": round(net_value, 2)}


@router.post("/{st_id}/void")
async def void_stock_take(st_id: UUID, db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_write())):
    """Reverse a completed stock take: stock moves back + GL reversal."""
    org_id = current_user["org_id"]
    st = await _load(db, st_id, org_id)
    if st.status != "completed":
        raise HTTPException(status_code=400, detail="Only completed stock takes can be voided")
    await revert_gl(db, org_id, st.id, "stock_take", st.count_date,
                    f"Reversal: Stock take {st.stock_take_number} voided", st.stock_take_number)
    await inv.reverse_moves(db, org_id, "stock_take", st.id, st.count_date)
    st.status = "void"
    await db.commit()
    await log_audit(db, org_id, current_user["sub"], "void", "stock_take", st_id)
    return _dict(st)
