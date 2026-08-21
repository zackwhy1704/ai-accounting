"""
Same reinstatement gap as test_void_reinstate_blocked.py (invoices/bills), on
the sibling document types: credit notes, debit notes, sales refunds,
purchase refunds, purchase debit notes.

Two distinct defects found by live audit, both pre-existing on master:

1. Reinstatement gap (credit_notes.py, sales_refunds.py, purchase_refunds.py):
   void -> live status flip returns 200 with GL still fully reversed at zero.
   Same fix as invoices/bills: block with 400.

2. Void never reverses GL at all (debit_notes.py, purchase_debit_notes.py):
   both post GL unconditionally at create (no draft gate), but their status
   handler never called revert_gl on void — worse than the reinstatement gap,
   since even a single void left GL live and wrong. Fixed alongside the
   reinstatement guard since guarding reinstatement on a document whose void
   doesn't reverse GL would be pointless.

purchase_credit_notes.py and sale_receipts.py were audited and found already
safe (see docstrings on their skip-tests below) - no changes made there.

No Duplicate UI exists for any of these 5 types (only invoices/bills/POs have
it - confirmed via grep across frontend/src/pages), so the error message
points at creating a new document instead of duplicating.
"""
import pytest
from datetime import datetime, timezone, timedelta

from tests.conftest import async_session
from app.models.settings import Contact

pytestmark = pytest.mark.asyncio


async def _make_contact(org_id, name="Reinstate Test Contact", ctype="customer"):
    async with async_session() as s:
        c = Contact(organization_id=org_id, name=name, type=ctype, entity_type="company")
        s.add(c)
        await s.commit()
        return c.id


def _net(tb_response):
    return {l["code"]: round(l["debit"] - l["credit"], 2) for l in tb_response["lines"]}


async def _assert_net_zero(client):
    r = await client.get("/reports/trial-balance", params={"as_of_date": "2030-01-01"})
    for line in r.json()["lines"]:
        assert line["debit"] == line["credit"], (
            f"{line['code']} {line['name']} should remain net zero, "
            f"got debit={line['debit']} credit={line['credit']}"
        )


class TestCreditNoteReinstatement:
    async def test_reinstating_voided_credit_note_is_blocked(self, client, org_with_defaults):
        contact_id = await _make_contact(org_with_defaults["org_id"])
        rev = org_with_defaults["accounts"]["4000"]
        r = await client.post("/credit-notes", json={
            "contact_id": str(contact_id), "issue_date": "2026-08-21", "currency": "MYR",
            "line_items": [{"description": "T", "account_id": str(rev), "quantity": 1, "unit_price": 200.0, "tax_rate": 0}],
        })
        assert r.status_code == 201, r.text
        cn_id = r.json()["id"]

        r = await client.patch(f"/credit-notes/{cn_id}/status", params={"status": "issued"})
        assert r.status_code == 200, r.text

        r = await client.patch(f"/credit-notes/{cn_id}/status", params={"status": "void"})
        assert r.status_code == 200, r.text

        for target in ("issued", "applied"):
            r = await client.patch(f"/credit-notes/{cn_id}/status", params={"status": target})
            assert r.status_code == 400, f"target={target} expected 400, got {r.status_code}: {r.text}"

        r = await client.get(f"/credit-notes/{cn_id}")
        assert r.json()["status"] == "void"
        await _assert_net_zero(client)

    async def test_normal_credit_note_lifecycle_still_works(self, client, org_with_defaults):
        contact_id = await _make_contact(org_with_defaults["org_id"])
        rev = org_with_defaults["accounts"]["4000"]
        r = await client.post("/credit-notes", json={
            "contact_id": str(contact_id), "issue_date": "2026-08-21", "currency": "MYR",
            "line_items": [{"description": "T", "account_id": str(rev), "quantity": 1, "unit_price": 80.0, "tax_rate": 0}],
        })
        cn_id = r.json()["id"]
        r = await client.patch(f"/credit-notes/{cn_id}/status", params={"status": "issued"})
        assert r.status_code == 200
        assert r.json()["status"] == "issued"

        r = await client.patch(f"/credit-notes/{cn_id}/status", params={"status": "void"})
        assert r.status_code == 200
        await _assert_net_zero(client)


class TestSalesRefundReinstatement:
    async def test_reinstating_voided_sales_refund_is_blocked(self, client, org_with_defaults):
        contact_id = await _make_contact(org_with_defaults["org_id"])
        r = await client.post("/sales-refunds", json={
            "contact_id": str(contact_id), "refund_date": "2026-08-21T00:00:00Z", "amount": 75.0,
        })
        assert r.status_code == 201, r.text
        sr_id = r.json()["id"]
        assert r.json()["status"] == "completed"

        r = await client.patch(f"/sales-refunds/{sr_id}/status", params={"status": "void"})
        assert r.status_code == 200, r.text

        r = await client.patch(f"/sales-refunds/{sr_id}/status", params={"status": "completed"})
        assert r.status_code == 400, r.text

        r = await client.get(f"/sales-refunds/{sr_id}")
        assert r.json()["status"] == "void"
        await _assert_net_zero(client)

    async def test_normal_sales_refund_void_still_reverses(self, client, org_with_defaults):
        contact_id = await _make_contact(org_with_defaults["org_id"])
        r = await client.post("/sales-refunds", json={
            "contact_id": str(contact_id), "refund_date": "2026-08-21T00:00:00Z", "amount": 40.0,
        })
        sr_id = r.json()["id"]
        r = await client.patch(f"/sales-refunds/{sr_id}/status", params={"status": "void"})
        assert r.status_code == 200
        await _assert_net_zero(client)


class TestPurchaseRefundReinstatement:
    async def test_reinstating_voided_purchase_refund_is_blocked(self, client, org_with_defaults):
        contact_id = await _make_contact(org_with_defaults["org_id"], "Reinstate Test Vendor", "vendor")
        r = await client.post("/purchase-refunds", json={
            "contact_id": str(contact_id), "refund_date": "2026-08-21T00:00:00Z", "amount": 60.0,
        })
        assert r.status_code == 201, r.text
        pr_id = r.json()["id"]
        assert r.json()["status"] == "completed"

        r = await client.patch(f"/purchase-refunds/{pr_id}/status", params={"status": "void"})
        assert r.status_code == 200, r.text

        r = await client.patch(f"/purchase-refunds/{pr_id}/status", params={"status": "completed"})
        assert r.status_code == 400, r.text

        r = await client.get(f"/purchase-refunds/{pr_id}")
        # purchase_refunds has no GET /{id} detail route in some builds; fall back
        # to the activity endpoint's status if the direct GET 404s.
        if r.status_code == 404:
            r = await client.get(f"/purchase-refunds/{pr_id}/activity")
            assert r.json()["events"][0]["status"] == "void"
        else:
            assert r.json()["status"] == "void"
        await _assert_net_zero(client)

    async def test_normal_purchase_refund_void_still_reverses(self, client, org_with_defaults):
        contact_id = await _make_contact(org_with_defaults["org_id"], "Reinstate Test Vendor 2", "vendor")
        r = await client.post("/purchase-refunds", json={
            "contact_id": str(contact_id), "refund_date": "2026-08-21T00:00:00Z", "amount": 20.0,
        })
        pr_id = r.json()["id"]
        r = await client.patch(f"/purchase-refunds/{pr_id}/status", params={"status": "void"})
        assert r.status_code == 200
        await _assert_net_zero(client)


class TestDebitNoteVoidAndReinstatement:
    """debit_notes.py had the worse defect: void never reversed GL at all
    (revert_gl was imported but never called). Fixed alongside the
    reinstatement guard."""

    async def test_void_now_reverses_gl(self, client, org_with_defaults):
        contact_id = await _make_contact(org_with_defaults["org_id"])
        rev = org_with_defaults["accounts"]["4000"]
        r = await client.post("/debit-notes", json={
            "contact_id": str(contact_id), "issue_date": "2026-08-21T00:00:00Z", "currency": "MYR",
            "line_items": [{"description": "T", "account_id": str(rev), "quantity": 1, "unit_price": 60.0, "tax_rate": 0}],
        })
        assert r.status_code == 201, r.text
        dn_id = r.json()["id"]

        r = await client.patch(f"/debit-notes/{dn_id}/status", params={"status": "void"})
        assert r.status_code == 200, r.text
        await _assert_net_zero(client)

    async def test_reinstating_voided_debit_note_is_blocked(self, client, org_with_defaults):
        contact_id = await _make_contact(org_with_defaults["org_id"])
        rev = org_with_defaults["accounts"]["4000"]
        r = await client.post("/debit-notes", json={
            "contact_id": str(contact_id), "issue_date": "2026-08-21T00:00:00Z", "currency": "MYR",
            "line_items": [{"description": "T", "account_id": str(rev), "quantity": 1, "unit_price": 90.0, "tax_rate": 0}],
        })
        dn_id = r.json()["id"]

        r = await client.patch(f"/debit-notes/{dn_id}/status", params={"status": "void"})
        assert r.status_code == 200, r.text

        r = await client.patch(f"/debit-notes/{dn_id}/status", params={"status": "issued"})
        assert r.status_code == 400, r.text

        r = await client.get(f"/debit-notes/{dn_id}")
        assert r.json()["status"] == "void"
        await _assert_net_zero(client)


class TestPurchaseDebitNoteVoidAndReinstatement:
    """purchase_debit_notes.py had the same worse defect as debit_notes.py:
    void never reversed GL at all."""

    async def test_void_now_reverses_gl(self, client, org_with_defaults):
        contact_id = await _make_contact(org_with_defaults["org_id"], "Reinstate Test Vendor 3", "vendor")
        exp = org_with_defaults["accounts"]["5000"]
        r = await client.post("/purchase-debit-notes", json={
            "contact_id": str(contact_id), "issue_date": "2026-08-21T00:00:00Z", "currency": "MYR",
            "line_items": [{"description": "T", "account_id": str(exp), "quantity": 1, "unit_price": 45.0, "tax_rate": 0}],
        })
        assert r.status_code == 201, r.text
        pdn_id = r.json()["id"]

        r = await client.patch(f"/purchase-debit-notes/{pdn_id}/status", params={"status": "void"})
        assert r.status_code == 200, r.text
        await _assert_net_zero(client)

    async def test_reinstating_voided_purchase_debit_note_is_blocked(self, client, org_with_defaults):
        contact_id = await _make_contact(org_with_defaults["org_id"], "Reinstate Test Vendor 4", "vendor")
        exp = org_with_defaults["accounts"]["5000"]
        r = await client.post("/purchase-debit-notes", json={
            "contact_id": str(contact_id), "issue_date": "2026-08-21T00:00:00Z", "currency": "MYR",
            "line_items": [{"description": "T", "account_id": str(exp), "quantity": 1, "unit_price": 55.0, "tax_rate": 0}],
        })
        pdn_id = r.json()["id"]

        r = await client.patch(f"/purchase-debit-notes/{pdn_id}/status", params={"status": "void"})
        assert r.status_code == 200, r.text

        r = await client.patch(f"/purchase-debit-notes/{pdn_id}/status", params={"status": "issued"})
        assert r.status_code == 400, r.text

        r = await client.get(f"/purchase-debit-notes/{pdn_id}")
        assert r.json()["status"] == "void"
        await _assert_net_zero(client)


class TestAlreadySafeDocumentTypes:
    """Audited and found NOT to have the reinstatement gap. No fix applied.
    These tests pin the existing correct behaviour so a future change can't
    silently reopen the gap."""

    async def test_purchase_credit_note_already_blocks_any_post_void_transition(self, client, org_with_defaults):
        contact_id = await _make_contact(org_with_defaults["org_id"], "Reinstate Test Vendor 5", "vendor")
        exp = org_with_defaults["accounts"]["5000"]
        r = await client.post("/purchase-credit-notes", json={
            "contact_id": str(contact_id), "issue_date": "2026-08-21", "currency": "MYR",
            "line_items": [{"description": "T", "account_id": str(exp), "quantity": 1, "unit_price": 40.0, "tax_rate": 0}],
        })
        assert r.status_code == 201, r.text
        pcn_id = r.json()["id"]

        r = await client.patch(f"/purchase-credit-notes/{pcn_id}/status", params={"status": "issued"})
        assert r.status_code == 200, r.text
        r = await client.patch(f"/purchase-credit-notes/{pcn_id}/status", params={"status": "void"})
        assert r.status_code == 200, r.text

        r = await client.patch(f"/purchase-credit-notes/{pcn_id}/status", params={"status": "issued"})
        assert r.status_code == 400, "purchase_credit_notes.py already guards this — regression if it opens up"

    async def test_sale_receipt_has_no_reinstatement_route(self, client, org_with_defaults):
        contact_id = await _make_contact(org_with_defaults["org_id"])
        rev = org_with_defaults["accounts"]["4000"]
        bank_r = await client.post("/bank-accounts", json={
            "name": "Test Bank", "account_number": "999", "currency": "MYR",
            "account_id": str(org_with_defaults["accounts"]["1000"]),
        })
        assert bank_r.status_code in (200, 201), bank_r.text
        bank_id = bank_r.json()["id"]

        r = await client.post("/sale-receipts", json={
            "contact_id": str(contact_id), "receipt_date": "2026-08-21", "currency": "MYR",
            "bank_account_id": bank_id,
            "line_items": [{"description": "T", "account_id": str(rev), "quantity": 1, "unit_price": 20.0, "tax_rate": 0}],
        })
        assert r.status_code == 201, r.text
        receipt_id = r.json()["id"]

        r = await client.post(f"/sale-receipts/{receipt_id}/void")
        assert r.status_code == 200, r.text

        # No generic status-PATCH route exists for sale receipts at all.
        r = await client.patch(f"/sale-receipts/{receipt_id}/status", params={"status": "completed"})
        assert r.status_code == 404, "sale_receipts.py should have no reinstatement route — regression if one appears"
