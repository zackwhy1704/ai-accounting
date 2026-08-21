"""
Voiding an invoice must reverse its GL, matching bills.py/credit_notes.py's
existing behavior. invoices.py's status-change handler only reversed GL for
status == "cancelled" — "void" fell through with no reversal, leaving AR,
revenue, and output tax permanently overstated on the books despite the
invoice showing as void in the UI. Caught in a live production integrity
audit, not by any existing test.
"""
import pytest
from datetime import datetime, timezone, timedelta

from tests.conftest import async_session
from app.models.settings import Contact

pytestmark = pytest.mark.asyncio


async def _make_contact(org_id, name="Void Test Customer"):
    async with async_session() as s:
        c = Contact(organization_id=org_id, name=name, type="customer", entity_type="company")
        s.add(c)
        await s.commit()
        return c.id


async def _create_and_send_invoice(client, org_with_defaults, contact_id, unit_price=300.0, tax_rate=6.0):
    org_id = org_with_defaults["org_id"]
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


class TestVoidInvoiceReversesGL:
    async def test_void_invoice_reverses_gl(self, client, org_with_defaults):
        """The core regression: void must return the trial balance to its
        pre-invoice state and leave a reversal transaction behind."""
        contact_id = await _make_contact(org_with_defaults["org_id"])

        r = await client.get("/reports/trial-balance", params={"as_of_date": "2030-01-01"})
        tb_before_invoice = r.json()["totals"]

        inv_id = await _create_and_send_invoice(client, org_with_defaults, contact_id)

        r = await client.get("/reports/trial-balance", params={"as_of_date": "2030-01-01"})
        tb_after_sent = r.json()["totals"]
        assert tb_after_sent["debit"] > tb_before_invoice["debit"], "sending should post GL"

        r = await client.patch(f"/invoices/{inv_id}/status", params={"status": "void"})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "void"

        r = await client.get("/reports/trial-balance", params={"as_of_date": "2030-01-01"})
        tb_after_void = r.json()
        assert tb_after_void["is_balanced"]
        # Original + reversal legs both remain (an audit trail, not deletion) —
        # so the debit/credit total is 2x the invoice, but every account nets
        # back to its pre-invoice balance line-by-line.
        for line in tb_after_void["lines"]:
            assert line["debit"] == line["credit"], (
                f"{line['code']} {line['name']} should net to zero after void, "
                f"got dr={line['debit']} cr={line['credit']}"
            )

        import uuid
        async with async_session() as s:
            from sqlalchemy import select
            from app.models.models import Transaction
            txns = (await s.execute(
                select(Transaction).where(Transaction.source_id == uuid.UUID(inv_id), Transaction.source == "invoice")
            )).scalars().all()
        assert len(txns) == 1, "original invoice transaction should still exist (audit trail)"

        async with async_session() as s:
            from sqlalchemy import select
            from app.models.models import Transaction
            reversal_txns = (await s.execute(
                select(Transaction).where(Transaction.source_id == uuid.UUID(inv_id), Transaction.source == "invoice_reversal")
            )).scalars().all()
        assert len(reversal_txns) == 1, "voiding must post exactly one reversal transaction"

    async def test_void_invoice_removes_revenue_from_pl(self, client, org_with_defaults):
        """P&L is computed purely from posted GL (no Invoice.status filter) —
        an unreversed void would silently leak revenue into every period
        covering the invoice's date."""
        contact_id = await _make_contact(org_with_defaults["org_id"])
        inv_id = await _create_and_send_invoice(client, org_with_defaults, contact_id, unit_price=500.0, tax_rate=0)

        r = await client.get("/reports/profit-loss", params={"start_date": "2020-01-01", "end_date": "2030-01-01"})
        assert r.json()["sections"]["revenue"]["total"] >= 500.0

        r = await client.patch(f"/invoices/{inv_id}/status", params={"status": "void"})
        assert r.status_code == 200, r.text

        r = await client.get("/reports/profit-loss", params={"start_date": "2020-01-01", "end_date": "2030-01-01"})
        assert r.json()["sections"]["revenue"]["total"] == 0.0, (
            "voided invoice's revenue must not appear in P&L"
        )

    async def test_void_invoice_already_excluded_from_sst(self, client, org_with_defaults):
        """SST-02 filters by Invoice.status directly (notin_ void/cancelled/draft),
        independent of GL — this was already correct before the fix. Confirms
        it stays correct (not a regression proof of THIS fix, a non-regression
        check on a related but separately-implemented exclusion)."""
        contact_id = await _make_contact(org_with_defaults["org_id"])

        r = await client.get("/reports/sst-02", params={"from_date": "2020-01-01", "to_date": "2030-01-01"})
        assert r.status_code == 200, r.text
        tax_before = r.json()["total_tax_payable"]

        inv_id = await _create_and_send_invoice(client, org_with_defaults, contact_id, unit_price=1000.0, tax_rate=6.0)

        r = await client.get("/reports/sst-02", params={"from_date": "2020-01-01", "to_date": "2030-01-01"})
        assert r.json()["total_tax_payable"] == tax_before + 60.0, "sent invoice should add its output tax"

        r = await client.patch(f"/invoices/{inv_id}/status", params={"status": "void"})
        assert r.status_code == 200, r.text

        r = await client.get("/reports/sst-02", params={"from_date": "2020-01-01", "to_date": "2030-01-01"})
        assert r.json()["total_tax_payable"] == tax_before, (
            "voided invoice's output tax must not appear in the SST-02 return"
        )

    async def test_cancelled_status_still_reverses_gl(self, client, org_with_defaults):
        """Guard against a regression in the other direction: the existing
        'cancelled' reversal behavior must be unchanged by widening the branch
        to include 'void'."""
        contact_id = await _make_contact(org_with_defaults["org_id"])
        inv_id = await _create_and_send_invoice(client, org_with_defaults, contact_id)

        r = await client.patch(f"/invoices/{inv_id}/status", params={"status": "cancelled"})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "cancelled"

        import uuid
        async with async_session() as s:
            from sqlalchemy import select
            from app.models.models import Transaction
            reversal_txns = (await s.execute(
                select(Transaction).where(Transaction.source_id == uuid.UUID(inv_id), Transaction.source == "invoice_reversal")
            )).scalars().all()
        assert len(reversal_txns) == 1, "cancelled must still post exactly one reversal transaction"
