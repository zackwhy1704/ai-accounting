"""
bills.py had the same repeated-void double-reversal bug as invoices.py
(found while auditing the invoice fix): the reversal branch only checked
target status and prev_status not in ("draft","received"), with no
already-terminal exclusion — an already-void bill has prev_status == "void",
which still passed, so each repeat call posted another reversal. Confirmed
live before the fix: AP swung 0 -> +400 -> +800 across 3 void calls.
"""
import pytest
from datetime import datetime, timezone, timedelta

from tests.conftest import async_session
from app.models.settings import Contact

pytestmark = pytest.mark.asyncio


async def _make_vendor(org_id, name="Void Test Vendor"):
    async with async_session() as s:
        c = Contact(organization_id=org_id, name=name, type="vendor", entity_type="company")
        s.add(c)
        await s.commit()
        return c.id


async def _create_and_approve_bill(client, org_with_defaults, contact_id, unit_price=400.0):
    exp_account_id = org_with_defaults["accounts"]["5000"]
    now = datetime.now(timezone.utc)
    r = await client.post("/bills", json={
        "contact_id": str(contact_id),
        "issue_date": now.isoformat(), "due_date": (now + timedelta(days=30)).isoformat(),
        "currency": "MYR",
        "line_items": [{"description": "Test", "account_id": str(exp_account_id), "quantity": 1, "unit_price": unit_price, "tax_rate": 0}],
    })
    assert r.status_code == 201, r.text
    bill = r.json()
    r = await client.patch(f"/bills/{bill['id']}/status", params={"status": "approved"})
    assert r.status_code == 200, r.text
    return bill["id"]


class TestBillVoidCancelIdempotent:
    async def test_repeated_void_does_not_double_reverse_bill(self, client, org_with_defaults):
        import uuid
        contact_id = await _make_vendor(org_with_defaults["org_id"])
        bill_id = await _create_and_approve_bill(client, org_with_defaults, contact_id)

        for i in range(3):
            r = await client.patch(f"/bills/{bill_id}/status", params={"status": "void"})
            assert r.status_code == 200, f"call #{i+1}: {r.text}"
            assert r.json()["status"] == "void"

        r = await client.get("/reports/trial-balance", params={"as_of_date": "2030-01-01"})
        for line in r.json()["lines"]:
            assert line["debit"] == line["credit"], (
                f"{line['code']} {line['name']} should still net to zero after 3 void calls, "
                f"got dr={line['debit']} cr={line['credit']}"
            )

        async with async_session() as s:
            from sqlalchemy import select
            from app.models.models import Transaction
            reversal_txns = (await s.execute(
                select(Transaction).where(Transaction.source_id == uuid.UUID(bill_id), Transaction.source == "bill_reversal")
            )).scalars().all()
        assert len(reversal_txns) == 1, (
            f"expected exactly 1 reversal transaction after 3 void calls, got {len(reversal_txns)}"
        )

    async def test_void_then_cancel_does_not_double_reverse_bill(self, client, org_with_defaults):
        import uuid
        contact_id = await _make_vendor(org_with_defaults["org_id"])
        bill_id = await _create_and_approve_bill(client, org_with_defaults, contact_id)

        r = await client.patch(f"/bills/{bill_id}/status", params={"status": "void"})
        assert r.status_code == 200, r.text
        r = await client.patch(f"/bills/{bill_id}/status", params={"status": "cancelled"})
        assert r.status_code == 200, r.text

        r = await client.get("/reports/trial-balance", params={"as_of_date": "2030-01-01"})
        for line in r.json()["lines"]:
            assert line["debit"] == line["credit"], (
                f"{line['code']} {line['name']} should net to zero after void-then-cancel, "
                f"got dr={line['debit']} cr={line['credit']}"
            )

        async with async_session() as s:
            from sqlalchemy import select
            from app.models.models import Transaction
            reversal_txns = (await s.execute(
                select(Transaction).where(Transaction.source_id == uuid.UUID(bill_id), Transaction.source == "bill_reversal")
            )).scalars().all()
        assert len(reversal_txns) == 1, (
            f"void-then-cancel must not post a second reversal, got {len(reversal_txns)}"
        )
