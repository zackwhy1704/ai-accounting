"""Purchase-payment overpay guard (audit FINDING 2).

Sales payments enforce amount = sum(allocations) and can't exceed the invoice
balance. Purchase payments used a single-bill model with the amount trusted from
the client and NO overpay guard — a payment larger than the outstanding balance
would push bill.amount_paid past the total. These assert the guard now rejects
overpayment (full and partial-remainder) while allowing exact settlement.
"""
import uuid
import pytest
from datetime import datetime, timezone, timedelta

from sqlalchemy import select
from tests.conftest import async_session
from app.models.settings import Contact

pytestmark = pytest.mark.asyncio


async def _vendor(org_id) -> uuid.UUID:
    async with async_session() as s:
        c = Contact(organization_id=org_id, name="Overpay Vendor", type="vendor")
        s.add(c)
        await s.flush()
        cid = c.id
        await s.commit()
    return cid


async def _make_bill(client, contact_id, unit_price):
    now = datetime.now(timezone.utc)
    r = await client.post("/bills", json={
        "contact_id": str(contact_id),
        "issue_date": now.isoformat(),
        "due_date": (now + timedelta(days=30)).isoformat(),
        "currency": "MYR",
        "line_items": [{"description": "Stock", "quantity": 1, "unit_price": unit_price}],
    })
    assert r.status_code in (200, 201), r.text
    return r.json()["id"], float(r.json()["total"])


class TestPurchasePaymentOverpay:
    async def test_overpay_rejected(self, client, org_with_defaults):
        cid = await _vendor(org_with_defaults["org_id"])
        bill_id, total = await _make_bill(client, cid, 500.0)
        r = await client.post("/purchase-payments", json={
            "contact_id": str(cid), "payment_date": datetime.now(timezone.utc).isoformat(),
            "amount": total + 100, "bill_id": bill_id,
        })
        assert r.status_code == 400, r.text
        assert "exceeds" in r.text.lower()

    async def test_exact_settlement_allowed(self, client, org_with_defaults):
        cid = await _vendor(org_with_defaults["org_id"])
        bill_id, total = await _make_bill(client, cid, 500.0)
        r = await client.post("/purchase-payments", json={
            "contact_id": str(cid), "payment_date": datetime.now(timezone.utc).isoformat(),
            "amount": total, "bill_id": bill_id,
        })
        assert r.status_code in (200, 201), r.text

    async def test_overpay_of_remainder_rejected(self, client, org_with_defaults):
        cid = await _vendor(org_with_defaults["org_id"])
        bill_id, total = await _make_bill(client, cid, 300.0)
        # pay part of it
        r1 = await client.post("/purchase-payments", json={
            "contact_id": str(cid), "payment_date": datetime.now(timezone.utc).isoformat(),
            "amount": 200.0, "bill_id": bill_id,
        })
        assert r1.status_code in (200, 201), r1.text
        # now try to pay more than the remaining balance
        r2 = await client.post("/purchase-payments", json={
            "contact_id": str(cid), "payment_date": datetime.now(timezone.utc).isoformat(),
            "amount": total - 200.0 + 50, "bill_id": bill_id,
        })
        assert r2.status_code == 400, r2.text
