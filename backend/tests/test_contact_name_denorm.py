"""
P2: list endpoints must return contact_name (denormalised), and it must work
regardless of contact count — the old client-side contactMap broke past the
50-contact first page. These tests prove the name comes back in the list payload.
"""
import uuid
import pytest
from datetime import datetime, timezone, timedelta

from tests.conftest import async_session
from app.models.settings import Contact

pytestmark = pytest.mark.asyncio


async def _make_contact(org_id, name) -> uuid.UUID:
    async with async_session() as s:
        c = Contact(organization_id=org_id, name=name, type="customer", entity_type="company")
        s.add(c)
        await s.commit()
        return c.id


class TestContactNameInListResponses:
    async def test_invoice_list_includes_contact_name(self, client, org_with_defaults):
        org_id = org_with_defaults["org_id"]
        contact_id = await _make_contact(org_id, "Acme Widgets Sdn Bhd")
        now = datetime.now(timezone.utc)
        await client.post("/invoices", json={
            "contact_id": str(contact_id),
            "issue_date": now.isoformat(),
            "due_date": (now + timedelta(days=30)).isoformat(),
            "currency": "MYR",
            "line_items": [{"description": "X", "quantity": 1, "unit_price": 100.0, "tax_rate": 0.0}],
        })
        r = await client.get("/invoices")
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        mine = [i for i in items if i["contact_id"] == str(contact_id)]
        assert mine, "invoice not in list"
        assert mine[0]["contact_name"] == "Acme Widgets Sdn Bhd"

    async def test_contact_name_works_past_50_contacts(self, client, org_with_defaults):
        """Create 60 contacts, invoice the 60th — its name must still resolve in
        the list payload (the exact case the client-side contactMap got wrong)."""
        org_id = org_with_defaults["org_id"]
        # Seed 60 contacts; remember the last
        last_id = None
        async with async_session() as s:
            for n in range(60):
                c = Contact(organization_id=org_id, name=f"Bulk Contact {n:02d}", type="customer", entity_type="company")
                s.add(c)
                if n == 59:
                    await s.flush()
                    last_id = c.id
            await s.commit()
        now = datetime.now(timezone.utc)
        await client.post("/invoices", json={
            "contact_id": str(last_id),
            "issue_date": now.isoformat(),
            "due_date": (now + timedelta(days=30)).isoformat(),
            "currency": "MYR",
            "line_items": [{"description": "X", "quantity": 1, "unit_price": 10.0, "tax_rate": 0.0}],
        })
        r = await client.get("/invoices", params={"search": "Bulk Contact 59"})
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        mine = [i for i in items if i["contact_id"] == str(last_id)]
        assert mine, "invoice for 60th contact not found"
        assert mine[0]["contact_name"] == "Bulk Contact 59"

    async def test_bill_list_includes_contact_name(self, client, org_with_defaults):
        org_id = org_with_defaults["org_id"]
        vendor_id = await _make_contact(org_id, "Supplier Co")
        now = datetime.now(timezone.utc)
        await client.post("/bills", json={
            "contact_id": str(vendor_id),
            "issue_date": now.isoformat(),
            "due_date": (now + timedelta(days=30)).isoformat(),
            "currency": "MYR",
            "line_items": [{"description": "Y", "quantity": 1, "unit_price": 80.0, "tax_rate": 0.0}],
        })
        r = await client.get("/bills")
        assert r.status_code == 200, r.text
        mine = [i for i in r.json()["items"] if i["contact_id"] == str(vendor_id)]
        assert mine and mine[0]["contact_name"] == "Supplier Co"
