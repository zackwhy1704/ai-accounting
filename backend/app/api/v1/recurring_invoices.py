from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from datetime import datetime
from uuid import UUID
from typing import Any

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import RecurringInvoice

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


@router.get("", response_model=list[RecurringInvoiceResponse])
async def list_recurring(
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    q = select(RecurringInvoice).where(RecurringInvoice.organization_id == current_user["org_id"])
    if status:
        q = q.where(RecurringInvoice.status == status)
    q = q.order_by(RecurringInvoice.next_run_date)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("", response_model=RecurringInvoiceResponse, status_code=201)
async def create_recurring(
    payload: RecurringInvoiceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
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


@router.patch("/{ri_id}/pause", response_model=RecurringInvoiceResponse)
async def pause_recurring(
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
    ri.status = "paused"
    await db.commit()
    await db.refresh(ri)
    return ri


@router.patch("/{ri_id}/resume", response_model=RecurringInvoiceResponse)
async def resume_recurring(
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
    ri.status = "active"
    await db.commit()
    await db.refresh(ri)
    return ri


@router.delete("/{ri_id}", status_code=204)
async def cancel_recurring(
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
    ri.status = "cancelled"
    await db.commit()
