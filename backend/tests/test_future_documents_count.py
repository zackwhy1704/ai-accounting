"""
GET /reports/future-documents-count backs the "N future-dated documents not
shown in this range" hint on report pages — proves a future-dated,
correctly-recorded invoice isn't mistaken for a missing one.
"""
import uuid
import pytest
from datetime import datetime, timezone, timedelta

from tests.conftest import async_session
from app.models.settings import Contact

pytestmark = pytest.mark.asyncio


async def _make_contact(org_id, name="Test Customer") -> uuid.UUID:
    async with async_session() as s:
        c = Contact(organization_id=org_id, name=name, type="customer", entity_type="company")
        s.add(c)
        await s.commit()
        return c.id


class TestFutureDocumentsCount:
    async def test_counts_future_dated_invoice(self, client, org_with_defaults):
        org_id = org_with_defaults["org_id"]
        contact_id = await _make_contact(org_id)
        now = datetime.now(timezone.utc)
        future = now + timedelta(days=200)

        # One invoice today (within range), one far in the future (outside range).
        await client.post("/invoices", json={
            "contact_id": str(contact_id),
            "issue_date": now.isoformat(), "due_date": (now + timedelta(days=30)).isoformat(),
            "currency": "MYR",
            "line_items": [{"description": "In range", "quantity": 1, "unit_price": 100.0, "tax_rate": 0.0}],
        })
        r = await client.post("/invoices", json={
            "contact_id": str(contact_id),
            "issue_date": future.isoformat(), "due_date": future.isoformat(),
            "currency": "MYR",
            "line_items": [{"description": "Future", "quantity": 1, "unit_price": 100.0, "tax_rate": 0.0}],
        })
        assert r.status_code == 201, r.text
        await client.patch(f"/invoices/{r.json()['id']}/status", params={"status": "sent"})

        cutoff = now.strftime("%Y-%m-%d")
        r = await client.get("/reports/future-documents-count", params={"after": cutoff})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["invoices"] == 1, body
        assert body["total"] == 1

    async def test_zero_when_nothing_in_future(self, client, org_with_defaults):
        org_id = org_with_defaults["org_id"]
        contact_id = await _make_contact(org_id)
        now = datetime.now(timezone.utc)

        await client.post("/invoices", json={
            "contact_id": str(contact_id),
            "issue_date": now.isoformat(), "due_date": (now + timedelta(days=30)).isoformat(),
            "currency": "MYR",
            "line_items": [{"description": "In range", "quantity": 1, "unit_price": 100.0, "tax_rate": 0.0}],
        })

        cutoff = (now + timedelta(days=365)).strftime("%Y-%m-%d")
        r = await client.get("/reports/future-documents-count", params={"after": cutoff})
        assert r.status_code == 200, r.text
        assert r.json()["total"] == 0

    async def test_draft_invoices_excluded(self, client, org_with_defaults):
        """A draft invoice isn't a real posted document yet — shouldn't count."""
        org_id = org_with_defaults["org_id"]
        contact_id = await _make_contact(org_id)
        now = datetime.now(timezone.utc)
        future = now + timedelta(days=200)

        r = await client.post("/invoices", json={
            "contact_id": str(contact_id),
            "issue_date": future.isoformat(), "due_date": future.isoformat(),
            "currency": "MYR",
            "line_items": [{"description": "Draft future", "quantity": 1, "unit_price": 100.0, "tax_rate": 0.0}],
        })
        assert r.status_code == 201, r.text
        # Left as draft (default status) — never patched to "sent".

        cutoff = now.strftime("%Y-%m-%d")
        r = await client.get("/reports/future-documents-count", params={"after": cutoff})
        assert r.status_code == 200, r.text
        assert r.json()["total"] == 0
