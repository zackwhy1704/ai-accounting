"""
A voided/cancelled invoice or bill could be transitioned straight back to a
live status (e.g. void -> sent) with a plain 200 — the status flipped but GL
stayed fully reversed at zero, since the posting branch only fires from
draft (invoices) / draft-or-received (bills). The document then appears live
on AR/AP and debtor/creditor reports while contributing nothing to the
ledger, silently understating revenue/receivables or expenses/payables.

Confirmed pre-existing on master, not introduced by the void-reversal or
idempotency fixes. Decision: block reinstatement with 400 rather than
re-post GL (Option B) — no UI path anywhere exposes reinstating a voided
document (confirmed by reading InvoicesPage.tsx / BillsPage.tsx: "Void" is
disabled once already void, "Edit" is disabled when void, nothing sets
status away from void), so Option B would be unused complexity carrying
real risk (re-post date correctness, no-collision with the reversal,
inventory re-issue, its own idempotency trap). Duplicate-into-new-draft is
the existing, already-used path for "I need this again".
"""
import pytest
from datetime import datetime, timezone, timedelta

from tests.conftest import async_session
from app.models.settings import Contact

pytestmark = pytest.mark.asyncio


async def _make_contact(org_id, name="Reinstate Test Customer", ctype="customer"):
    async with async_session() as s:
        c = Contact(organization_id=org_id, name=name, type=ctype, entity_type="company")
        s.add(c)
        await s.commit()
        return c.id


async def _create_and_send_invoice(client, org_with_defaults, contact_id, unit_price=300.0, tax_rate=6.0):
    rev_account_id = org_with_defaults["accounts"]["4000"]
    now = datetime.now(timezone.utc)
    r = await client.post("/invoices", json={
        "contact_id": str(contact_id),
        "issue_date": now.isoformat(), "due_date": (now + timedelta(days=30)).isoformat(),
        "currency": "MYR",
        "line_items": [{"description": "Test", "account_id": str(rev_account_id), "quantity": 1, "unit_price": unit_price, "tax_rate": tax_rate}],
    })
    assert r.status_code == 201, r.text
    inv = r.json()
    r = await client.patch(f"/invoices/{inv['id']}/status", params={"status": "sent"})
    assert r.status_code == 200, r.text
    return inv["id"]


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


def _net(tb_response):
    return {l["code"]: round(l["debit"] - l["credit"], 2) for l in tb_response["lines"]}


class TestReinstatementBlocked:
    async def test_reinstating_voided_invoice_is_blocked(self, client, org_with_defaults):
        contact_id = await _make_contact(org_with_defaults["org_id"])
        inv_id = await _create_and_send_invoice(client, org_with_defaults, contact_id)

        r = await client.patch(f"/invoices/{inv_id}/status", params={"status": "void"})
        assert r.status_code == 200, r.text

        r = await client.patch(f"/invoices/{inv_id}/status", params={"status": "sent"})
        assert r.status_code == 400, f"expected reinstatement to be blocked, got {r.status_code}: {r.text}"
        assert "duplicate" in r.json()["detail"].lower()

        # status must not have changed, and GL must still be fully reversed
        r = await client.get(f"/invoices/{inv_id}")
        assert r.json()["status"] == "void", "status must not change on a blocked transition"

        r = await client.get("/reports/trial-balance", params={"as_of_date": "2030-01-01"})
        for line in r.json()["lines"]:
            assert line["debit"] == line["credit"], (
                f"{line['code']} {line['name']} should remain net zero after a blocked reinstate attempt"
            )

    async def test_reinstating_voided_bill_is_blocked(self, client, org_with_defaults):
        contact_id = await _make_contact(org_with_defaults["org_id"], "Reinstate Test Vendor", "vendor")
        bill_id = await _create_and_approve_bill(client, org_with_defaults, contact_id)

        r = await client.patch(f"/bills/{bill_id}/status", params={"status": "void"})
        assert r.status_code == 200, r.text

        r = await client.patch(f"/bills/{bill_id}/status", params={"status": "approved"})
        assert r.status_code == 400, f"expected reinstatement to be blocked, got {r.status_code}: {r.text}"
        assert "duplicate" in r.json()["detail"].lower()

        r = await client.get(f"/bills/{bill_id}")
        assert r.json()["status"] == "void"

        r = await client.get("/reports/trial-balance", params={"as_of_date": "2030-01-01"})
        for line in r.json()["lines"]:
            assert line["debit"] == line["credit"], (
                f"{line['code']} {line['name']} should remain net zero after a blocked reinstate attempt"
            )

    async def test_normal_draft_to_sent_posting_still_works(self, client, org_with_defaults):
        """Regression: the reinstatement guard must not interfere with the
        ordinary draft -> live transition that posts GL for the first time."""
        contact_id = await _make_contact(org_with_defaults["org_id"])
        rev_account_id = org_with_defaults["accounts"]["4000"]
        now = datetime.now(timezone.utc)
        r = await client.post("/invoices", json={
            "contact_id": str(contact_id),
            "issue_date": now.isoformat(), "due_date": (now + timedelta(days=30)).isoformat(),
            "currency": "MYR",
            "line_items": [{"description": "Regression", "account_id": str(rev_account_id), "quantity": 1, "unit_price": 100.0, "tax_rate": 0.0}],
        })
        inv_id = r.json()["id"]

        r = await client.patch(f"/invoices/{inv_id}/status", params={"status": "sent"})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "sent"

        r = await client.get("/reports/trial-balance", params={"as_of_date": "2030-01-01"})
        net = _net(r.json())
        assert net["4000"] == -100.0, (
            "revenue should be posted for a normal draft->sent transition"
        )

    async def test_void_still_reverses_and_repeat_void_still_idempotent(self, client, org_with_defaults):
        """Regression against 190f763: this fix must not reintroduce the
        double-reversal bug or break the single-void reversal."""
        import uuid
        contact_id = await _make_contact(org_with_defaults["org_id"])
        inv_id = await _create_and_send_invoice(client, org_with_defaults, contact_id)

        for i in range(3):
            r = await client.patch(f"/invoices/{inv_id}/status", params={"status": "void"})
            assert r.status_code == 200, f"call #{i+1}: {r.text}"

        r = await client.get("/reports/trial-balance", params={"as_of_date": "2030-01-01"})
        for line in r.json()["lines"]:
            assert line["debit"] == line["credit"], (
                f"{line['code']} {line['name']} should still net to zero after 3 void calls"
            )

        async with async_session() as s:
            from sqlalchemy import select
            from app.models.models import Transaction
            reversal_txns = (await s.execute(
                select(Transaction).where(Transaction.source_id == uuid.UUID(inv_id), Transaction.source == "invoice_reversal")
            )).scalars().all()
        assert len(reversal_txns) == 1, f"expected exactly 1 reversal transaction, got {len(reversal_txns)}"
