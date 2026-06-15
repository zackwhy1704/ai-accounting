"""
Tests for Phase 3 (pagination envelope), Phase 6 (audit log writes), and Phase 7 (error handler).
All pure unit tests — no DB or server.
"""
import pytest
import math


# ── Phase 3: paginated_result ───────────────────────────────────────────────
# PaginationParams uses FastAPI Query() descriptors so it can't be constructed
# outside a request. We test paginated_result with a plain namespace instead.

from types import SimpleNamespace


def make_params(page=1, limit=10, search="", sort_by="created_at", sort_order="desc",
                date_from=None, date_to=None):
    """Plain-object stand-in for PaginationParams (same attributes, no FastAPI Query)."""
    p = SimpleNamespace(
        page=page, limit=limit, search=search.strip(),
        sort_by=sort_by, sort_order=sort_order,
        offset=(page - 1) * limit,
        date_from=date_from, date_to=date_to,
    )
    return p


class TestPaginatedResult:
    def test_envelope_shape(self):
        from app.core.pagination import paginated_result
        p = make_params(page=1, limit=10)
        result = paginated_result(["a", "b", "c"], total=3, params=p)
        assert result["items"] == ["a", "b", "c"]
        assert result["total"] == 3
        assert result["page"] == 1
        assert result["limit"] == 10
        assert result["pages"] == 1

    def test_pages_calculation(self):
        from app.core.pagination import paginated_result
        p = make_params(page=1, limit=10)
        result = paginated_result([], total=55, params=p)
        assert result["pages"] == 6  # ceil(55/10)

    def test_pages_exact_multiple(self):
        from app.core.pagination import paginated_result
        p = make_params(page=1, limit=10)
        result = paginated_result([], total=50, params=p)
        assert result["pages"] == 5

    def test_pages_zero_total_returns_one(self):
        from app.core.pagination import paginated_result
        p = make_params(page=1, limit=10)
        result = paginated_result([], total=0, params=p)
        assert result["pages"] == 1

    def test_page_and_limit_echoed(self):
        from app.core.pagination import paginated_result
        p = make_params(page=3, limit=25)
        result = paginated_result([], total=100, params=p)
        assert result["page"] == 3
        assert result["limit"] == 25

    def test_items_are_passed_through(self):
        from app.core.pagination import paginated_result
        p = make_params(page=1, limit=5)
        items = [{"id": i} for i in range(5)]
        result = paginated_result(items, total=100, params=p)
        assert result["items"] == items
        assert len(result["items"]) == 5

    def test_offset_calc(self):
        p = make_params(page=3, limit=10)
        assert p.offset == 20

    def test_search_stripped(self):
        p = make_params(search="  hello  ")
        assert p.search == "hello"


# ── Phase 6: log_audit() function ───────────────────────────────────────────

class TestAuditLog:
    def test_log_audit_importable(self):
        from app.core.audit import log_audit
        assert callable(log_audit)

    def test_log_audit_is_coroutine(self):
        import asyncio
        from app.core.audit import log_audit
        import inspect
        assert asyncio.iscoroutinefunction(log_audit)

    def test_log_audit_swallows_exceptions(self):
        """log_audit must never raise — it swallows all errors."""
        import asyncio
        from app.core.audit import log_audit
        from unittest.mock import MagicMock, AsyncMock

        # Give it a DB that raises on .add()
        bad_db = MagicMock()
        bad_db.add.side_effect = RuntimeError("DB down")
        bad_db.flush = AsyncMock(side_effect=RuntimeError("DB down"))

        async def run():
            # Should NOT raise
            await log_audit(bad_db, "org-1", "user-1", "create", "invoice", "inv-id")

        asyncio.run(run())  # passes if no exception

    def test_log_audit_accepts_string_entity_id(self):
        """UUID-string entity_id must be coerced without error."""
        import asyncio
        from app.core.audit import log_audit
        from unittest.mock import MagicMock, AsyncMock

        db = MagicMock()
        db.add = MagicMock()
        db.flush = AsyncMock()

        async def run():
            await log_audit(db, "org-1", "user-1", "delete", "contact",
                            "550e8400-e29b-41d4-a716-446655440000")

        asyncio.run(run())
        assert db.add.called

    def test_log_audit_accepts_none_entity_id(self):
        import asyncio
        from app.core.audit import log_audit
        from unittest.mock import MagicMock, AsyncMock

        db = MagicMock()
        db.add = MagicMock()
        db.flush = AsyncMock()

        async def run():
            await log_audit(db, "org-1", "user-1", "update", "setting", None)

        asyncio.run(run())


# ── Phase 7: Error handlers ──────────────────────────────────────────────────

class TestErrorHandlers:
    def test_validation_handler_formats_field_errors(self):
        """RequestValidationError handler must produce {error, details: [{field, message}]}."""
        from fastapi.testclient import TestClient
        from fastapi import FastAPI
        from fastapi.exceptions import RequestValidationError
        from app.main import validation_handler  # re-use the handler

        # Build a tiny app with the same handler
        mini = FastAPI()
        mini.add_exception_handler(RequestValidationError, validation_handler)

        from pydantic import BaseModel

        class M(BaseModel):
            name: str

        @mini.post("/test")
        async def ep(body: M):
            return body

        client = TestClient(mini, raise_server_exceptions=False)
        resp = client.post("/test", json={})  # missing 'name'
        assert resp.status_code == 422
        data = resp.json()
        assert "error" in data
        assert "details" in data
        assert isinstance(data["details"], list)
        assert any("field" in d and "message" in d for d in data["details"])

    def test_unhandled_exception_returns_500_with_error_id(self):
        """Unhandled exceptions must return 500 with error_id."""
        from fastapi.testclient import TestClient
        from fastapi import FastAPI
        from app.main import unhandled_exception_handler

        mini = FastAPI()
        mini.add_exception_handler(Exception, unhandled_exception_handler)

        @mini.get("/boom")
        async def boom():
            raise RuntimeError("unexpected!")

        client = TestClient(mini, raise_server_exceptions=False)
        resp = client.get("/boom")
        assert resp.status_code == 500
        data = resp.json()
        assert "error" in data
        assert "error_id" in data

    def test_http_exception_passthrough(self):
        """Normal 404/400 HTTPExceptions must not become 500s."""
        from fastapi.testclient import TestClient
        from fastapi import FastAPI, HTTPException
        from starlette.exceptions import HTTPException as StarletteHTTPException
        from app.main import http_exception_passthrough

        mini = FastAPI()
        mini.add_exception_handler(StarletteHTTPException, http_exception_passthrough)

        @mini.get("/notfound")
        async def nf():
            raise HTTPException(status_code=404, detail="Not found")

        client = TestClient(mini, raise_server_exceptions=False)
        resp = client.get("/notfound")
        assert resp.status_code == 404
        assert resp.json()["detail"] == "Not found"
