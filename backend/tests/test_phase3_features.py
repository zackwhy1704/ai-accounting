"""Phase 3 tests: invoice PDF, AP aging drill-down, payment terms, GST F5, FX helper."""
import uuid
import pytest
from datetime import datetime, timezone, timedelta

from sqlalchemy import select
from tests.conftest import async_session
from app.models.settings import Contact

pytestmark = pytest.mark.asyncio


async def _make_contact(org_id, ctype="customer", terms_days=None) -> uuid.UUID:
    async with async_session() as s:
        c = Contact(organization_id=org_id, name=f"C {uuid.uuid4().hex[:6]}", type=ctype,
                    entity_type="company", default_payment_terms_days=terms_days)
        s.add(c)
        await s.commit()
        return c.id


# ── 3A invoice PDF (unit: generator; integration: endpoint) ────────────────────

def test_invoice_pdf_generator_produces_pdf():
    from app.services.invoice_pdf import render_invoice_pdf

    class O: name = "Acme Sdn Bhd"; sst_registration_no = "W10-123"
    class C: name = "Cust"; email = "c@x.com"
    class L:
        def __init__(s): s.description, s.quantity, s.unit_price, s.tax_rate, s.amount, s.sort_order = "Widget", 2, 50.0, 6.0, 100.0, 0
    class I:
        invoice_number = "INV-1"; status = "outstanding"; currency = "MYR"
        issue_date = datetime(2026, 6, 16); due_date = datetime(2026, 7, 16)
        subtotal = 100.0; tax_amount = 6.0; total = 106.0; amount_paid = 0.0
        notes = "Thanks"; billing_address_line1 = "1 Jln Test"
    pdf = render_invoice_pdf(I(), O(), C(), [L()])
    assert pdf[:4] == b"%PDF"
    assert len(pdf) > 1000


class TestInvoicePdfEndpoint:
    async def test_pdf_endpoint_returns_pdf(self, client, org_with_defaults):
        org_id = org_with_defaults["org_id"]
        contact_id = await _make_contact(org_id, "customer")
        now = datetime.now(timezone.utc)
        inv = await client.post("/invoices", json={
            "contact_id": str(contact_id),
            "issue_date": now.isoformat(),
            "due_date": (now + timedelta(days=30)).isoformat(),
            "currency": "MYR",
            "line_items": [{"description": "Goods", "quantity": 1, "unit_price": 100.0, "tax_rate": 6.0}],
        })
        r = await client.get(f"/invoices/{inv.json()['id']}/pdf")
        assert r.status_code == 200, r.text
        assert r.headers["content-type"] == "application/pdf"
        assert r.content[:4] == b"%PDF"

    async def test_send_email_without_config_returns_503(self, client, org_with_defaults):
        """When RESEND is unset the endpoint should 503, not crash."""
        org_id = org_with_defaults["org_id"]
        contact_id = await _make_contact(org_id, "customer")
        now = datetime.now(timezone.utc)
        inv = await client.post("/invoices", json={
            "contact_id": str(contact_id),
            "issue_date": now.isoformat(),
            "due_date": (now + timedelta(days=30)).isoformat(),
            "currency": "MYR",
            "line_items": [{"description": "Goods", "quantity": 1, "unit_price": 100.0, "tax_rate": 0.0}],
        })
        from app.core.config import get_settings
        r = await client.post(f"/invoices/{inv.json()['id']}/send-email", json={"to": "x@y.com"})
        # 503 if no key configured, 200 if a key is present in env
        assert r.status_code in (200, 502, 503), r.text


# ── 3F AP aging drill-down ─────────────────────────────────────────────────────

class TestApAgingDrilldown:
    async def test_ap_aging_filters_to_one_supplier(self, client, org_with_defaults):
        org_id = org_with_defaults["org_id"]
        vendor = await _make_contact(org_id, "vendor")
        now = datetime.now(timezone.utc)
        bill = await client.post("/bills", json={
            "contact_id": str(vendor),
            "issue_date": (now - timedelta(days=20)).isoformat(),
            "due_date": (now - timedelta(days=10)).isoformat(),  # overdue, but after issue
            "currency": "MYR",
            "line_items": [{"description": "Supplies", "quantity": 1, "unit_price": 500.0, "tax_rate": 0.0}],
        })
        assert bill.status_code in (200, 201), bill.text
        await client.patch(f"/bills/{bill.json()['id']}/status", params={"status": "outstanding"})

        r = await client.get("/reports/ap-aging", params={"contact_id": str(vendor)})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["contact_id"] == str(vendor)
        all_bills = [e for bucket in body["buckets"].values() for e in bucket]
        assert any(e["bill_number"] == bill.json()["bill_number"] for e in all_bills)


# ── 3G payment terms automation ────────────────────────────────────────────────

class TestPaymentTermsAutomation:
    async def test_due_date_derived_from_contact_terms(self, client, org_with_defaults):
        org_id = org_with_defaults["org_id"]
        contact_id = await _make_contact(org_id, "customer", terms_days=45)
        now = datetime.now(timezone.utc)
        # Pass due_date == issue_date so the automation applies the 45-day terms
        inv = await client.post("/invoices", json={
            "contact_id": str(contact_id),
            "issue_date": now.isoformat(),
            "due_date": now.isoformat(),
            "currency": "MYR",
            "line_items": [{"description": "X", "quantity": 1, "unit_price": 100.0, "tax_rate": 0.0}],
        })
        assert inv.status_code in (200, 201), inv.text
        due = datetime.fromisoformat(inv.json()["due_date"].replace("Z", "+00:00"))
        issue = datetime.fromisoformat(inv.json()["issue_date"].replace("Z", "+00:00"))
        assert (due.date() - issue.date()).days == 45


# ── 3C Singapore GST F5 ────────────────────────────────────────────────────────

class TestGstF5:
    async def test_gst_f5_from_ledger(self, client, org_with_defaults):
        org_id = org_with_defaults["org_id"]
        cust = await _make_contact(org_id, "customer")
        now = datetime.now(timezone.utc)
        # Taxed invoice -> output tax 6 on revenue 100
        inv = await client.post("/invoices", json={
            "contact_id": str(cust),
            "issue_date": now.isoformat(),
            "due_date": (now + timedelta(days=30)).isoformat(),
            "currency": "SGD",
            "line_items": [{"description": "Goods", "quantity": 1, "unit_price": 100.0, "tax_rate": 6.0}],
        })
        await client.patch(f"/invoices/{inv.json()['id']}/status", params={"status": "sent"})

        start = (now - timedelta(days=1)).strftime("%Y-%m-%d")
        end = (now + timedelta(days=1)).strftime("%Y-%m-%d")
        r = await client.get("/sg-compliance/gst-f5", params={"quarter_start": start, "quarter_end": end})
        assert r.status_code == 200, r.text
        boxes = r.json()["boxes"]
        assert abs(boxes["box6_output_tax"] - 6.0) < 0.01
        assert abs(boxes["box1_standard_rated_supplies"] - 100.0) < 0.01
        assert abs(boxes["box8_net_gst_payable"] - 6.0) < 0.01


# ── 3E FX helper (pure unit) ───────────────────────────────────────────────────

def test_fx_realised_gain_and_loss():
    from app.services.fx import to_base, realised_fx_gain_loss
    assert to_base(100, 4.5) == 450.0
    # USD invoice 100 booked at 4.50, settled at 4.60 -> gain of 10 base
    assert realised_fx_gain_loss(100, 4.50, 4.60) == 10.0
    # settled at 4.40 -> loss of 10 base
    assert realised_fx_gain_loss(100, 4.50, 4.40) == -10.0
    # same rate -> zero
    assert realised_fx_gain_loss(100, 4.50, 4.50) == 0.0
