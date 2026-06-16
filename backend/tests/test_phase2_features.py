"""
Phase 2 router-level integration tests: period locking, opening balances,
contact statement, recurring run-due.

Use the same conftest fixtures (skip if DB unreachable).
"""
import uuid
import pytest
from datetime import datetime, timezone, timedelta

from sqlalchemy import select, func

from tests.conftest import async_session
from app.models.settings import Contact
from app.models.models import Transaction, JournalEntry

pytestmark = pytest.mark.asyncio


async def _make_contact(org_id, ctype="customer") -> uuid.UUID:
    async with async_session() as s:
        c = Contact(organization_id=org_id, name=f"C {uuid.uuid4().hex[:6]}", type=ctype, entity_type="company")
        s.add(c)
        await s.commit()
        return c.id


class TestPeriodLocking:
    async def test_locked_period_blocks_backdated_invoice(self, client, org_with_defaults):
        org_id = org_with_defaults["org_id"]
        contact_id = await _make_contact(org_id, "customer")
        now = datetime.now(timezone.utc)

        # Lock through 30 days ago
        lock_date = (now - timedelta(days=30))
        lr = await client.post("/accounting/lock-period", json={"locked_through_date": lock_date.isoformat()})
        assert lr.status_code == 200, lr.text

        # An invoice dated 40 days ago (inside the locked period) must be blocked
        # when it tries to post GL (on approve).
        old_inv = await client.post("/invoices", json={
            "contact_id": str(contact_id),
            "issue_date": (now - timedelta(days=40)).isoformat(),
            "due_date": now.isoformat(),
            "currency": "MYR",
            "line_items": [{"description": "X", "quantity": 1, "unit_price": 100.0, "tax_rate": 0.0}],
        })
        old_id = old_inv.json()["id"]
        blocked = await client.patch(f"/invoices/{old_id}/status", params={"status": "sent"})
        assert blocked.status_code == 400, "approving a backdated invoice into a locked period must fail"
        assert "locked" in blocked.text.lower()

        # An invoice dated today (after the lock) approves fine
        new_inv = await client.post("/invoices", json={
            "contact_id": str(contact_id),
            "issue_date": now.isoformat(),
            "due_date": (now + timedelta(days=30)).isoformat(),
            "currency": "MYR",
            "line_items": [{"description": "Y", "quantity": 1, "unit_price": 100.0, "tax_rate": 0.0}],
        })
        ok = await client.patch(f"/invoices/{new_inv.json()['id']}/status", params={"status": "sent"})
        assert ok.status_code == 200, ok.text

        # Unlock restores posting into the previously-locked period
        ur = await client.post("/accounting/unlock-period")
        assert ur.status_code == 200
        now_ok = await client.patch(f"/invoices/{old_id}/status", params={"status": "sent"})
        assert now_ok.status_code == 200, now_ok.text

    async def test_void_in_locked_period_is_blocked(self, client, org_with_defaults):
        """2B regression: revert_gl bypassed the lock because it created the
        reversal Transaction directly. Cancelling a document dated in a locked
        period posts a reversal into that closed period — must be blocked."""
        org_id = org_with_defaults["org_id"]
        contact_id = await _make_contact(org_id, "customer")
        now = datetime.now(timezone.utc)

        # Create + approve an invoice dated 40 days ago (period still open)
        inv = await client.post("/invoices", json={
            "contact_id": str(contact_id),
            "issue_date": (now - timedelta(days=40)).isoformat(),
            "due_date": now.isoformat(),
            "currency": "MYR",
            "line_items": [{"description": "X", "quantity": 1, "unit_price": 100.0, "tax_rate": 0.0}],
        })
        inv_id = inv.json()["id"]
        approved = await client.patch(f"/invoices/{inv_id}/status", params={"status": "sent"})
        assert approved.status_code == 200, approved.text

        # Lock the books through 30 days ago — the invoice (40 days ago) is now closed
        await client.post("/accounting/lock-period", json={"locked_through_date": (now - timedelta(days=30)).isoformat()})

        # Cancelling it would post a reversal dated 40 days ago -> must be blocked
        blocked = await client.patch(f"/invoices/{inv_id}/status", params={"status": "cancelled"})
        assert blocked.status_code == 400, "voiding into a locked period must be blocked"
        assert "locked" in blocked.text.lower()

        await client.post("/accounting/unlock-period")

    async def test_get_period_lock_reflects_state(self, client, org_with_defaults):
        now = datetime.now(timezone.utc)
        await client.post("/accounting/lock-period", json={"locked_through_date": now.isoformat()})
        g = await client.get("/accounting/period-lock")
        assert g.status_code == 200
        assert g.json()["locked_through_date"] is not None
        await client.post("/accounting/unlock-period")
        g2 = await client.get("/accounting/period-lock")
        assert g2.json()["locked_through_date"] is None


class TestOpeningBalances:
    async def test_opening_balances_posts_one_balanced_transaction(self, client, org_with_defaults):
        org_id = org_with_defaults["org_id"]
        accts = org_with_defaults["accounts"]
        # Opening: DR Bank 1000 / CR ... retained earnings absorbs difference
        r = await client.post("/accounting/opening-balances", json={
            "as_of_date": datetime.now(timezone.utc).isoformat(),
            "lines": [
                {"account_id": str(accts["1000"]), "debit": 1000.0, "credit": 0.0},
                {"account_id": str(accts["2000"]), "debit": 0.0, "credit": 400.0},
            ],
        })
        assert r.status_code in (200, 201), r.text
        # The transaction must balance (retained earnings plug closes the 600 gap)
        async with async_session() as s:
            txns = (await s.execute(
                select(Transaction).where(
                    Transaction.organization_id == org_id,
                    Transaction.source == "opening_balance",
                )
            )).scalars().all()
            assert len(txns) == 1
            rows = (await s.execute(
                select(
                    func.coalesce(func.sum(JournalEntry.debit), 0),
                    func.coalesce(func.sum(JournalEntry.credit), 0),
                ).where(JournalEntry.transaction_id == txns[0].id)
            )).one()
            assert abs(float(rows[0]) - float(rows[1])) < 0.01


class TestContactStatement:
    async def test_contact_statement_lists_invoice_and_balance(self, client, org_with_defaults):
        org_id = org_with_defaults["org_id"]
        contact_id = await _make_contact(org_id, "customer")
        now = datetime.now(timezone.utc)
        inv = await client.post("/invoices", json={
            "contact_id": str(contact_id),
            "issue_date": now.isoformat(),
            "due_date": (now + timedelta(days=30)).isoformat(),
            "currency": "MYR",
            "line_items": [{"description": "Goods", "quantity": 1, "unit_price": 250.0, "tax_rate": 0.0}],
        })
        await client.patch(f"/invoices/{inv.json()['id']}/status", params={"status": "sent"})

        start = (now - timedelta(days=1)).strftime("%Y-%m-%d")
        end = (now + timedelta(days=1)).strftime("%Y-%m-%d")
        st = await client.get("/reports/contact-statement", params={
            "contact_id": str(contact_id), "start_date": start, "end_date": end,
        })
        assert st.status_code == 200, st.text
        body = st.json()
        assert body["contact_id"] == str(contact_id)
        assert any(line["type"] == "invoice" for line in body["lines"])
        assert abs(body["closing_balance"] - 250.0) < 0.01


class TestRecurringRunDue:
    async def test_run_due_generates_invoices_for_due_templates(self, client, org_with_defaults):
        org_id = org_with_defaults["org_id"]
        contact_id = await _make_contact(org_id, "customer")
        now = datetime.now(timezone.utc)
        # Create an active recurring invoice whose next_run_date is in the past
        ri = await client.post("/recurring-invoices", json={
            "contact_id": str(contact_id),
            "frequency": "monthly",
            "frequency_interval": 1,
            "start_date": (now - timedelta(days=40)).isoformat(),
            "due_days": 30,
            "currency": "MYR",
            "line_items": [{"description": "Subscription", "quantity": 1, "unit_price": 99.0, "tax_rate": 0.0}],
        })
        assert ri.status_code in (200, 201), ri.text

        run = await client.post("/recurring-invoices/run-due")
        assert run.status_code == 200, run.text
        body = run.json()
        assert body["generated"] >= 1, body

    async def test_celery_sweep_fires_all_due(self, client, org_with_defaults):
        """1B: the Celery beat task _fire_all_due() sweeps every org and generates
        invoices for due templates (the automated path, not the manual button)."""
        org_id = org_with_defaults["org_id"]
        contact_id = await _make_contact(org_id, "customer")
        now = datetime.now(timezone.utc)
        ri = await client.post("/recurring-invoices", json={
            "contact_id": str(contact_id),
            "frequency": "monthly",
            "frequency_interval": 1,
            "start_date": (now - timedelta(days=40)).isoformat(),
            "due_days": 30,
            "currency": "MYR",
            "line_items": [{"description": "Sub", "quantity": 1, "unit_price": 50.0, "tax_rate": 0.0}],
        })
        assert ri.status_code in (200, 201), ri.text

        from app.tasks.recurring_tasks import _fire_all_due
        result = await _fire_all_due()
        assert result["generated"] >= 1, result
