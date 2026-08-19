"""
MyInvois submission must reject a document dated in the future — LHDN expects
the issue date to reflect the actual transaction date (~72h submission
window). Before this guard, einvoice.py passed issue_date straight through
with zero validation.
"""
import uuid
import pytest
from datetime import datetime, timezone, timedelta

from tests.conftest import async_session
from app.models.settings import Contact
from app.models.auth import Organization

pytestmark = pytest.mark.asyncio


async def _make_contact(org_id, name="Test Customer") -> uuid.UUID:
    async with async_session() as s:
        c = Contact(organization_id=org_id, name=name, type="customer", entity_type="company")
        s.add(c)
        await s.commit()
        return c.id


async def _enable_einvoice(org_id):
    async with async_session() as s:
        from sqlalchemy import select
        org = (await s.execute(select(Organization).where(Organization.id == org_id))).scalar_one()
        org.einvoice_enabled = True
        org.country = "MY"
        org.einvoice_supplier_tin = "C1234567890"
        await s.commit()


class TestFutureDatedSubmissionBlocked:
    async def test_future_dated_invoice_rejected(self, client, org_with_defaults):
        org_id = org_with_defaults["org_id"]
        await _enable_einvoice(org_id)
        contact_id = await _make_contact(org_id)
        future_date = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()

        r = await client.post("/invoices", json={
            "contact_id": str(contact_id),
            "issue_date": future_date, "due_date": future_date,
            "currency": "MYR",
            "line_items": [{"description": "X", "quantity": 1, "unit_price": 100.0, "tax_rate": 0.0}],
        })
        assert r.status_code == 201, r.text
        inv = r.json()
        await client.patch(f"/invoices/{inv['id']}/status", params={"status": "sent"})

        r = await client.post(f"/einvoice/submit/{inv['id']}")
        assert r.status_code == 400, r.text
        assert "future" in r.json()["detail"].lower()

    async def test_present_dated_invoice_not_blocked_by_date_guard(self, client, org_with_defaults):
        """The guard must not fire on a normal, correctly-dated invoice — it
        should fail later (network/LHDN-config reasons in this test env),
        not on the future-date check. Proves the guard is scoped correctly."""
        org_id = org_with_defaults["org_id"]
        await _enable_einvoice(org_id)
        contact_id = await _make_contact(org_id)
        now = datetime.now(timezone.utc)

        r = await client.post("/invoices", json={
            "contact_id": str(contact_id),
            "issue_date": now.isoformat(), "due_date": (now + timedelta(days=30)).isoformat(),
            "currency": "MYR",
            "line_items": [{"description": "X", "quantity": 1, "unit_price": 100.0, "tax_rate": 0.0}],
        })
        inv = r.json()
        await client.patch(f"/invoices/{inv['id']}/status", params={"status": "sent"})

        r = await client.post(f"/einvoice/submit/{inv['id']}")
        # Not blocked by the date guard specifically — whatever it fails on
        # (LHDN network/config in this test env), the message must not be
        # the future-date rejection.
        if r.status_code == 400:
            assert "is in the future" not in r.json().get("detail", "")
