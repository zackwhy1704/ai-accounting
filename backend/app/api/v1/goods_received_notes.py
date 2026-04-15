import random
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload
from uuid import UUID
from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import GoodsReceivedNote, GRNLineItem

router = APIRouter(prefix="/goods-received-notes", tags=["goods-received-notes"])


class GRNLineItemCreate(BaseModel):
    description: str
    quantity_ordered: float = 0.0
    quantity_received: float
    unit_price: float


class GRNCreate(BaseModel):
    contact_id: UUID
    grn_number: Optional[str] = None
    purchase_order_id: Optional[UUID] = None
    received_date: datetime
    currency: str = "SGD"
    notes: Optional[str] = None
    line_items: list[GRNLineItemCreate]


class GRNUpdate(BaseModel):
    contact_id: Optional[UUID] = None
    grn_number: Optional[str] = None
    purchase_order_id: Optional[UUID] = None
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
    purchase_order_id: Optional[UUID]
    status: str
    received_date: datetime
    currency: str
    notes: Optional[str]
    created_at: datetime
    line_items: list[GRNLineItemResponse]
    model_config = {"from_attributes": True}


def _gen_grn_number() -> str:
    now = datetime.now(timezone.utc)
    return f"GRN-{now.strftime('%Y%m')}-{random.randint(1000, 9999)}"


@router.get("", response_model=list[GRNResponse])
async def list_grns(
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    q = select(GoodsReceivedNote).options(selectinload(GoodsReceivedNote.line_items)).where(
        GoodsReceivedNote.organization_id == current_user["org_id"]
    ).order_by(GoodsReceivedNote.created_at.desc())
    if status:
        q = q.where(GoodsReceivedNote.status == status)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("", response_model=GRNResponse, status_code=201)
async def create_grn(
    payload: GRNCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    org_id = current_user["org_id"]

    if payload.grn_number:
        existing = (await db.execute(select(GoodsReceivedNote.id).where(GoodsReceivedNote.organization_id == org_id, GoodsReceivedNote.grn_number == payload.grn_number))).first()
        if existing:
            raise HTTPException(status_code=400, detail="GRN number already in use")
        grn_number = payload.grn_number
    else:
        grn_number = _gen_grn_number()

    grn = GoodsReceivedNote(
        organization_id=org_id,
        contact_id=payload.contact_id,
        grn_number=grn_number,
        purchase_order_id=payload.purchase_order_id,
        received_date=payload.received_date,
        currency=payload.currency,
        notes=payload.notes,
    )
    db.add(grn)
    await db.flush()

    for i, item in enumerate(payload.line_items):
        line = GRNLineItem(
            grn_id=grn.id,
            description=item.description,
            quantity_ordered=item.quantity_ordered,
            quantity_received=item.quantity_received,
            unit_price=item.unit_price,
            sort_order=i,
        )
        db.add(line)

    await db.commit()
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
    current_user: dict = Depends(get_current_user),
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
        line_items_data = update_data.pop("line_items")
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
    current_user: dict = Depends(get_current_user),
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

    grn.status = status
    await db.commit()
    return {"status": grn.status}


@router.delete("/{grn_id}", status_code=204)
async def delete_grn(
    grn_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
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
    await db.execute(delete(GRNLineItem).where(GRNLineItem.grn_id == grn_id))
    await db.delete(grn)
    await db.commit()
