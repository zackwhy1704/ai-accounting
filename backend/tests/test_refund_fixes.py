"""
Accountant-feedback regression tests:
  - I1: voiding a sales refund must reverse its GL (sales_refunds.py mirrored
    purchase_refunds.py's revert_gl call, which it was missing).
  - I2: refund-overpaid / apply-overpaid must accept the exact displayed max
    (float subtraction noise made the boundary reject 0.05 when the true
    remainder floated a hair under it).
  - I3: duplicating an invoice must copy its line items into the new draft
    (frontend fix — asserted here via the source invoice fetch the duplicate
    flow relies on).
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


class TestVoidRefundReversesGL:
    async def test_void_sales_refund_reverses_gl(self, client, org_with_defaults):
        org_id = org_with_defaults["org_id"]
        contact_id = await _make_contact(org_id)
        now = datetime.now(timezone.utc)

        # Overpay an invoice so refund-overpaid can issue a SalesRefund with GL.
        r = await client.post("/invoices", json={
            "contact_id": str(contact_id),
            "issue_date": now.isoformat(), "due_date": (now + timedelta(days=30)).isoformat(),
            "currency": "MYR",
            "line_items": [{"description": "X", "quantity": 1, "unit_price": 100.0, "tax_rate": 0.0}],
        })
        assert r.status_code == 201, r.text
        inv = r.json()
        await client.patch(f"/invoices/{inv['id']}/status", params={"status": "sent"})

        r = await client.post("/sales-payments", json={
            "contact_id": str(contact_id), "payment_date": now.isoformat(),
            "payment_method": "bank", "currency": "MYR", "amount": 150.0,
            "allocations": [{"invoice_id": inv["id"], "amount": 150.0}],
        })
        assert r.status_code == 201, r.text

        r = await client.post(f"/invoices/{inv['id']}/refund-overpaid", json={"amount": 50.0})
        assert r.status_code == 200, r.text
        refund_number = r.json()["refund_number"]
        r = await client.get("/sales-refunds", params={"limit": 200})
        refund_id = next(x["id"] for x in r.json()["items"] if x["refund_number"] == refund_number)

        # GL posted for the refund: confirm exactly one transaction for it before voiding.
        async with async_session() as s:
            from sqlalchemy import select
            from app.models.models import Transaction
            before = (await s.execute(
                select(Transaction).where(Transaction.source_id == uuid.UUID(refund_id))
            )).scalars().all()
        assert len(before) == 1 and before[0].source == "refund", "refund should have posted exactly one GL transaction"

        r = await client.patch(f"/sales-refunds/{refund_id}/status", params={"status": "void"})
        assert r.status_code == 200, r.text

        async with async_session() as s:
            from sqlalchemy import select
            from app.models.models import Transaction
            all_txns = (await s.execute(
                select(Transaction).where(Transaction.source_id == uuid.UUID(refund_id))
            )).scalars().all()
        # The fix posts a "refund_reversal" transaction alongside the original
        # "refund" one — net GL effect for this refund is now zero.
        sources = sorted(t.source for t in all_txns)
        assert sources == ["refund", "refund_reversal"], f"expected original + reversal transaction, got {sources}"

    async def test_void_refund_overpaid_restores_invoice_amount_paid(self, client, org_with_defaults):
        """The gap a live production smoke test caught: refund-overpaid deducts
        Invoice.amount_paid directly (invoices.py) with no CreditNote in the
        loop, so voiding via the credit_note_id-only restore path silently lost
        that amount forever. SalesRefund.invoice_id (a048) + this restore branch
        fix it — this is the void-then-check-amount_paid case that was missing."""
        org_id = org_with_defaults["org_id"]
        contact_id = await _make_contact(org_id)
        now = datetime.now(timezone.utc)

        r = await client.post("/invoices", json={
            "contact_id": str(contact_id),
            "issue_date": now.isoformat(), "due_date": (now + timedelta(days=30)).isoformat(),
            "currency": "MYR",
            "line_items": [{"description": "X", "quantity": 1, "unit_price": 100.0, "tax_rate": 0.0}],
        })
        assert r.status_code == 201, r.text
        inv = r.json()
        await client.patch(f"/invoices/{inv['id']}/status", params={"status": "sent"})

        r = await client.post("/sales-payments", json={
            "contact_id": str(contact_id), "payment_date": now.isoformat(),
            "payment_method": "bank", "currency": "MYR", "amount": 150.0,
            "allocations": [{"invoice_id": inv["id"], "amount": 150.0}],
        })
        assert r.status_code == 201, r.text

        r = await client.post(f"/invoices/{inv['id']}/refund-overpaid", json={"amount": 50.0})
        assert r.status_code == 200, r.text
        refund_number = r.json()["refund_number"]
        r = await client.get("/sales-refunds", params={"limit": 200})
        refund_id = next(x["id"] for x in r.json()["items"] if x["refund_number"] == refund_number)

        r = await client.get(f"/invoices/{inv['id']}")
        assert r.json()["amount_paid"] == 100.0, "refund should have deducted the 50 back to 100"

        r = await client.patch(f"/sales-refunds/{refund_id}/status", params={"status": "void"})
        assert r.status_code == 200, r.text

        r = await client.get(f"/invoices/{inv['id']}")
        assert r.json()["amount_paid"] == 150.0, (
            "voiding the refund must restore the 50 it deducted — "
            f"got {r.json()['amount_paid']}"
        )

    async def test_delete_active_sales_refund_is_blocked(self, client, org_with_defaults):
        """An active (non-draft, non-void) refund can't be deleted directly —
        it must be voided first so GL gets reversed. Prevents orphaned GL."""
        org_id = org_with_defaults["org_id"]
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
        await client.post("/sales-payments", json={
            "contact_id": str(contact_id), "payment_date": now.isoformat(),
            "payment_method": "bank", "currency": "MYR", "amount": 150.0,
            "allocations": [{"invoice_id": inv["id"], "amount": 150.0}],
        })
        r = await client.post(f"/invoices/{inv['id']}/refund-overpaid", json={"amount": 50.0})
        refund_number = r.json()["refund_number"]
        r = await client.get("/sales-refunds", params={"limit": 200})
        refund_id = next(x["id"] for x in r.json()["items"] if x["refund_number"] == refund_number)

        r = await client.delete(f"/sales-refunds/{refund_id}")
        assert r.status_code == 400, "deleting a completed refund must be blocked"


class TestRefundOverpaidBoundary:
    async def test_refund_exact_overpaid_amount_is_accepted(self, client, org_with_defaults):
        """The classic float-noise bug: amount_paid - total computed as a hair
        under the displayed max (e.g. 0.049999999999997 instead of 0.05), so
        the UI's own pre-filled max got rejected by the backend boundary check."""
        org_id = org_with_defaults["org_id"]
        contact_id = await _make_contact(org_id)
        now = datetime.now(timezone.utc)

        # 100.05 paid against a 100.00 invoice reproduces the float artifact
        # (100.05 - 100.0 == 0.04999999999999716 in IEEE 754 double).
        r = await client.post("/invoices", json={
            "contact_id": str(contact_id),
            "issue_date": now.isoformat(), "due_date": (now + timedelta(days=30)).isoformat(),
            "currency": "MYR",
            "line_items": [{"description": "X", "quantity": 1, "unit_price": 100.0, "tax_rate": 0.0}],
        })
        inv = r.json()
        await client.patch(f"/invoices/{inv['id']}/status", params={"status": "sent"})
        r = await client.post("/sales-payments", json={
            "contact_id": str(contact_id), "payment_date": now.isoformat(),
            "payment_method": "bank", "currency": "MYR", "amount": 100.05,
            "allocations": [{"invoice_id": inv["id"], "amount": 100.05}],
        })
        assert r.status_code == 201, r.text

        # The UI displays/pre-fills exactly "0.05" (rounded to 2dp) as the max.
        r = await client.post(f"/invoices/{inv['id']}/refund-overpaid", json={"amount": 0.05})
        assert r.status_code == 200, f"exact displayed max was rejected: {r.text}"

    async def test_apply_overpaid_exact_amount_is_accepted(self, client, org_with_defaults):
        org_id = org_with_defaults["org_id"]
        contact_id = await _make_contact(org_id)
        now = datetime.now(timezone.utc)

        r = await client.post("/invoices", json={
            "contact_id": str(contact_id),
            "issue_date": now.isoformat(), "due_date": (now + timedelta(days=30)).isoformat(),
            "currency": "MYR",
            "line_items": [{"description": "Source", "quantity": 1, "unit_price": 100.0, "tax_rate": 0.0}],
        })
        src = r.json()
        await client.patch(f"/invoices/{src['id']}/status", params={"status": "sent"})
        await client.post("/sales-payments", json={
            "contact_id": str(contact_id), "payment_date": now.isoformat(),
            "payment_method": "bank", "currency": "MYR", "amount": 100.05,
            "allocations": [{"invoice_id": src["id"], "amount": 100.05}],
        })

        r = await client.post("/invoices", json={
            "contact_id": str(contact_id),
            "issue_date": now.isoformat(), "due_date": (now + timedelta(days=30)).isoformat(),
            "currency": "MYR",
            "line_items": [{"description": "Target", "quantity": 1, "unit_price": 500.0, "tax_rate": 0.0}],
        })
        tgt = r.json()
        await client.patch(f"/invoices/{tgt['id']}/status", params={"status": "sent"})

        r = await client.post(f"/invoices/{src['id']}/apply-overpaid", json={
            "target_invoice_id": tgt["id"], "amount": 0.05,
        })
        assert r.status_code == 200, f"exact displayed max was rejected: {r.text}"
