"""
Celery task: fire due recurring invoices across ALL organizations.

Runs daily via beat (see celery_app.beat_schedule). Mirrors the per-org
POST /recurring-invoices/run-due endpoint, but sweeps every org so recurring
invoices fire automatically without a human clicking "Run All Due".
"""
import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select

from app.tasks.celery_app import celery_app
from app.core.database import async_session
from app.models.models import RecurringInvoice
from app.api.v1.recurring_invoices import _materialize_invoice

logger = logging.getLogger(__name__)

MAX_CATCHUP = 24  # bound back-fill per template (matches the endpoint)


async def _fire_all_due() -> dict:
    now = datetime.now(timezone.utc)
    total_generated = 0
    orgs_touched = 0
    async with async_session() as db:
        due = (await db.execute(
            select(RecurringInvoice).where(
                RecurringInvoice.status == "active",
                RecurringInvoice.next_run_date <= now,
            )
        )).scalars().all()
        seen_orgs = set()
        for ri in due:
            guard = 0
            while ri.status == "active" and ri.next_run_date and ri.next_run_date <= now and guard < MAX_CATCHUP:
                await _materialize_invoice(db, ri, now)
                total_generated += 1
                guard += 1
            seen_orgs.add(ri.organization_id)
        orgs_touched = len(seen_orgs)
        await db.commit()
    logger.info("Recurring sweep: generated %d invoice(s) across %d org(s)", total_generated, orgs_touched)
    return {"generated": total_generated, "orgs": orgs_touched}


@celery_app.task(name="app.tasks.recurring_tasks.fire_due_recurring_invoices")
def fire_due_recurring_invoices():
    """Generate invoices for every active recurring template that is due (all orgs)."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(_fire_all_due())
    finally:
        loop.close()
