"""SST/GST tax-report status filter (audit BUG 1 + BUG 2).

A finalized-but-UNPAID invoice (status 'sent') still owes output tax — its GL was
posted at draft->sent. The SST-02 report previously filtered invoices by the
unpaid-balance set ['outstanding','partially_paid','paid'], which EXCLUDES 'sent',
so output tax on every issued-but-unpaid invoice was under-reported. These tests
pin the corrected behaviour: finalized invoices count, drafts/voids don't.
"""
import uuid
import pytest
from datetime import datetime, timezone, timedelta

from sqlalchemy import select
from tests.conftest import async_session
from app.models.settings import Contact

pytestmark = pytest.mark.asyncio

FROM = "2026-01-01"
TO = "2026-12-31"


async def _customer(org_id) -> uuid.UUID:
    async with async_session() as s:
        c = Contact(organization_id=org_id, name="SST Cust", type="customer")
        s.add(c)
        await s.flush()
        cid = c.id
        await s.commit()
    return cid


async def _sst_sales_tax(client) -> float:
    r = await client.get(f"/reports/sst-02?from_date={FROM}&to_date=2026-12-31")
    assert r.status_code == 200, r.text
    # output tax = total_tax_payable before netting input; use the taxable/sales field
    body = r.json()
    return float(body.get("total_tax_payable") or 0), float(body.get("total_taxable_amount") or 0)


async def _make_invoice(client, cid, unit_price, tax_rate=6.0):
    now = datetime(2026, 3, 1, tzinfo=timezone.utc)
    r = await client.post("/invoices", json={
        "contact_id": str(cid),
        "issue_date": now.isoformat(),
        "due_date": (now + timedelta(days=30)).isoformat(),
        "line_items": [{"description": "Taxed sale", "quantity": 1, "unit_price": unit_price, "tax_rate": tax_rate}],
    })
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


class TestSstStatusFilter:
    async def test_sent_unpaid_invoice_is_in_sst(self, client, org_with_defaults):
        cid = await _customer(org_with_defaults["org_id"])
        tax_before, _ = await _sst_sales_tax(client)
        iid = await _make_invoice(client, cid, 1000.0)
        # finalize but DO NOT pay
        r = await client.patch(f"/invoices/{iid}/status", params={"status": "sent"})
        assert r.status_code == 200, r.text
        tax_after, taxable_after = await _sst_sales_tax(client)
        assert round(tax_after - tax_before, 2) == 60.0, f"sent invoice tax must appear in SST (got delta {tax_after - tax_before})"

    async def test_draft_invoice_is_not_in_sst(self, client, org_with_defaults):
        cid = await _customer(org_with_defaults["org_id"])
        tax_before, _ = await _sst_sales_tax(client)
        await _make_invoice(client, cid, 1000.0)  # left as draft
        tax_after, _ = await _sst_sales_tax(client)
        assert tax_after == tax_before, "draft invoices must NOT be counted in SST"

    async def test_can_set_invoice_outstanding_and_books_balance(self, client, org_with_defaults):
        """BUG 2: 'outstanding' must be an accepted manual status, and finalizing
        straight to it must still post the GL (trial balance stays balanced)."""
        cid = await _customer(org_with_defaults["org_id"])
        iid = await _make_invoice(client, cid, 500.0)
        r = await client.patch(f"/invoices/{iid}/status", params={"status": "outstanding"})
        assert r.status_code == 200, r.text
        tb = await client.get(f"/reports/trial-balance?as_of_date={TO}")
        assert tb.status_code == 200, tb.text
        assert tb.json()["is_balanced"] is True, "books must balance after draft->outstanding finalize"
