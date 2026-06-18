"""FK / constraint error handling (product-readiness audit).

Creating a record that references a non-existent foreign key (a bad contact_id,
bill_id, account_id, etc.) must return a clean 4xx with a human-readable detail —
NOT a raw asyncpg IntegrityError 500 leaked to the user's toast, and NOT a silent
2xx that writes bad data. A global IntegrityError handler (app/main.py) backstops
every endpoint; some hot paths also validate explicitly for a more specific 404.
"""
import uuid
import pytest
from datetime import datetime, timezone, timedelta

pytestmark = pytest.mark.asyncio

FAKE = "00000000-0000-0000-0000-000000000000"


async def test_invoice_bad_contact_is_404_not_500(client, org_with_defaults):
    accts = org_with_defaults["accounts"]
    inc = accts["4000"]
    r = await client.post("/invoices", json={
        "contact_id": FAKE,
        "issue_date": datetime.now(timezone.utc).isoformat(),
        "due_date": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
        "line_items": [{"description": "x", "quantity": 1, "unit_price": 10, "account_id": str(inc)}],
    })
    assert r.status_code in (400, 404), r.text
    assert r.json().get("detail"), "must carry a human-readable detail"


async def test_bill_bad_contact_is_clean_4xx_not_500(client, org_with_defaults):
    accts = org_with_defaults["accounts"]
    exp = accts["5000"]
    r = await client.post("/bills", json={
        "contact_id": FAKE,
        "issue_date": datetime.now(timezone.utc).isoformat(),
        "due_date": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
        "line_items": [{"description": "x", "quantity": 1, "unit_price": 10, "account_id": str(exp)}],
    })
    assert 400 <= r.status_code < 500, f"bad FK must be 4xx, got {r.status_code}: {r.text}"
    assert r.json().get("detail")


async def test_sales_payment_bad_invoice_allocation_is_404(client, org_with_defaults):
    # Need a real contact for the payment header.
    import uuid as _u
    from tests.conftest import async_session
    from app.models.settings import Contact
    org_id = org_with_defaults["org_id"]
    async with async_session() as s:
        c = Contact(organization_id=org_id, name="FK Test Cust", type="customer")
        s.add(c)
        await s.flush()
        cid = c.id
        await s.commit()
    r = await client.post("/sales-payments", json={
        "contact_id": str(cid),
        "payment_date": datetime.now(timezone.utc).isoformat(),
        "amount": 100,
        "allocations": [{"invoice_id": FAKE, "amount": 100}],
    })
    assert r.status_code in (400, 404), r.text
    assert r.json().get("detail")
