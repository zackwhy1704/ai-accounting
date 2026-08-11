"""
Sales Orders — the confirmed-order stage between quotation and invoice/DO.

The SalesOrder model, schemas and frontend hooks existed with no router (dead
code that 404'd); this completes the module. Orders post no GL — revenue books
when the invoice does. Convert creates a draft invoice from the order lines.
"""
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete, func, or_
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_audit
from app.core.database import get_db
from app.core.line_items import calculate_line_items
from app.core.pagination import PaginationParams, paginated_result, apply_sort
from app.core.permissions import require_write
from app.core.security import get_current_user
from app.core.sequences import next_sequence_number
from app.models.models import Contact, Invoice, InvoiceLineItem, SalesOrder, SalesOrderLineItem
from app.schemas.sales import SalesOrderCreate, SalesOrderResponse
from app.services.fx import document_rate

router = APIRouter(prefix="/sales-orders", tags=["sales-orders"])

VALID_STATUSES = {"draft", "confirmed", "fulfilled", "cancelled"}


@router.get("")
async def list_sales_orders(
    status: str | None = None,
    contact_id: UUID | None = None,
    p: PaginationParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    org_id = current_user["org_id"]
    base = select(SalesOrder).where(SalesOrder.organization_id == org_id)
    if status:
        base = base.where(SalesOrder.status == status)
    if contact_id:
        base = base.where(SalesOrder.contact_id == contact_id)
    if p.search:
        like = f"%{p.search}%"
        contact_match = select(Contact.id).where(
            Contact.organization_id == org_id, Contact.name.ilike(like)
        )
        base = base.where(or_(
            SalesOrder.order_number.ilike(like),
            SalesOrder.contact_id.in_(contact_match),
        ))
    if p.date_from:
        base = base.where(SalesOrder.issue_date >= p.date_from)
    if p.date_to:
        base = base.where(SalesOrder.issue_date <= p.date_to)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    rows = (await db.execute(
        apply_sort(base, SalesOrder, p).options(selectinload(SalesOrder.line_items)).offset(p.offset).limit(p.limit)
    )).scalars().all()
    items = [SalesOrderResponse.model_validate(r) for r in rows]
    return paginated_result(items, total, p)


def _totals(line_items) -> tuple[float, float, float, float]:
    items = [li.model_dump() for li in line_items]
    net_subtotal, tax, discount_total, total = calculate_line_items(items)
    return net_subtotal, tax, discount_total, total


@router.post("", response_model=SalesOrderResponse, status_code=201)
async def create_sales_order(
    data: SalesOrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    org_id = current_user["org_id"]
    contact = (await db.execute(
        select(Contact.id).where(Contact.id == data.contact_id, Contact.organization_id == org_id)
    )).scalar_one_or_none()
    if contact is None:
        raise HTTPException(status_code=404, detail="Contact not found")
    if not data.line_items:
        raise HTTPException(status_code=422, detail="At least one line item is required")

    subtotal, tax_amount, discount_total, total = _totals(data.line_items)
    so = SalesOrder(
        organization_id=org_id,
        contact_id=data.contact_id,
        quotation_id=data.quotation_id,
        order_number=await next_sequence_number(db, SalesOrder, SalesOrder.order_number, org_id, "SO"),
        issue_date=data.issue_date,
        delivery_date=data.delivery_date,
        reference=data.reference,
        subtotal=subtotal,
        discount_amount=discount_total,
        tax_amount=tax_amount,
        total=total,
        currency=data.currency,
        notes=data.notes,
    )
    db.add(so)
    await db.flush()
    for i, li in enumerate(data.line_items):
        db.add(SalesOrderLineItem(
            sales_order_id=so.id, description=li.description, quantity=li.quantity,
            unit_price=li.unit_price, tax_rate=li.tax_rate,
            discount=li.discount, amount=float(li.quantity) * float(li.unit_price),
            account_id=li.account_id, sort_order=i,
        ))
    await db.commit()
    await log_audit(db, org_id, current_user["sub"], "create", "sales_order", so.id)
    result = await db.execute(
        select(SalesOrder).options(selectinload(SalesOrder.line_items)).where(SalesOrder.id == so.id)
    )
    return result.scalar_one()


async def _load(db: AsyncSession, so_id: UUID, org_id) -> SalesOrder:
    so = (await db.execute(
        select(SalesOrder).options(selectinload(SalesOrder.line_items))
        .where(SalesOrder.id == so_id, SalesOrder.organization_id == org_id)
    )).scalar_one_or_none()
    if not so:
        raise HTTPException(status_code=404, detail="Sales order not found")
    return so


@router.get("/{so_id}", response_model=SalesOrderResponse)
async def get_sales_order(so_id: UUID, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    return await _load(db, so_id, current_user["org_id"])


@router.patch("/{so_id}/status")
async def update_sales_order_status(
    so_id: UUID,
    status: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    if status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {VALID_STATUSES}")
    so = await _load(db, so_id, current_user["org_id"])
    so.status = status
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "status_change", "sales_order", so_id, {"status": status})
    return {"status": so.status}


@router.delete("/{so_id}", status_code=204)
async def delete_sales_order(so_id: UUID, db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_write())):
    so = await _load(db, so_id, current_user["org_id"])
    if so.status not in ("draft", "cancelled"):
        raise HTTPException(status_code=400, detail="Only draft or cancelled sales orders can be deleted")
    await db.execute(delete(SalesOrderLineItem).where(SalesOrderLineItem.sales_order_id == so.id))
    await db.delete(so)
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "delete", "sales_order", so_id)


@router.post("/{so_id}/convert")
async def convert_sales_order_to_invoice(
    so_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    """Create a draft invoice from the order lines and mark the order fulfilled."""
    org_id = current_user["org_id"]
    so = await _load(db, so_id, org_id)
    if so.status == "cancelled":
        raise HTTPException(status_code=400, detail="Cannot convert a cancelled sales order")

    now = datetime.now(timezone.utc)
    invoice = Invoice(
        organization_id=org_id,
        contact_id=so.contact_id,
        invoice_number=await next_sequence_number(db, Invoice, Invoice.invoice_number, org_id, "INV"),
        issue_date=now,
        due_date=so.delivery_date or now,
        subtotal=so.subtotal,
        tax_amount=so.tax_amount,
        total=so.total,
        currency=so.currency,
        exchange_rate=await document_rate(db, org_id, so.currency, now),
        notes=so.notes,
    )
    db.add(invoice)
    await db.flush()
    for i, li in enumerate(so.line_items):
        db.add(InvoiceLineItem(
            invoice_id=invoice.id, description=li.description, quantity=li.quantity,
            unit_price=li.unit_price, tax_rate=li.tax_rate, discount=li.discount,
            amount=li.amount, account_id=li.account_id, sort_order=i,
        ))
    so.status = "fulfilled"
    await db.commit()
    await log_audit(db, org_id, current_user["sub"], "convert", "sales_order", so_id, {"invoice_id": str(invoice.id)})
    return {"sales_order_id": str(so_id), "invoice_id": str(invoice.id), "invoice_number": invoice.invoice_number}
