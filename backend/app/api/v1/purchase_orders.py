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
from app.core.pagination import PaginationParams, paginated_result, apply_sort
from app.models.models import PurchaseOrder, PurchaseOrderLineItem, Contact

router = APIRouter(prefix="/purchase-orders", tags=["purchase-orders"])


class POLineItemCreate(BaseModel):
    description: str
    quantity: float = 1.0
    unit_price: float
    discount: float = 0.0
    discount_mode: str = "percent"
    tax_rate: float = 0.0
    tax_code_id: Optional[UUID] = None
    account_id: Optional[UUID] = None


class PurchaseOrderCreate(BaseModel):
    contact_id: UUID
    po_number: Optional[str] = None
    issue_date: datetime
    expected_date: Optional[datetime] = None
    currency: str = "SGD"
    notes: Optional[str] = None
    delivery_address: Optional[str] = None
    line_items: list[POLineItemCreate]


class PurchaseOrderUpdate(BaseModel):
    contact_id: Optional[UUID] = None
    po_number: Optional[str] = None
    issue_date: Optional[datetime] = None
    expected_date: Optional[datetime] = None
    currency: Optional[str] = None
    notes: Optional[str] = None
    delivery_address: Optional[str] = None
    line_items: Optional[list[POLineItemCreate]] = None


class POLineItemResponse(BaseModel):
    id: UUID
    description: str
    quantity: float
    unit_price: float
    discount: float = 0.0
    discount_mode: str = "percent"
    tax_rate: float
    tax_code_id: Optional[UUID] = None
    amount: float
    account_id: Optional[UUID]
    sort_order: int
    model_config = {"from_attributes": True}


class PurchaseOrderResponse(BaseModel):
    id: UUID
    organization_id: UUID
    contact_id: UUID
    po_number: str
    status: str
    issue_date: datetime
    expected_date: Optional[datetime]
    subtotal: float
    tax_amount: float
    total: float
    currency: str
    notes: Optional[str]
    delivery_address: Optional[str]
    created_at: datetime
    line_items: list[POLineItemResponse]
    model_config = {"from_attributes": True}


@router.get("")
async def list_purchase_orders(
    status: Optional[str] = None,
    contact_id: UUID | None = None,
    p: PaginationParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    org_id = current_user["org_id"]
    base = select(PurchaseOrder).where(PurchaseOrder.organization_id == org_id)
    if status:
        base = base.where(PurchaseOrder.status == status)
    if contact_id:
        base = base.where(PurchaseOrder.contact_id == contact_id)
    if p.search:
        like = f"%{p.search}%"
        contact_match = select(Contact.id).where(
            Contact.organization_id == org_id, Contact.name.ilike(like)
        )
        base = base.where(or_(
            PurchaseOrder.po_number.ilike(like),
            PurchaseOrder.contact_id.in_(contact_match),
        ))
    if p.date_from:
        base = base.where(PurchaseOrder.issue_date >= p.date_from)
    if p.date_to:
        base = base.where(PurchaseOrder.issue_date <= p.date_to)

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    query = apply_sort(base, PurchaseOrder, p).options(selectinload(PurchaseOrder.line_items)).offset(p.offset).limit(p.limit)
    items = (await db.execute(query)).scalars().all()
    items = [PurchaseOrderResponse.model_validate(i) for i in items]
    return paginated_result(items, total, p)


@router.post("", response_model=PurchaseOrderResponse, status_code=201)
async def create_purchase_order(
    payload: PurchaseOrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    org_id = current_user["org_id"]

    subtotal = 0.0
    tax_amount = 0.0
    for item in payload.line_items:
        amount = item.quantity * item.unit_price
        tax = amount * (item.tax_rate / 100)
        subtotal += amount
        tax_amount += tax

    if payload.po_number:
        existing = (await db.execute(select(PurchaseOrder.id).where(PurchaseOrder.organization_id == org_id, PurchaseOrder.po_number == payload.po_number))).first()
        if existing:
            raise HTTPException(status_code=400, detail="PO number already in use")
        po_number = payload.po_number
    else:
        from .sales import next_sequence_number
        po_number = await next_sequence_number(db, PurchaseOrder, PurchaseOrder.po_number, org_id, "PO")

    po = PurchaseOrder(
        organization_id=org_id,
        contact_id=payload.contact_id,
        po_number=po_number,
        issue_date=payload.issue_date,
        expected_date=payload.expected_date,
        subtotal=subtotal,
        tax_amount=tax_amount,
        total=subtotal + tax_amount,
        currency=payload.currency,
        notes=payload.notes,
        delivery_address=payload.delivery_address,
    )
    db.add(po)
    await db.flush()

    for i, item in enumerate(payload.line_items):
        disc = item.discount or 0.0
        line_total = item.quantity * item.unit_price
        disc_amt = min(disc, line_total) if item.discount_mode == "amount" else line_total * disc / 100
        after_disc = line_total - disc_amt
        line = PurchaseOrderLineItem(
            purchase_order_id=po.id,
            description=item.description,
            quantity=item.quantity,
            unit_price=item.unit_price,
            discount=disc,
            discount_mode=item.discount_mode,
            tax_rate=item.tax_rate,
            tax_code_id=item.tax_code_id,
            amount=after_disc * (1 + item.tax_rate / 100),
            account_id=item.account_id,
            sort_order=i,
        )
        db.add(line)

    await db.commit()
    result = await db.execute(
        select(PurchaseOrder).options(selectinload(PurchaseOrder.line_items)).where(PurchaseOrder.id == po.id)
    )
    return result.scalar_one()


@router.get("/{po_id}", response_model=PurchaseOrderResponse)
async def get_purchase_order(
    po_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(PurchaseOrder).options(selectinload(PurchaseOrder.line_items)).where(
            PurchaseOrder.id == po_id,
            PurchaseOrder.organization_id == current_user["org_id"],
        )
    )
    po = result.scalar_one_or_none()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    return po


@router.patch("/{po_id}", response_model=PurchaseOrderResponse)
async def update_purchase_order(
    po_id: UUID,
    data: PurchaseOrderUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(PurchaseOrder).where(
            PurchaseOrder.id == po_id,
            PurchaseOrder.organization_id == current_user["org_id"],
        )
    )
    po = result.scalar_one_or_none()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")

    update_data = data.model_dump(exclude_unset=True)

    if "po_number" in update_data and update_data["po_number"]:
        existing = (await db.execute(select(PurchaseOrder.id).where(PurchaseOrder.organization_id == current_user["org_id"], PurchaseOrder.po_number == update_data["po_number"], PurchaseOrder.id != po.id))).first()
        if existing:
            raise HTTPException(status_code=400, detail="PO number already in use")

    if "line_items" in update_data:
        line_items_data = update_data.pop("line_items")
        await db.execute(
            delete(PurchaseOrderLineItem).where(PurchaseOrderLineItem.purchase_order_id == po_id)
        )
        subtotal = 0.0
        tax_amount = 0.0
        for i, item in enumerate(data.line_items):
            disc = item.discount or 0.0
            line_total = item.quantity * item.unit_price
            disc_amt = min(disc, line_total) if item.discount_mode == "amount" else line_total * disc / 100
            after_disc = line_total - disc_amt
            tax = after_disc * (item.tax_rate / 100)
            subtotal += after_disc
            tax_amount += tax
            line = PurchaseOrderLineItem(
                purchase_order_id=po.id,
                description=item.description,
                quantity=item.quantity,
                unit_price=item.unit_price,
                discount=disc,
                discount_mode=item.discount_mode,
                tax_rate=item.tax_rate,
                tax_code_id=item.tax_code_id,
                amount=after_disc + tax,
                account_id=item.account_id,
                sort_order=i,
            )
            db.add(line)
        po.subtotal = subtotal
        po.tax_amount = tax_amount
        po.total = subtotal + tax_amount

    for key, value in update_data.items():
        setattr(po, key, value)

    await db.commit()
    result = await db.execute(
        select(PurchaseOrder).options(selectinload(PurchaseOrder.line_items)).where(PurchaseOrder.id == po_id)
    )
    return result.scalar_one()


@router.patch("/{po_id}/status")
async def update_po_status(
    po_id: UUID,
    status: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    valid = {"draft", "sent", "received", "billed", "declined", "cancelled"}
    if status not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid}")

    result = await db.execute(
        select(PurchaseOrder).where(
            PurchaseOrder.id == po_id,
            PurchaseOrder.organization_id == current_user["org_id"],
        )
    )
    po = result.scalar_one_or_none()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")

    po.status = status
    await db.commit()
    return {"status": po.status}


@router.delete("/{po_id}", status_code=204)
async def delete_purchase_order(
    po_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(PurchaseOrder).where(
            PurchaseOrder.id == po_id,
            PurchaseOrder.organization_id == current_user["org_id"],
        )
    )
    po = result.scalar_one_or_none()
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    if po.status not in ("draft", "cancelled"):
        raise HTTPException(status_code=400, detail="Only draft or cancelled purchase orders can be deleted")
    await db.delete(po)
    await db.commit()


@router.get("/{po_id}/activity")
async def purchase_order_activity(po_id: UUID, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    org_id = current_user["org_id"]
    result = await db.execute(select(PurchaseOrder).where(PurchaseOrder.id == po_id, PurchaseOrder.organization_id == org_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    events = [{
        "ts": obj.issue_date.isoformat() if obj.issue_date else None,
        "type": "issued", "ref": obj.po_number, "ref_id": str(obj.id),
        "delta": float(obj.total or 0), "note": obj.notes or "", "status": obj.status,
        "balance": float(obj.total or 0),
    }]
    return {"total": float(obj.total or 0), "events": events}
