from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func, or_
from sqlalchemy.orm import selectinload
from uuid import UUID
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import require_write
from app.core.pagination import PaginationParams, paginated_result, apply_sort
from app.models.models import (
    DeliveryOrder, DeliveryOrderLineItem, Contact,
)
from app.schemas.schemas import (
    DeliveryOrderCreate, DeliveryOrderUpdate, DeliveryOrderResponse,
)
from app.core.sequences import next_sequence_number
from app.core.line_items import calculate_line_items
from app.core.audit import log_audit
from .sales import calc_totals

router = APIRouter(tags=["Sales"])


# ═══════════════════════════════════════════════
# DELIVERY ORDERS
# ═══════════════════════════════════════════════
@router.get("/delivery-orders")
async def list_delivery_orders(
    status: str | None = None,
    contact_id: UUID | None = None,
    p: PaginationParams = Depends(),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = current_user["org_id"]
    base = select(DeliveryOrder).where(DeliveryOrder.organization_id == org_id)
    if status:
        base = base.where(DeliveryOrder.status == status)
    if contact_id:
        base = base.where(DeliveryOrder.contact_id == contact_id)
    if p.search:
        like = f"%{p.search}%"
        contact_match = select(Contact.id).where(
            Contact.organization_id == org_id, Contact.name.ilike(like)
        )
        base = base.where(or_(
            DeliveryOrder.delivery_number.ilike(like),
            DeliveryOrder.contact_id.in_(contact_match),
        ))
    if p.date_from:
        base = base.where(DeliveryOrder.delivery_date >= p.date_from)
    if p.date_to:
        base = base.where(DeliveryOrder.delivery_date <= p.date_to)

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    query = apply_sort(base, DeliveryOrder, p).options(selectinload(DeliveryOrder.line_items)).offset(p.offset).limit(p.limit)
    items = (await db.execute(query)).scalars().all()
    items = [DeliveryOrderResponse.model_validate(i) for i in items]
    return paginated_result(items, total, p)


@router.post("/delivery-orders", response_model=DeliveryOrderResponse, status_code=201)
async def create_delivery_order(data: DeliveryOrderCreate, current_user: dict = Depends(require_write()), db: AsyncSession = Depends(get_db)):
    org_id = current_user["org_id"]
    if data.delivery_number:
        existing = (await db.execute(select(DeliveryOrder.id).where(DeliveryOrder.organization_id == org_id, DeliveryOrder.delivery_number == data.delivery_number))).first()
        if existing:
            raise HTTPException(status_code=400, detail="Delivery number already in use")
        delivery_number = data.delivery_number
    else:
        delivery_number = await next_sequence_number(db, DeliveryOrder, DeliveryOrder.delivery_number, org_id, "DO")
    subtotal, discount_total, tax_amount = calc_totals(data.line_items)

    obj = DeliveryOrder(
        organization_id=org_id, contact_id=data.contact_id,
        invoice_id=data.invoice_id, quotation_id=data.quotation_id, sales_order_id=data.sales_order_id,
        delivery_number=delivery_number, delivery_date=data.delivery_date,
        ship_to_address=data.ship_to_address, deliver_to_address=data.deliver_to_address,
        reference=data.reference, subtotal=subtotal, discount_amount=discount_total,
        tax_amount=tax_amount, total=subtotal - discount_total + tax_amount,
        currency=data.currency, notes=data.notes,
    )
    db.add(obj)
    await db.flush()
    for i, item in enumerate(data.line_items):
        line_total = item.quantity * item.unit_price
        disc_mode = getattr(item, 'discount_mode', 'percent') or 'percent'
        line_disc = min(item.discount, line_total) if disc_mode == 'amount' else line_total * item.discount / 100
        after_disc = line_total - line_disc
        db.add(DeliveryOrderLineItem(
            delivery_order_id=obj.id, description=item.description, quantity=item.quantity,
            unit_price=item.unit_price, discount=item.discount, discount_mode=disc_mode,
            tax_rate=item.tax_rate, tax_code_id=item.tax_code_id,
            amount=after_disc + after_disc * (item.tax_rate / 100),
            sort_order=i,
        ))
    await db.commit()
    await log_audit(db, org_id, current_user["sub"], "create", "delivery_order", obj.id)
    result = await db.execute(
        select(DeliveryOrder).options(selectinload(DeliveryOrder.line_items)).where(DeliveryOrder.id == obj.id)
    )
    return result.scalar_one()


@router.get("/delivery-orders/{do_id}", response_model=DeliveryOrderResponse)
async def get_delivery_order(do_id: UUID, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DeliveryOrder).options(selectinload(DeliveryOrder.line_items))
        .where(DeliveryOrder.id == do_id, DeliveryOrder.organization_id == current_user["org_id"])
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Delivery order not found")
    return obj


@router.patch("/delivery-orders/{do_id}", response_model=DeliveryOrderResponse)
async def update_delivery_order(do_id: UUID, data: DeliveryOrderUpdate, current_user: dict = Depends(require_write()), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DeliveryOrder)
        .options(selectinload(DeliveryOrder.line_items))
        .where(DeliveryOrder.id == do_id, DeliveryOrder.organization_id == current_user["org_id"])
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Delivery order not found")
    if obj.status in ("void", "cancelled"):
        raise HTTPException(status_code=400, detail="Voided or cancelled delivery orders cannot be edited")

    update_data = data.model_dump(exclude_unset=True)

    if "line_items" in update_data:
        line_items_data = update_data.pop("line_items")
        await db.execute(delete(DeliveryOrderLineItem).where(DeliveryOrderLineItem.delivery_order_id == obj.id))
        subtotal, tax_amount, discount_total, total = calculate_line_items(line_items_data)
        for i, item in enumerate(line_items_data):
            db.add(DeliveryOrderLineItem(
                delivery_order_id=obj.id,
                description=item.get("description", ""),
                quantity=item.get("quantity", 1),
                unit_price=item.get("unit_price", 0),
                discount=item.get("discount", 0),
                discount_mode=item.get("discount_mode", "percent"),
                tax_rate=item.get("tax_rate", 0),
                tax_code_id=item.get("tax_code_id"),
                amount=item.get("amount", 0),
                sort_order=i,
            ))
        obj.subtotal = subtotal
        obj.discount_amount = discount_total
        obj.tax_amount = tax_amount
        obj.total = total

    new_num = update_data.get("delivery_number")
    if new_num and new_num != obj.delivery_number:
        existing = (await db.execute(select(DeliveryOrder.id).where(DeliveryOrder.organization_id == obj.organization_id, DeliveryOrder.delivery_number == new_num, DeliveryOrder.id != obj.id))).first()
        if existing:
            raise HTTPException(status_code=400, detail="Delivery number already in use")

    for key, value in update_data.items():
        setattr(obj, key, value)

    await db.commit()
    result2 = await db.execute(
        select(DeliveryOrder).options(selectinload(DeliveryOrder.line_items)).where(DeliveryOrder.id == obj.id)
    )
    return result2.scalar_one()


@router.patch("/delivery-orders/{do_id}/status")
async def update_delivery_order_status(do_id: UUID, status: str, current_user: dict = Depends(require_write()), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DeliveryOrder).where(DeliveryOrder.id == do_id, DeliveryOrder.organization_id == current_user["org_id"]))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Delivery order not found")
    valid = {"draft", "sent", "delivered", "cancelled"}
    if status not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid)}")
    obj.status = status
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "status_change", "delivery_order", do_id)
    return {"id": str(do_id), "status": status}


@router.delete("/delivery-orders/{do_id}", status_code=204)
async def delete_delivery_order(do_id: UUID, current_user: dict = Depends(require_write()), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DeliveryOrder).where(DeliveryOrder.id == do_id, DeliveryOrder.organization_id == current_user["org_id"]))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Delivery order not found")
    if obj.status not in ("draft", "cancelled"):
        raise HTTPException(status_code=400, detail="Only draft or cancelled delivery orders can be deleted")
    await db.delete(obj)
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "delete", "delivery_order", do_id)


def _build_events(events: list[dict]) -> dict:
    events.sort(key=lambda e: (e.get("ts") or ""))
    running = 0.0
    for ev in events:
        running += ev.get("delta", 0.0)
        ev["balance"] = round(running, 2)
    return {"total": round(running, 2), "events": events}


@router.get("/delivery-orders/{do_id}/activity")
async def delivery_order_activity(do_id: UUID, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    org_id = current_user["org_id"]
    result = await db.execute(select(DeliveryOrder).where(DeliveryOrder.id == do_id, DeliveryOrder.organization_id == org_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Delivery order not found")
    events: list[dict] = [{
        "ts": obj.delivery_date.isoformat() if obj.delivery_date else None,
        "type": "issued", "ref": obj.delivery_number, "ref_id": str(obj.id),
        "delta": float(obj.total or 0), "note": obj.notes or "", "status": obj.status,
    }]
    return _build_events(events)
