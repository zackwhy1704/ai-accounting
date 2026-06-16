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
    failed = 0
    seen_orgs = set()

    # 1) Collect due template IDs in one short-lived session.
    async with async_session() as db:
        due_ids = (await db.execute(
            select(RecurringInvoice.id).where(
                RecurringInvoice.status == "active",
                RecurringInvoice.next_run_date <= now,
            )
        )).scalars().all()

    # 2) Process each template in its OWN session, so a failure (and its rollback)
    #    can never expire/poison the objects of other templates. This isolates a
    #    bad template from the rest of the daily sweep.
    for ri_id in due_ids:
        try:
            async with async_session() as db:
                ri = (await db.execute(
                    select(RecurringInvoice).where(RecurringInvoice.id == ri_id)
                )).scalar_one_or_none()
                if ri is None:
                    continue
                guard = 0
                while guard < MAX_CATCHUP and ri.status == "active" and ri.next_run_date and ri.next_run_date <= now:
                    # Call via module global so tests can monkeypatch the materializer.
                    await globals()["_materialize_invoice"](db, ri, now)
                    total_generated += 1
                    guard += 1
                if ri.organization_id is not None:
                    seen_orgs.add(ri.organization_id)
                await db.commit()
        except Exception as e:
            failed += 1
            logger.error("Recurring template %s failed during sweep: %s", ri_id, e)
    orgs_touched = len(seen_orgs)
    logger.info("Recurring sweep: generated %d invoice(s) across %d org(s), %d failed",
                total_generated, orgs_touched, failed)
    return {"generated": total_generated, "orgs": orgs_touched, "failed": failed}


@celery_app.task(name="app.tasks.recurring_tasks.fire_due_recurring_invoices")
def fire_due_recurring_invoices():
    """Generate invoices for every active recurring template that is due (all orgs)."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(_fire_all_due())
    finally:
        loop.close()
