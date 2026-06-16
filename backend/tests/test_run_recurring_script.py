"""
Task 1: recurring-invoice sweep idempotency (the logic the Railway cron script runs).

The script app.scripts.run_recurring calls app.tasks.recurring_tasks._fire_all_due.
This test seeds one active template due yesterday, runs the sweep, asserts exactly
one invoice was generated and next_run_date advanced past now, then runs the sweep
AGAIN and asserts no second invoice (idempotency — a double-fire / same-day re-run
must not double-generate).

Uses the NullPool test session (conftest) so it is cross-event-loop safe.
"""
import uuid
import pytest
from datetime import datetime, timezone, timedelta

from sqlalchemy import select, func
from tests.conftest import async_session
from app.models.settings import Contact
from app.models.models import RecurringInvoice, Invoice

pytestmark = pytest.mark.asyncio


async def _seed_due_template(org_id) -> uuid.UUID:
    async with async_session() as s:
        c = Contact(organization_id=org_id, name=f"Cust {uuid.uuid4().hex[:6]}", type="customer", entity_type="company")
        s.add(c)
        await s.flush()
        now = datetime.now(timezone.utc)
        ri = RecurringInvoice(
            organization_id=org_id,
            contact_id=c.id,
            frequency="monthly",
            frequency_interval=1,
            start_date=now - timedelta(days=40),
            next_run_date=now - timedelta(days=1),   # due yesterday
            status="active",
            due_days=30,
            currency="MYR",
            line_items=[{"description": "Sub", "quantity": 1, "unit_price": 99.0, "discount": 0, "discount_mode": "percent", "tax_rate": 0}],
        )
        s.add(ri)
        await s.commit()
        return ri.id


async def _invoice_count(org_id) -> int:
    async with async_session() as s:
        return (await s.execute(
            select(func.count()).select_from(Invoice).where(Invoice.organization_id == org_id)
        )).scalar() or 0


async def test_sweep_generates_then_is_idempotent(org_with_defaults, monkeypatch):
    org_id = org_with_defaults["org_id"]
    ri_id = await _seed_due_template(org_id)

    import app.tasks.recurring_tasks as rt
    monkeypatch.setattr(rt, "async_session", async_session)  # cross-loop-safe engine

    before = await _invoice_count(org_id)

    # First sweep: generates exactly one invoice and advances next_run_date.
    r1 = await rt._fire_all_due()
    assert r1["generated"] >= 1, r1
    after_first = await _invoice_count(org_id)
    assert after_first == before + 1, f"expected exactly 1 new invoice, got {after_first - before}"

    async with async_session() as s:
        ri = (await s.execute(select(RecurringInvoice).where(RecurringInvoice.id == ri_id))).scalar_one()
        assert ri.next_run_date > datetime.now(timezone.utc), "next_run_date must advance into the future"

    # Second sweep same day: the template is no longer due -> no new invoice.
    r2 = await rt._fire_all_due()
    after_second = await _invoice_count(org_id)
    assert after_second == after_first, f"idempotency broken: {after_second - after_first} extra invoice(s) on re-run"
