"""
Router-level GL integration tests (P8).

These drive the real invoice/bill routers through httpx against the configured
DB and assert ledger invariants — the layer where the P0 imbalance lived.

Skipped automatically when the database is unreachable (see conftest).
"""
import uuid
import pytest
import pytest_asyncio
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


async def _txn_balance(org_id, source, source_id):
    """Return (n_transactions, total_debit, total_credit) for a source document."""
    async with async_session() as s:
        txns = (await s.execute(
            select(Transaction).where(
                Transaction.organization_id == org_id,
                Transaction.source == source,
                Transaction.source_id == source_id,
            )
        )).scalars().all()
        n = len(txns)
        total_d = total_c = 0.0
        for t in txns:
            entries = (await s.execute(
                select(JournalEntry).where(JournalEntry.transaction_id == t.id)
            )).scalars().all()
            total_d += sum(float(e.debit) for e in entries)
            total_c += sum(float(e.credit) for e in entries)
        return n, round(total_d, 2), round(total_c, 2)


class TestTaxedInvoicePosting:
    async def test_taxed_invoice_with_org_defaults_posts_one_balanced_txn(self, client, org_with_defaults):
        """P0 regression: approving a taxed invoice in a configured org must
        succeed (no 400) and produce exactly ONE balanced transaction."""
        org_id = org_with_defaults["org_id"]
        contact_id = await _make_contact(org_id, "customer")
        now = datetime.now(timezone.utc)

        payload = {
            "contact_id": str(contact_id),
            "issue_date": now.isoformat(),
            "due_date": (now + timedelta(days=30)).isoformat(),
            "currency": "MYR",
            "line_items": [
                {"description": "Widget", "quantity": 1, "unit_price": 100.0, "tax_rate": 6.0},
            ],
        }
        r = await client.post("/invoices", json=payload)
        assert r.status_code in (200, 201), r.text
        invoice_id = r.json()["id"]

        # Approve (draft -> sent) triggers GL posting
        r2 = await client.patch(f"/invoices/{invoice_id}/status", params={"status": "sent"})
        assert r2.status_code == 200, r2.text  # P0 used to throw 400 here

        n, dr, cr = await _txn_balance(org_id, "invoice", uuid.UUID(invoice_id))
        assert n == 1, f"expected exactly 1 transaction, got {n}"
        assert dr == cr, f"transaction not balanced: dr={dr} cr={cr}"
        assert dr == 106.0, f"expected total 106 (100 + 6 tax), got {dr}"

    async def test_untaxed_invoice_posts_one_balanced_txn(self, client, org_with_defaults):
        org_id = org_with_defaults["org_id"]
        contact_id = await _make_contact(org_id, "customer")
        now = datetime.now(timezone.utc)
        payload = {
            "contact_id": str(contact_id),
            "issue_date": now.isoformat(),
            "due_date": (now + timedelta(days=30)).isoformat(),
            "currency": "MYR",
            "line_items": [{"description": "Service", "quantity": 1, "unit_price": 200.0, "tax_rate": 0.0}],
        }
        r = await client.post("/invoices", json=payload)
        assert r.status_code in (200, 201), r.text
        invoice_id = r.json()["id"]
        r2 = await client.patch(f"/invoices/{invoice_id}/status", params={"status": "sent"})
        assert r2.status_code == 200, r2.text
        n, dr, cr = await _txn_balance(org_id, "invoice", uuid.UUID(invoice_id))
        assert n == 1 and dr == cr == 200.0


class TestTaxedBillPosting:
    async def test_taxed_bill_with_org_defaults_posts_one_balanced_txn(self, client, org_with_defaults):
        """P0 regression on the bill side."""
        org_id = org_with_defaults["org_id"]
        contact_id = await _make_contact(org_id, "vendor")
        now = datetime.now(timezone.utc)
        payload = {
            "contact_id": str(contact_id),
            "issue_date": now.isoformat(),
            "due_date": (now + timedelta(days=30)).isoformat(),
            "currency": "MYR",
            "line_items": [{"description": "Supplies", "quantity": 1, "unit_price": 100.0, "tax_rate": 6.0}],
        }
        r = await client.post("/bills", json=payload)
        assert r.status_code in (200, 201), r.text
        bill_id = r.json()["id"]
        r2 = await client.patch(f"/bills/{bill_id}/status", params={"status": "outstanding"})
        assert r2.status_code == 200, r2.text  # used to 400
        n, dr, cr = await _txn_balance(org_id, "bill", uuid.UUID(bill_id))
        assert n == 1, f"expected 1 transaction, got {n}"
        assert dr == cr, f"unbalanced: dr={dr} cr={cr}"
        assert dr == 106.0


class TestLedgerIntegrity:
    async def test_every_transaction_balances(self, client, org_with_defaults):
        """After posting documents, every Transaction in the org must have DR==CR."""
        org_id = org_with_defaults["org_id"]
        contact_id = await _make_contact(org_id, "customer")
        now = datetime.now(timezone.utc)
        # Post one taxed invoice to ensure there is at least one transaction
        payload = {
            "contact_id": str(contact_id),
            "issue_date": now.isoformat(),
            "due_date": (now + timedelta(days=30)).isoformat(),
            "currency": "MYR",
            "line_items": [{"description": "X", "quantity": 2, "unit_price": 75.0, "tax_rate": 6.0}],
        }
        r = await client.post("/invoices", json=payload)
        invoice_id = r.json()["id"]
        await client.patch(f"/invoices/{invoice_id}/status", params={"status": "sent"})

        async with async_session() as s:
            txns = (await s.execute(
                select(Transaction).where(Transaction.organization_id == org_id)
            )).scalars().all()
            assert len(txns) >= 1
            for t in txns:
                rows = (await s.execute(
                    select(
                        func.coalesce(func.sum(JournalEntry.debit), 0),
                        func.coalesce(func.sum(JournalEntry.credit), 0),
                    ).where(JournalEntry.transaction_id == t.id)
                )).one()
                assert abs(float(rows[0]) - float(rows[1])) < 0.01, f"txn {t.id} unbalanced"


class TestGLBasedProfitLoss:
    async def test_pl_is_gl_based_and_captures_manual_journals(self, client, org_with_defaults):
        """GL-based P&L must include revenue from BOTH an approved invoice AND a
        manual journal — the manual journal is exactly what the old subledger
        (Invoice.total) P&L would have missed."""
        org_id = org_with_defaults["org_id"]
        accts = org_with_defaults["accounts"]
        contact_id = await _make_contact(org_id, "customer")
        now = datetime.now(timezone.utc)

        # 1) Approved taxed invoice -> revenue 100 (tax 6 is a liability, not revenue)
        inv = await client.post("/invoices", json={
            "contact_id": str(contact_id),
            "issue_date": now.isoformat(),
            "due_date": (now + timedelta(days=30)).isoformat(),
            "currency": "MYR",
            "line_items": [{"description": "Goods", "quantity": 1, "unit_price": 100.0, "tax_rate": 6.0}],
        })
        await client.patch(f"/invoices/{inv.json()['id']}/status", params={"status": "sent"})

        # 2) Manual journal: DR Bank 50 / CR Revenue 50 (e.g. cash sale, no invoice)
        mj = await client.post("/manual-journals", json={
            "date": now.isoformat(),
            "description": "Cash sale (no invoice)",
            "lines": [
                {"account_id": str(accts["1000"]), "debit": 50.0, "credit": 0.0},
                {"account_id": str(accts["4000"]), "debit": 0.0, "credit": 50.0},
            ],
        })
        assert mj.status_code in (200, 201), mj.text
        post_r = await client.post(f"/manual-journals/{mj.json()['id']}/post")
        assert post_r.status_code == 200, post_r.text

        # 3) GL-based P&L over the period -> revenue must be 100 + 50 = 150
        start = (now - timedelta(days=1)).strftime("%Y-%m-%d")
        end = (now + timedelta(days=1)).strftime("%Y-%m-%d")
        pl = await client.get("/reports/profit-loss", params={"start_date": start, "end_date": end})
        assert pl.status_code == 200, pl.text
        body = pl.json()
        assert body.get("basis") == "accrual_gl"
        assert abs(body["sections"]["revenue"]["total"] - 150.0) < 0.01, body["sections"]["revenue"]
        # revenue lines come from the ledger (account-level), not invoices
        assert any(l["code"] == "4000" for l in body["sections"]["revenue"]["lines"])
