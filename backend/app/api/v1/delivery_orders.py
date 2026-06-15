from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload
from uuid import UUID
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import (
    DeliveryOrder, DeliveryOrderLineItem,
)
from app.schemas.schemas import (
    DeliveryOrderCreate, DeliveryOrderUpdate, DeliveryOrderResponse,
)
from app.core.sequences import next_sequence_number
from .sales import calc_totals

router = APIRouter(tags=["Sales"])


# ═══════════════════════════════════════════════
# DELIVERY ORDERS
# ═══════════════════════════════════════════════
@router.get("/delivery-orders", response_model=list[DeliveryOrderResponse])
async def list_delivery_orders(status: str | None = None, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    org_id = current_user["org_id"]
    q = select(DeliveryOrder).options(selectinload(DeliveryOrder.line_items)).where(DeliveryOrder.organization_id == org_id).order_by(DeliveryOrder.created_at.desc())
    if status:
        q = q.where(DeliveryOrder.status == status)
    return (await db.execute(q)).scalars().all()


@router.post("/delivery-orders", response_model=DeliveryOrderResponse, status_code=201)
async def create_delivery_order(data: DeliveryOrderCreate, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
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
async def update_delivery_order(do_id: UUID, data: DeliveryOrderUpdate, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
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
        subtotal = 0.0
        discount_total = 0.0
        tax_amount = 0.0
        for i, item in enumerate(line_items_data):
            line_total = item["quantity"] * item["unit_price"]
            disc_mode = item.get("discount_mode", "percent") or "percent"
            disc_raw = item.get("discount", 0) or 0
            line_disc = min(disc_raw, line_total) if disc_mode == "amount" else line_total * disc_raw / 100
            after_disc = line_total - line_disc
            line_tax = after_disc * (item["tax_rate"] / 100)
            subtotal += after_disc
            discount_total += line_disc
            tax_amount += line_tax
            db.add(DeliveryOrderLineItem(
                delivery_order_id=obj.id, description=item["description"], quantity=item["quantity"],
                unit_price=item["unit_price"], discount=disc_raw, discount_mode=disc_mode,
                tax_rate=item["tax_rate"], tax_code_id=item.get("tax_code_id"),
                amount=after_disc + line_tax,
                sort_order=i,
            ))
        obj.subtotal = subtotal
        obj.discount_amount = discount_total
        obj.tax_amount = tax_amount
        obj.total = subtotal - discount_total + tax_amount

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
async def update_delivery_order_status(do_id: UUID, status: str, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DeliveryOrder).where(DeliveryOrder.id == do_id, DeliveryOrder.organization_id == current_user["org_id"]))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Delivery order not found")
    valid = {"draft", "sent", "delivered", "cancelled"}
    if status not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid)}")
    obj.status = status
    await db.commit()
    return {"id": str(do_id), "status": status}


@router.delete("/delivery-orders/{do_id}", status_code=204)
async def delete_delivery_order(do_id: UUID, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DeliveryOrder).where(DeliveryOrder.id == do_id, DeliveryOrder.organization_id == current_user["org_id"]))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Delivery order not found")
    if obj.status not in ("draft", "cancelled"):
        raise HTTPException(status_code=400, detail="Only draft or cancelled delivery orders can be deleted")
    await db.delete(obj)
    await db.commit()


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
