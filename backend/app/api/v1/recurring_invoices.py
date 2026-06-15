from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta
from uuid import UUID
from typing import Any

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import require_write
from app.core.pagination import PaginationParams, paginated_result, apply_sort
from app.core.audit import log_audit
from app.models.models import RecurringInvoice, Contact
from app.models.sales import Invoice, InvoiceLineItem
from app.core.sequences import next_sequence_number

router = APIRouter(prefix="/recurring-invoices", tags=["recurring-invoices"])


class RecurringInvoiceCreate(BaseModel):
    contact_id: UUID
    frequency: str                # daily | weekly | monthly | yearly
    frequency_interval: int = 1
    start_date: datetime
    end_date: datetime | None = None
    due_days: int = 30
    currency: str = "MYR"
    notes: str | None = None
    line_items: list[dict[str, Any]] = []
    tax_inclusive: bool = False
    auto_send: bool = False
    max_runs: int | None = None


class RecurringInvoiceUpdate(BaseModel):
    contact_id: UUID | None = None
    frequency: str | None = None
    frequency_interval: int | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    due_days: int | None = None
    currency: str | None = None
    notes: str | None = None
    line_items: list[dict[str, Any]] | None = None
    tax_inclusive: bool | None = None
    auto_send: bool | None = None
    max_runs: int | None = None


class RecurringInvoiceResponse(BaseModel):
    id: UUID
    organization_id: UUID
    contact_id: UUID
    status: str
    frequency: str
    frequency_interval: int
    start_date: datetime
    end_date: datetime | None
    next_run_date: datetime
    last_run_date: datetime | None
    run_count: int
    max_runs: int | None
    currency: str
    due_days: int
    notes: str | None
    line_items: list[dict]
    tax_inclusive: bool
    auto_send: bool
    created_at: datetime
    model_config = {"from_attributes": True}


def _calc_next_run(start: datetime, frequency: str, interval: int, from_date: datetime | None = None) -> datetime:
    from dateutil.relativedelta import relativedelta
    base = from_date or start
    if frequency == "daily":
        return base + relativedelta(days=interval)
    elif frequency == "weekly":
        return base + relativedelta(weeks=interval)
    elif frequency == "monthly":
        return base + relativedelta(months=interval)
    elif frequency == "yearly":
        return base + relativedelta(years=interval)
    return base


@router.get("")
async def list_recurring(
    status: str | None = None,
    contact_id: UUID | None = None,
    p: PaginationParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    org_id = current_user["org_id"]
    base = select(RecurringInvoice).where(RecurringInvoice.organization_id == org_id)
    if status:
        base = base.where(RecurringInvoice.status == status)
    if contact_id:
        base = base.where(RecurringInvoice.contact_id == contact_id)
    if p.search:
        # RecurringInvoice has no number/name field — search by linked contact name.
        like = f"%{p.search}%"
        contact_match = select(Contact.id).where(
            Contact.organization_id == org_id, Contact.name.ilike(like)
        )
        base = base.where(RecurringInvoice.contact_id.in_(contact_match))
    if p.date_from:
        base = base.where(RecurringInvoice.start_date >= p.date_from)
    if p.date_to:
        base = base.where(RecurringInvoice.start_date <= p.date_to)

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    query = apply_sort(base, RecurringInvoice, p, "next_run_date").offset(p.offset).limit(p.limit)
    items = (await db.execute(query)).scalars().all()
    items = [RecurringInvoiceResponse.model_validate(i) for i in items]
    return paginated_result(items, total, p)


@router.post("", response_model=RecurringInvoiceResponse, status_code=201)
async def create_recurring(
    payload: RecurringInvoiceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    next_run = _calc_next_run(payload.start_date, payload.frequency, payload.frequency_interval)
    ri = RecurringInvoice(
        organization_id=current_user["org_id"],
        contact_id=payload.contact_id,
        frequency=payload.frequency,
        frequency_interval=payload.frequency_interval,
        start_date=payload.start_date,
        end_date=payload.end_date,
        next_run_date=next_run,
        due_days=payload.due_days,
        currency=payload.currency,
        notes=payload.notes,
        line_items=payload.line_items,
        tax_inclusive=payload.tax_inclusive,
        auto_send=payload.auto_send,
        max_runs=payload.max_runs,
    )
    db.add(ri)
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "create", "recurring_invoice", rec.id)
    await db.refresh(ri)
    return ri


@router.get("/{ri_id}", response_model=RecurringInvoiceResponse)
async def get_recurring(
    ri_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(RecurringInvoice).where(
            RecurringInvoice.id == ri_id,
            RecurringInvoice.organization_id == current_user["org_id"],
        )
    )
    ri = result.scalar_one_or_none()
    if not ri:
        raise HTTPException(status_code=404, detail="Not found")
    return ri


@router.patch("/{ri_id}", response_model=RecurringInvoiceResponse)
async def update_recurring(
    ri_id: UUID,
    data: RecurringInvoiceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    result = await db.execute(
        select(RecurringInvoice).where(
            RecurringInvoice.id == ri_id,
            RecurringInvoice.organization_id == current_user["org_id"],
        )
    )
    ri = result.scalar_one_or_none()
    if not ri:
        raise HTTPException(status_code=404, detail="Not found")

    update_data = data.model_dump(exclude_unset=True)

    if "line_items" in update_data:
        ri.line_items = update_data.pop("line_items")

    # Recalculate next_run_date if schedule fields changed
    freq = update_data.get("frequency", ri.frequency)
    interval = update_data.get("frequency_interval", ri.frequency_interval)
    start = update_data.get("start_date", ri.start_date)
    if any(k in update_data for k in ("frequency", "frequency_interval", "start_date")):
        ri.next_run_date = _calc_next_run(start, freq, interval)

    for key, value in update_data.items():
        setattr(ri, key, value)

    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "update", "recurring_invoice", rec_id)
    await db.refresh(ri)
    return ri


@router.patch("/{ri_id}/pause", response_model=RecurringInvoiceResponse)
async def pause_recurring(
    ri_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    result = await db.execute(
        select(RecurringInvoice).where(
            RecurringInvoice.id == ri_id,
            RecurringInvoice.organization_id == current_user["org_id"],
        )
    )
    ri = result.scalar_one_or_none()
    if not ri:
        raise HTTPException(status_code=404, detail="Not found")
    ri.status = "paused"
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "pause", "recurring_invoice", rec_id)
    await db.refresh(ri)
    return ri


@router.patch("/{ri_id}/resume", response_model=RecurringInvoiceResponse)
async def resume_recurring(
    ri_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    result = await db.execute(
        select(RecurringInvoice).where(
            RecurringInvoice.id == ri_id,
            RecurringInvoice.organization_id == current_user["org_id"],
        )
    )
    ri = result.scalar_one_or_none()
    if not ri:
        raise HTTPException(status_code=404, detail="Not found")
    ri.status = "active"
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "resume", "recurring_invoice", rec_id)
    await db.refresh(ri)
    return ri


@router.delete("/{ri_id}", status_code=204)
async def cancel_recurring(
    ri_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    result = await db.execute(
        select(RecurringInvoice).where(
            RecurringInvoice.id == ri_id,
            RecurringInvoice.organization_id == current_user["org_id"],
        )
    )
    ri = result.scalar_one_or_none()
    if not ri:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(ri)
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "cancel", "recurring_invoice", rec_id)


@router.get("/{ri_id}/activity")
async def recurring_invoice_activity(ri_id: UUID, current_user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    org_id = current_user["org_id"]
    result = await db.execute(select(RecurringInvoice).where(RecurringInvoice.id == ri_id, RecurringInvoice.organization_id == org_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Not found")
    events: list[dict] = [{
        "ts": obj.start_date.isoformat() if obj.start_date else None,
        "type": "issued", "ref": getattr(obj, "template_name", str(obj.id)), "ref_id": str(obj.id),
        "delta": float(obj.total or 0), "note": "", "status": obj.status,
        "balance": float(obj.total or 0),
    }]
    return {"total": float(obj.total or 0), "events": events}


@router.post("/{ri_id}/run-now", response_model=dict)
async def run_recurring_now(
    ri_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    """Immediately generate an invoice from this recurring template and advance next_run_date."""
    org_id = current_user["org_id"]
    result = await db.execute(
        select(RecurringInvoice).where(RecurringInvoice.id == ri_id, RecurringInvoice.organization_id == org_id)
    )
    ri = result.scalar_one_or_none()
    if not ri:
        raise HTTPException(status_code=404, detail="Not found")
    if ri.status != "active":
        raise HTTPException(status_code=400, detail="Only active recurring invoices can be run now")

    now = datetime.now(timezone.utc)
    inv_number = await next_sequence_number(db, Invoice, Invoice.invoice_number, org_id, "INV")
    invoice = Invoice(
        organization_id=org_id,
        contact_id=ri.contact_id,
        invoice_number=inv_number,
        issue_date=now,
        due_date=now + timedelta(days=ri.due_days or 30),
        currency=ri.currency,
        notes=ri.notes,
        status="draft",
        subtotal=0,
        tax_amount=0,
        total=0,
    )
    db.add(invoice)
    await db.flush()

    subtotal = 0.0
    tax_total = 0.0
    for idx, li in enumerate(ri.line_items or []):
        qty = float(li.get("quantity", 1) or 1)
        price = float(li.get("unit_price", 0) or 0)
        discount = float(li.get("discount", 0) or 0)
        mode = li.get("discount_mode", "percent")
        tax_rate = float(li.get("tax_rate", 0) or 0)
        gross = qty * price
        disc = gross * discount / 100 if mode == "percent" else min(discount, gross)
        after_disc = gross - disc
        tax = after_disc * tax_rate / 100
        subtotal += after_disc
        tax_total += tax
        line = InvoiceLineItem(
            invoice_id=invoice.id,
            description=li.get("description", ""),
            quantity=qty,
            unit_price=price,
            discount=discount,
            discount_mode=mode,
            tax_rate=tax_rate,
            amount=round(after_disc, 2),
            sort_order=idx,
        )
        db.add(line)

    invoice.subtotal = round(subtotal, 2)
    invoice.tax_amount = round(tax_total, 2)
    invoice.total = round(subtotal + tax_total, 2)

    ri.last_run_date = now
    ri.run_count = (ri.run_count or 0) + 1
    ri.next_run_date = _calc_next_run(ri.start_date, ri.frequency, ri.frequency_interval, ri.next_run_date)

    if ri.max_runs and ri.run_count >= ri.max_runs:
        ri.status = "completed"

    await db.commit()
    await log_audit(db, org_id, current_user["sub"], "run_now", "recurring_invoice", ri_id)
    return {"invoice_id": str(invoice.id), "invoice_number": inv_number, "next_run_date": ri.next_run_date.isoformat()}
