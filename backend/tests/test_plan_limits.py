"""
P0/P1 launch-blocker tests: plan-limit enforcement.

- AI scans are gated BEFORE OCR runs (402 at the cap, allowed under it), and the
  slot is reserved atomically at upload time.
- The seat helper blocks adding a user past users_limit.

Uses the conftest NullPool session + client fixtures. Skips if DB unreachable.
"""
import io
import uuid
import pytest
from datetime import datetime, timezone

from sqlalchemy import select
from tests.conftest import async_session
from app.models.auth import Organization, User, UserOrganization

pytestmark = pytest.mark.asyncio


async def _set_scan_limit(org_id, limit, used=0):
    async with async_session() as s:
        org = (await s.execute(select(Organization).where(Organization.id == org_id))).scalar_one()
        org.ai_scans_limit = limit
        org.ai_scans_used = used
        await s.commit()


def _fake_upload():
    return {"file": ("receipt.png", io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * 64), "image/png")}


class TestAiScanLimit:
    async def test_upload_blocked_at_limit(self, client, org_with_defaults):
        org_id = org_with_defaults["org_id"]
        await _set_scan_limit(org_id, limit=3, used=3)   # already at cap
        r = await client.post("/documents", files=_fake_upload())
        assert r.status_code == 402, r.text
        assert "limit" in r.text.lower()

    async def test_upload_allowed_under_limit_reserves_slot(self, client, org_with_defaults):
        org_id = org_with_defaults["org_id"]
        await _set_scan_limit(org_id, limit=3, used=0)
        r = await client.post("/documents", files=_fake_upload())
        # Upload accepted (processing happens in the background); slot reserved.
        assert r.status_code in (200, 201), r.text
        async with async_session() as s:
            org = (await s.execute(select(Organization).where(Organization.id == org_id))).scalar_one()
            assert org.ai_scans_used == 1, "scan slot must be reserved at upload time"

    async def test_unlimited_plan_never_blocks(self, client, org_with_defaults):
        org_id = org_with_defaults["org_id"]
        await _set_scan_limit(org_id, limit=-1, used=9999)
        r = await client.post("/documents", files=_fake_upload())
        assert r.status_code in (200, 201), r.text


class TestScanResetOnBillingCycle:
    async def test_invoice_paid_resets_scan_counter(self, client, org_with_defaults, monkeypatch):
        """invoice.paid (billing cycle rollover) must reset ai_scans_used to 0 so
        paying customers get their full monthly allowance — otherwise the counter
        only climbs and they eventually hit the cap forever."""
        org_id = org_with_defaults["org_id"]
        cust = f"cus_test_{uuid.uuid4().hex[:10]}"   # unique per run — no collision with stale orgs
        async with async_session() as s:
            org = (await s.execute(select(Organization).where(Organization.id == org_id))).scalar_one()
            org.stripe_customer_id = cust
            org.ai_scans_used = 30
            await s.commit()

        # Make the webhook parser return an invoice.paid for our customer.
        import app.api.v1.billing as billing_mod
        async def fake_handle_webhook(payload, sig):
            return {"type": "invoice.paid", "data": {"customer": cust}}
        monkeypatch.setattr(billing_mod.stripe_service, "handle_webhook", fake_handle_webhook)

        r = await client.post("/billing/webhook", content=b"{}", headers={"stripe-signature": "x"})
        assert r.status_code == 200, r.text

        async with async_session() as s:
            org = (await s.execute(select(Organization).where(Organization.id == org_id))).scalar_one()
            assert org.ai_scans_used == 0, "scan counter must reset on invoice.paid"


class TestSeatLimitHelper:
    async def test_seat_helper_blocks_at_limit(self, org_with_defaults):
        from app.core.limits import assert_seat_available
        from fastapi import HTTPException
        org_id = org_with_defaults["org_id"]
        # Seed the org to its seat cap: limit 1, and the org already has its owner user.
        async with async_session() as s:
            org = (await s.execute(select(Organization).where(Organization.id == org_id))).scalar_one()
            org.users_limit = 1
            u = User(organization_id=org_id, email=f"seat_{uuid.uuid4().hex[:6]}@t.local",
                     hashed_password="x", full_name="Seat User", role="admin")
            s.add(u)
            await s.flush()
            s.add(UserOrganization(user_id=u.id, organization_id=org_id, role="owner", is_default=True))
            await s.commit()

        async with async_session() as s:
            with pytest.raises(HTTPException) as exc:
                await assert_seat_available(s, org_id)
            assert exc.value.status_code == 402

    async def test_seat_helper_allows_unlimited(self, org_with_defaults):
        from app.core.limits import assert_seat_available
        org_id = org_with_defaults["org_id"]
        async with async_session() as s:
            org = (await s.execute(select(Organization).where(Organization.id == org_id))).scalar_one()
            org.users_limit = -1
            await s.commit()
        async with async_session() as s:
            await assert_seat_available(s, org_id)  # must not raise
