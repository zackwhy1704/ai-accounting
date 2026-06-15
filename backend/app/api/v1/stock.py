from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from uuid import UUID
from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import require_write
from app.core.pagination import PaginationParams, paginated_result, apply_sort
from app.core.sequences import next_sequence_number
from app.core.audit import log_audit
from app.models.models import StockAdjustment, StockTransfer, Product
from .gl_helpers import post_gl, revert_gl

# ── Schemas ────────────────────────────────────

class StockAdjustmentLine(BaseModel):
    product: Optional[str] = None        # product name (frontend sends name string)
    product_id: Optional[UUID] = None
    description: Optional[str] = None
    location: Optional[str] = None
    adjustment: float = 0.0              # signed quantity delta
    unit_cost: float = 0.0
    amount: float = 0.0


class StockAdjustmentCreate(BaseModel):
    adjustment_date: datetime
    reference_no: Optional[str] = None
    reference_number: Optional[str] = None  # frontend alias
    reason: str = "Inventory Adjustment"
    notes: Optional[str] = None
    # Frontend sends "items"; older callers/tests may send "lines". Accept both.
    items: list[StockAdjustmentLine] = []
    lines: list[StockAdjustmentLine] = []


class StockTransferLine(BaseModel):
    product_id: Optional[UUID] = None
    product: Optional[str] = None
    description: Optional[str] = None
    quantity: float = 0.0
    location_from: Optional[str] = None
    location_to: Optional[str] = None


class StockAdjustmentUpdate(BaseModel):
    adjustment_date: Optional[datetime] = None
    reference_no: Optional[str] = None
    reason: Optional[str] = None
    notes: Optional[str] = None
    lines: Optional[list[StockAdjustmentLine]] = None


class StockAdjustmentResponse(BaseModel):
    id: UUID
    organization_id: UUID
    adjustment_no: str
    adjustment_date: datetime
    reference_no: Optional[str]
    reason: str
    notes: Optional[str]
    status: str
    lines: list[StockAdjustmentLine]
    created_at: datetime

    model_config = {"from_attributes": True}


class StockTransferCreate(BaseModel):
    transfer_date: datetime
    from_location: Optional[str] = None
    to_location: Optional[str] = None
    notes: Optional[str] = None
    lines: list[StockTransferLine] = []


class StockTransferUpdate(BaseModel):
    transfer_date: Optional[datetime] = None
    from_location: Optional[str] = None
    to_location: Optional[str] = None
    notes: Optional[str] = None
    lines: Optional[list[StockTransferLine]] = None


class StockTransferResponse(BaseModel):
    id: UUID
    organization_id: UUID
    transfer_no: str
    transfer_date: datetime
    from_location: Optional[str]
    to_location: Optional[str]
    notes: Optional[str]
    status: str
    lines: list[StockTransferLine]
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Helpers ────────────────────────────────────

# Document numbers now use the shared sequential generator (ADJ-0001, TRF-0001)
# instead of a random suffix — no collision risk, consistent with other modules.


# ── Stock Adjustments Router ───────────────────

adjustments_router = APIRouter(prefix="/stock-adjustments", tags=["stock-adjustments"])


@adjustments_router.get("")
async def list_adjustments(
    p: PaginationParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    org_id = current_user["org_id"]
    base = select(StockAdjustment).where(StockAdjustment.organization_id == org_id)
    if p.search:
        like = f"%{p.search}%"
        base = base.where(or_(
            StockAdjustment.adjustment_no.ilike(like),
            StockAdjustment.reference_no.ilike(like),
        ))
    if p.date_from:
        base = base.where(StockAdjustment.adjustment_date >= p.date_from)
    if p.date_to:
        base = base.where(StockAdjustment.adjustment_date <= p.date_to)

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    query = apply_sort(base, StockAdjustment, p, "adjustment_date").offset(p.offset).limit(p.limit)
    items = (await db.execute(query)).scalars().all()
    items = [StockAdjustmentResponse.model_validate(i) for i in items]
    return paginated_result(items, total, p)


@adjustments_router.post("", response_model=StockAdjustmentResponse, status_code=201)
async def create_adjustment(
    payload: StockAdjustmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    # Frontend sends "items"; normalize to the model's "lines" JSONB column.
    raw_lines = payload.items or payload.lines
    lines = [l.model_dump(mode="json") for l in raw_lines]
    adj = StockAdjustment(
        organization_id=current_user["org_id"],
        adjustment_no=await next_sequence_number(db, StockAdjustment, StockAdjustment.adjustment_no, current_user["org_id"], "ADJ"),
        adjustment_date=payload.adjustment_date,
        reference_no=payload.reference_no or payload.reference_number,
        reason=payload.reason,
        notes=payload.notes,
        lines=lines,
    )
    db.add(adj)
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "create", "stock_adjustment", adj.id)
    await db.refresh(adj)
    return adj


@adjustments_router.get("/{adj_id}", response_model=StockAdjustmentResponse)
async def get_adjustment(
    adj_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(StockAdjustment).where(
            StockAdjustment.id == adj_id,
            StockAdjustment.organization_id == current_user["org_id"],
        )
    )
    adj = result.scalar_one_or_none()
    if not adj:
        raise HTTPException(status_code=404, detail="Stock adjustment not found")
    return adj


@adjustments_router.patch("/{adj_id}", response_model=StockAdjustmentResponse)
async def update_adjustment(
    adj_id: UUID,
    payload: StockAdjustmentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    result = await db.execute(
        select(StockAdjustment).where(
            StockAdjustment.id == adj_id,
            StockAdjustment.organization_id == current_user["org_id"],
        )
    )
    adj = result.scalar_one_or_none()
    if not adj:
        raise HTTPException(status_code=404, detail="Stock adjustment not found")
    for key, val in payload.model_dump(exclude_unset=True).items():
        setattr(adj, key, val)
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "update", "stock_adjustment", adj_id)
    await db.refresh(adj)
    return adj


@adjustments_router.delete("/{adj_id}", status_code=204)
async def delete_adjustment(
    adj_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    result = await db.execute(
        select(StockAdjustment).where(
            StockAdjustment.id == adj_id,
            StockAdjustment.organization_id == current_user["org_id"],
        )
    )
    adj = result.scalar_one_or_none()
    if not adj:
        raise HTTPException(status_code=404, detail="Stock adjustment not found")
    await db.delete(adj)
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "delete", "stock_adjustment", adj_id)


@adjustments_router.post("/{adj_id}/confirm", response_model=StockAdjustmentResponse)
async def confirm_adjustment(
    adj_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    result = await db.execute(
        select(StockAdjustment).where(
            StockAdjustment.id == adj_id,
            StockAdjustment.organization_id == current_user["org_id"],
        )
    )
    adj = result.scalar_one_or_none()
    if not adj:
        raise HTTPException(status_code=404, detail="Stock adjustment not found")
    if adj.status != "draft":
        raise HTTPException(status_code=400, detail="Only draft adjustments can be confirmed")

    org_id = current_user["org_id"]
    net_value = 0.0  # signed inventory value change (positive = stock increase)
    for line in (adj.lines or []):
        name = line.get("product")
        delta = float(line.get("adjustment", 0) or 0)
        cost = float(line.get("unit_cost", 0) or 0)
        if not name or delta == 0:
            continue
        # Resolve product by id (preferred) or name within the org.
        product = None
        pid = line.get("product_id")
        if pid:
            product = (await db.execute(
                select(Product).where(Product.id == pid, Product.organization_id == org_id)
            )).scalar_one_or_none()
        if product is None:
            product = (await db.execute(
                select(Product).where(Product.name == name, Product.organization_id == org_id)
            )).scalar_one_or_none()
        if product is not None:
            product.qty_on_hand = float(product.qty_on_hand or 0) + delta
        net_value += delta * cost

    # Post inventory GL: Inventory Asset (1300) <-> Inventory Adjustment (5800).
    # Skips silently if those accounts are not in the chart (post_gl returns None).
    if abs(net_value) > 0.01:
        if net_value > 0:
            entries = [("1300", net_value, 0.0), ("5800", 0.0, net_value)]
        else:
            amt = abs(net_value)
            entries = [("5800", amt, 0.0), ("1300", 0.0, amt)]
        await post_gl(
            db, org_id, adj.adjustment_date,
            f"Stock adjustment {adj.adjustment_no}", adj.reference_no or adj.adjustment_no,
            "stock_adjustment", adj.id, entries,
        )

    adj.status = "confirmed"
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "confirm", "stock_adjustment", adj_id)
    await db.refresh(adj)
    return adj


# ── Stock Transfers Router ─────────────────────

transfers_router = APIRouter(prefix="/stock-transfers", tags=["stock-transfers"])


@transfers_router.get("")
async def list_transfers(
    p: PaginationParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    org_id = current_user["org_id"]
    base = select(StockTransfer).where(StockTransfer.organization_id == org_id)
    if p.search:
        like = f"%{p.search}%"
        base = base.where(StockTransfer.transfer_no.ilike(like))
    if p.date_from:
        base = base.where(StockTransfer.transfer_date >= p.date_from)
    if p.date_to:
        base = base.where(StockTransfer.transfer_date <= p.date_to)

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    query = apply_sort(base, StockTransfer, p, "transfer_date").offset(p.offset).limit(p.limit)
    items = (await db.execute(query)).scalars().all()
    items = [StockTransferResponse.model_validate(i) for i in items]
    return paginated_result(items, total, p)


@transfers_router.post("", response_model=StockTransferResponse, status_code=201)
async def create_transfer(
    payload: StockTransferCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    trf = StockTransfer(
        organization_id=current_user["org_id"],
        transfer_no=await next_sequence_number(db, StockTransfer, StockTransfer.transfer_no, current_user["org_id"], "TRF"),
        **payload.model_dump(),
    )
    db.add(trf)
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "create", "stock_transfer", trf.id)
    await db.refresh(trf)
    return trf


@transfers_router.get("/{trf_id}", response_model=StockTransferResponse)
async def get_transfer(
    trf_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(StockTransfer).where(
            StockTransfer.id == trf_id,
            StockTransfer.organization_id == current_user["org_id"],
        )
    )
    trf = result.scalar_one_or_none()
    if not trf:
        raise HTTPException(status_code=404, detail="Stock transfer not found")
    return trf


@transfers_router.patch("/{trf_id}", response_model=StockTransferResponse)
async def update_transfer(
    trf_id: UUID,
    payload: StockTransferUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    result = await db.execute(
        select(StockTransfer).where(
            StockTransfer.id == trf_id,
            StockTransfer.organization_id == current_user["org_id"],
        )
    )
    trf = result.scalar_one_or_none()
    if not trf:
        raise HTTPException(status_code=404, detail="Stock transfer not found")
    for key, val in payload.model_dump(exclude_unset=True).items():
        setattr(trf, key, val)
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "update", "stock_transfer", trf_id)
    await db.refresh(trf)
    return trf


@transfers_router.delete("/{trf_id}", status_code=204)
async def delete_transfer(
    trf_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    result = await db.execute(
        select(StockTransfer).where(
            StockTransfer.id == trf_id,
            StockTransfer.organization_id == current_user["org_id"],
        )
    )
    trf = result.scalar_one_or_none()
    if not trf:
        raise HTTPException(status_code=404, detail="Stock transfer not found")
    await db.delete(trf)
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "delete", "stock_transfer", trf_id)


@transfers_router.post("/{trf_id}/complete", response_model=StockTransferResponse)
async def complete_transfer(
    trf_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    result = await db.execute(
        select(StockTransfer).where(
            StockTransfer.id == trf_id,
            StockTransfer.organization_id == current_user["org_id"],
        )
    )
    trf = result.scalar_one_or_none()
    if not trf:
        raise HTTPException(status_code=404, detail="Stock transfer not found")
    if trf.status != "draft":
        raise HTTPException(status_code=400, detail="Only draft transfers can be completed")
    trf.status = "completed"
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "complete", "stock_transfer", trf_id)
    await db.refresh(trf)
    return trf
