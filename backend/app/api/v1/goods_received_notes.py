from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func, or_
from sqlalchemy.orm import selectinload
from uuid import UUID
from datetime import datetime
from typing import Optional
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import require_write
from app.core.pagination import PaginationParams, paginated_result, apply_sort
from app.core.audit import log_audit
from app.models.models import GoodsReceivedNote, GRNLineItem, Contact
from app.services.fx import document_rate
from app.services.inventory import receive_for_document_lines, reverse_moves

router = APIRouter(prefix="/goods-received-notes", tags=["goods-received-notes"])


class GRNLineItemCreate(BaseModel):
    product_id: Optional[UUID] = None
    description: str
    quantity_ordered: float = 0.0
    quantity_received: float
    unit_price: float


class GRNCreate(BaseModel):
    contact_id: UUID
    grn_number: Optional[str] = None
    bill_id: Optional[UUID] = None
    received_date: datetime
    currency: str = "MYR"
    notes: Optional[str] = None
    line_items: list[GRNLineItemCreate]


class GRNUpdate(BaseModel):
    contact_id: Optional[UUID] = None
    grn_number: Optional[str] = None
    bill_id: Optional[UUID] = None
    received_date: Optional[datetime] = None
    currency: Optional[str] = None
    notes: Optional[str] = None
    line_items: Optional[list[GRNLineItemCreate]] = None


class GRNLineItemResponse(BaseModel):
    id: UUID
    description: str
    quantity_ordered: float
    quantity_received: float
    unit_price: float
    sort_order: int
    model_config = {"from_attributes": True}


class GRNResponse(BaseModel):
    id: UUID
    organization_id: UUID
    contact_id: UUID
    grn_number: str
    bill_id: Optional[UUID]
    status: str
    received_date: datetime
    currency: str
    notes: Optional[str]
    created_at: datetime
    line_items: list[GRNLineItemResponse]
    model_config = {"from_attributes": True}


@router.get("")
async def list_grns(
    status: Optional[str] = None,
    contact_id: UUID | None = None,
    p: PaginationParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    org_id = current_user["org_id"]
    base = select(GoodsReceivedNote).where(GoodsReceivedNote.organization_id == org_id)
    if status:
        base = base.where(GoodsReceivedNote.status == status)
    if contact_id:
        base = base.where(GoodsReceivedNote.contact_id == contact_id)
    if p.search:
        like = f"%{p.search}%"
        contact_match = select(Contact.id).where(
            Contact.organization_id == org_id, Contact.name.ilike(like)
        )
        base = base.where(or_(
            GoodsReceivedNote.grn_number.ilike(like),
            GoodsReceivedNote.contact_id.in_(contact_match),
        ))
    if p.date_from:
        base = base.where(GoodsReceivedNote.received_date >= p.date_from)
    if p.date_to:
        base = base.where(GoodsReceivedNote.received_date <= p.date_to)

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    query = apply_sort(base, GoodsReceivedNote, p).options(selectinload(GoodsReceivedNote.line_items)).offset(p.offset).limit(p.limit)
    items = (await db.execute(query)).scalars().all()
    items = [GRNResponse.model_validate(i) for i in items]
    return paginated_result(items, total, p)


@router.post("", response_model=GRNResponse, status_code=201)
async def create_grn(
    payload: GRNCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    # ACCOUNTING POLICY (decided): GRN posts NO GL — this product uses bill-date
    # accrual, not goods-received-not-invoiced (GRNI). The expense/inventory hits
    # the ledger when the Bill is approved (post_bill_gl), not on physical receipt.
    # This is the simpler, SME-appropriate model; a GRNI clearing account is
    # intentionally NOT implemented. The GRN records receipt + qty only.
    org_id = current_user["org_id"]

    if payload.grn_number:
        existing = (await db.execute(select(GoodsReceivedNote.id).where(GoodsReceivedNote.organization_id == org_id, GoodsReceivedNote.grn_number == payload.grn_number))).first()
        if existing:
            raise HTTPException(status_code=400, detail="GRN number already in use")
        grn_number = payload.grn_number
    else:
        from app.core.sequences import next_sequence_number
        grn_number = await next_sequence_number(db, GoodsReceivedNote, GoodsReceivedNote.grn_number, org_id, "GRN")

    grn = GoodsReceivedNote(
        organization_id=org_id,
        contact_id=payload.contact_id,
        grn_number=grn_number,
        bill_id=payload.bill_id,
        received_date=payload.received_date,
        currency=payload.currency,
        notes=payload.notes,
    )
    db.add(grn)
    await db.flush()

    for i, item in enumerate(payload.line_items):
        line = GRNLineItem(
            grn_id=grn.id,
            product_id=item.product_id,
            description=item.description,
            quantity_ordered=item.quantity_ordered,
            quantity_received=item.quantity_received,
            unit_price=item.unit_price,
            sort_order=i,
        )
        db.add(line)

    await db.commit()
    await log_audit(db, org_id, current_user["sub"], "create", "grn", grn.id)
    result = await db.execute(
        select(GoodsReceivedNote).options(selectinload(GoodsReceivedNote.line_items)).where(GoodsReceivedNote.id == grn.id)
    )
    return result.scalar_one()


@router.get("/{grn_id}", response_model=GRNResponse)
async def get_grn(
    grn_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(GoodsReceivedNote).options(selectinload(GoodsReceivedNote.line_items)).where(
            GoodsReceivedNote.id == grn_id,
            GoodsReceivedNote.organization_id == current_user["org_id"],
        )
    )
    grn = result.scalar_one_or_none()
    if not grn:
        raise HTTPException(status_code=404, detail="GRN not found")
    return grn


@router.patch("/{grn_id}", response_model=GRNResponse)
async def update_grn(
    grn_id: UUID,
    data: GRNUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    result = await db.execute(
        select(GoodsReceivedNote).where(
            GoodsReceivedNote.id == grn_id,
            GoodsReceivedNote.organization_id == current_user["org_id"],
        )
    )
    grn = result.scalar_one_or_none()
    if not grn:
        raise HTTPException(status_code=404, detail="GRN not found")

    update_data = data.model_dump(exclude_unset=True)

    if "grn_number" in update_data and update_data["grn_number"]:
        existing = (await db.execute(select(GoodsReceivedNote.id).where(GoodsReceivedNote.organization_id == current_user["org_id"], GoodsReceivedNote.grn_number == update_data["grn_number"], GoodsReceivedNote.id != grn.id))).first()
        if existing:
            raise HTTPException(status_code=400, detail="GRN number already in use")

    if "line_items" in update_data:
        update_data.pop("line_items")
        await db.execute(
            delete(GRNLineItem).where(GRNLineItem.grn_id == grn_id)
        )
        for i, item in enumerate(data.line_items):
            line = GRNLineItem(
                grn_id=grn.id,
                description=item.description,
                quantity_ordered=item.quantity_ordered,
                quantity_received=item.quantity_received,
                unit_price=item.unit_price,
                sort_order=i,
            )
            db.add(line)

    for key, value in update_data.items():
        setattr(grn, key, value)

    await db.commit()
    result = await db.execute(
        select(GoodsReceivedNote).options(selectinload(GoodsReceivedNote.line_items)).where(GoodsReceivedNote.id == grn_id)
    )
    return result.scalar_one()


@router.patch("/{grn_id}/status")
async def update_grn_status(
    grn_id: UUID,
    status: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    valid = {"draft", "received", "billed"}
    if status not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid}")

    result = await db.execute(
        select(GoodsReceivedNote).where(
            GoodsReceivedNote.id == grn_id,
            GoodsReceivedNote.organization_id == current_user["org_id"],
        )
    )
    grn = result.scalar_one_or_none()
    if not grn:
        raise HTTPException(status_code=404, detail="GRN not found")

    prev_status = grn.status
    grn.status = status

    # Physical receipt moves stock IN at the line cost (weighted-average update).
    # No GL here — inventory value posts when the Bill is approved (see bills.py).
    if status in ("received", "billed") and prev_status == "draft":
        from sqlalchemy.orm import selectinload as _sl
        loaded = (await db.execute(
            select(GoodsReceivedNote).options(_sl(GoodsReceivedNote.line_items))
            .where(GoodsReceivedNote.id == grn.id)
        )).scalar_one()
        rate = await document_rate(db, current_user["org_id"], grn.currency, grn.received_date)
        await receive_for_document_lines(
            db, current_user["org_id"], loaded.line_items, "grn", grn.id,
            grn.received_date, rate=rate, qty_key="quantity_received",
        )

    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "status_change", "grn", grn_id)
    return {"status": grn.status}


@router.delete("/{grn_id}", status_code=204)
async def delete_grn(
    grn_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    result = await db.execute(
        select(GoodsReceivedNote).where(
            GoodsReceivedNote.id == grn_id,
            GoodsReceivedNote.organization_id == current_user["org_id"],
        )
    )
    grn = result.scalar_one_or_none()
    if not grn:
        raise HTTPException(status_code=404, detail="GRN not found")
    if grn.status == "billed":
        raise HTTPException(status_code=400, detail="Cannot delete a billed GRN")
    await reverse_moves(db, current_user["org_id"], "grn", grn_id, grn.received_date)
    await db.execute(delete(GRNLineItem).where(GRNLineItem.grn_id == grn_id))
    await db.delete(grn)
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "delete", "grn", grn_id)


@router.get("/{grn_id}/activity")
async def grn_activity(grn_id: UUID, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    org_id = current_user["org_id"]
    result = await db.execute(select(GoodsReceivedNote).where(GoodsReceivedNote.id == grn_id, GoodsReceivedNote.organization_id == org_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="GRN not found")
    events: list[dict] = [{
        "ts": obj.received_date.isoformat() if obj.received_date else None,
        "type": "issued", "ref": obj.grn_number, "ref_id": str(obj.id),
        "delta": 0.0, "note": obj.notes or "", "status": obj.status,
        "balance": 0.0,
    }]
    return {"total": 0.0, "events": events}
