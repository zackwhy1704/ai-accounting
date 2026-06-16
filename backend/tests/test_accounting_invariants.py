"""
Phase 4: accounting data-integrity invariants enforced as tests.

4A — router GL: a credit note in an org with default accounts must hit the
configured revenue account (not hardcoded 4000).

4B — SQL invariants (the accounting equivalent of schema constraints):
  - every Transaction balances (sum debit == sum credit)
  - Invoice.amount_paid == sum of its PaymentAllocation amounts
  - CreditNote.credit_applied == sum of its CreditApplication amounts

Each invariant first posts some real documents through the routers, then scans
the seeded org's ledger/subledger. Skips if DB unreachable (conftest).
"""
import uuid
import pytest
from datetime import datetime, timezone, timedelta

from sqlalchemy import select, func, text

from tests.conftest import async_session
from app.models.settings import Contact
from app.models.models import (
    Transaction, JournalEntry, Invoice, PaymentAllocation,
    CreditNote, CreditApplication,
)

pytestmark = pytest.mark.asyncio


async def _make_contact(org_id, ctype="customer") -> uuid.UUID:
    async with async_session() as s:
        c = Contact(organization_id=org_id, name=f"C {uuid.uuid4().hex[:6]}", type=ctype, entity_type="company")
        s.add(c)
        await s.commit()
        return c.id


class TestRouterGLOrgDefaults:
    async def test_credit_note_gl_uses_org_default_revenue(self, client, org_with_defaults):
        """4A: the CN GL must debit the org's configured revenue account, not '4000'."""
        org_id = org_with_defaults["org_id"]
        revenue_id = org_with_defaults["accounts"]["4000"]
        contact_id = await _make_contact(org_id)
        now = datetime.now(timezone.utc)
        cn = await client.post("/credit-notes", json={
            "contact_id": str(contact_id),
            "issue_date": now.isoformat(),
            "currency": "MYR",
            "line_items": [{"description": "Return", "quantity": 1, "unit_price": 100.0, "tax_rate": 0.0}],
        })
        assert cn.status_code in (200, 201), cn.text
        cn_id = uuid.UUID(cn.json()["id"])

        async with async_session() as s:
            txn = (await s.execute(
                select(Transaction).where(Transaction.organization_id == org_id, Transaction.source == "credit_note", Transaction.source_id == cn_id)
            )).scalars().first()
            assert txn is not None, "credit note posted no GL transaction"
            acct_ids = (await s.execute(
                select(JournalEntry.account_id).where(JournalEntry.transaction_id == txn.id)
            )).scalars().all()
            assert revenue_id in acct_ids, "CN GL did not hit the org default revenue account"


class TestSqlInvariants:
    async def _post_some_activity(self, client, org_id):
        """Post an invoice, approve it, allocate a partial payment."""
        contact_id = await _make_contact(org_id)
        now = datetime.now(timezone.utc)
        inv = await client.post("/invoices", json={
            "contact_id": str(contact_id),
            "issue_date": now.isoformat(),
            "due_date": (now + timedelta(days=30)).isoformat(),
            "currency": "MYR",
            "line_items": [{"description": "Goods", "quantity": 1, "unit_price": 300.0, "tax_rate": 0.0}],
        })
        invoice_id = inv.json()["id"]
        await client.patch(f"/invoices/{invoice_id}/status", params={"status": "sent"})
        # Allocate a 120 payment to it
        await client.post("/sales-payments", json={
            "contact_id": str(contact_id),
            "payment_date": now.isoformat(),
            "amount": 120.0,
            "allocations": [{"invoice_id": invoice_id, "amount": 120.0}],
        })
        return invoice_id

    async def test_all_transactions_balance(self, client, org_with_defaults):
        org_id = org_with_defaults["org_id"]
        await self._post_some_activity(client, org_id)
        async with async_session() as s:
            txns = (await s.execute(
                select(Transaction.id).where(Transaction.organization_id == org_id)
            )).scalars().all()
            assert len(txns) >= 1
            for tid in txns:
                dr, cr = (await s.execute(
                    select(func.coalesce(func.sum(JournalEntry.debit), 0),
                           func.coalesce(func.sum(JournalEntry.credit), 0))
                    .where(JournalEntry.transaction_id == tid)
                )).one()
                assert abs(float(dr) - float(cr)) < 0.01, f"transaction {tid} unbalanced: {dr} vs {cr}"

    async def test_invoice_amount_paid_matches_allocations(self, client, org_with_defaults):
        org_id = org_with_defaults["org_id"]
        invoice_id = await self._post_some_activity(client, org_id)
        async with async_session() as s:
            inv = (await s.execute(select(Invoice).where(Invoice.id == uuid.UUID(invoice_id)))).scalar_one()
            alloc_sum = (await s.execute(
                select(func.coalesce(func.sum(PaymentAllocation.amount), 0))
                .where(PaymentAllocation.invoice_id == uuid.UUID(invoice_id))
            )).scalar_one()
            assert abs(float(inv.amount_paid or 0) - float(alloc_sum or 0)) < 0.01, \
                f"invoice amount_paid {inv.amount_paid} != allocations {alloc_sum}"

    async def test_credit_applied_matches_applications(self, client, org_with_defaults):
        org_id = org_with_defaults["org_id"]
        contact_id = await _make_contact(org_id)
        now = datetime.now(timezone.utc)
        # Invoice to apply against
        inv = await client.post("/invoices", json={
            "contact_id": str(contact_id),
            "issue_date": now.isoformat(),
            "due_date": (now + timedelta(days=30)).isoformat(),
            "currency": "MYR",
            "line_items": [{"description": "G", "quantity": 1, "unit_price": 200.0, "tax_rate": 0.0}],
        })
        invoice_id = inv.json()["id"]
        await client.patch(f"/invoices/{invoice_id}/status", params={"status": "sent"})
        # CN applied 80 to the invoice
        cn = await client.post("/credit-notes", json={
            "contact_id": str(contact_id),
            "issue_date": now.isoformat(),
            "currency": "MYR",
            "line_items": [{"description": "R", "quantity": 1, "unit_price": 80.0, "tax_rate": 0.0}],
            "credit_applications": [{"invoice_id": invoice_id, "amount": 80.0}],
        })
        cn_id = uuid.UUID(cn.json()["id"])
        async with async_session() as s:
            obj = (await s.execute(select(CreditNote).where(CreditNote.id == cn_id))).scalar_one()
            app_sum = (await s.execute(
                select(func.coalesce(func.sum(CreditApplication.amount), 0))
                .where(CreditApplication.credit_note_id == cn_id)
            )).scalar_one()
            assert abs(float(obj.credit_applied or 0) - float(app_sum or 0)) < 0.01, \
                f"CN credit_applied {obj.credit_applied} != applications {app_sum}"
