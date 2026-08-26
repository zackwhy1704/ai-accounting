"""
DELETE /bank-reconciliation/lines/{id} — added because there was previously
no way to remove a statement line at all (wrong file imported, duplicate
entry, mistaken manual add), which surfaced as a real cleanup wall in normal
use, not just a test-data inconvenience. Only unmatched lines are deletable —
a matched/reconciled line is tied to a real GL transaction and must be
unmatched first, mirroring the refund void-before-delete pattern.
"""
import pytest
from datetime import datetime, timezone

pytestmark = pytest.mark.asyncio


class TestBankStatementLineDelete:
    async def test_unmatched_line_can_be_deleted(self, client, org_with_defaults):
        r = await client.post("/bank-reconciliation/lines", json={
            "date": "2026-01-15", "description": "Test line", "debit": 0, "credit": 25.0,
        })
        assert r.status_code == 200, r.text
        line_id = r.json()["id"]

        r = await client.delete(f"/bank-reconciliation/lines/{line_id}")
        assert r.status_code == 204, r.text

        r = await client.get("/bank-reconciliation/lines")
        ids = [l["id"] for l in r.json()]
        assert line_id not in ids

    async def test_matched_line_cannot_be_deleted(self, client, org_with_defaults):
        r = await client.post("/bank-reconciliation/lines", json={
            "date": "2026-01-15", "description": "Test line", "debit": 0, "credit": 25.0,
        })
        line_id = r.json()["id"]

        from tests.conftest import async_session
        from sqlalchemy import select, update
        from app.models.models import BankStatementLine
        async with async_session() as s:
            await s.execute(
                update(BankStatementLine).where(BankStatementLine.id == line_id).values(status="matched")
            )
            await s.commit()

        r = await client.delete(f"/bank-reconciliation/lines/{line_id}")
        assert r.status_code == 400, r.text
        assert "unmatch" in r.json()["detail"].lower()

    async def test_delete_nonexistent_line_returns_404(self, client, org_with_defaults):
        import uuid
        r = await client.delete(f"/bank-reconciliation/lines/{uuid.uuid4()}")
        assert r.status_code == 404
