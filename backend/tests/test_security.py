"""
Phase 6 security hardening — unit tests.

Covers: in-memory rate limiter window behavior, RBAC require_role dependency,
secret-key startup guard, and route wiring (auth limited, email gated).
"""
import time
import pytest
from types import SimpleNamespace
from fastapi import HTTPException

from app.core.rate_limit import RateLimiter
from app.core.permissions import require_role, WRITE_ROLES, ADMIN_ROLES
from app.main import app


def _fake_request(ip: str = "1.2.3.4"):
    return SimpleNamespace(headers={}, client=SimpleNamespace(host=ip))


class TestRateLimiter:
    @pytest.mark.asyncio
    async def test_allows_up_to_limit(self):
        rl = RateLimiter(max_requests=3, window_seconds=60)
        req = _fake_request()
        for _ in range(3):
            await rl(req)  # should not raise

    @pytest.mark.asyncio
    async def test_blocks_over_limit(self):
        rl = RateLimiter(max_requests=2, window_seconds=60)
        req = _fake_request()
        await rl(req)
        await rl(req)
        with pytest.raises(HTTPException) as exc:
            await rl(req)
        assert exc.value.status_code == 429
        assert "Retry-After" in exc.value.headers

    @pytest.mark.asyncio
    async def test_separate_ips_independent(self):
        rl = RateLimiter(max_requests=1, window_seconds=60)
        await rl(_fake_request("10.0.0.1"))
        # different IP gets its own bucket
        await rl(_fake_request("10.0.0.2"))

    @pytest.mark.asyncio
    async def test_window_expiry_frees_slots(self):
        rl = RateLimiter(max_requests=1, window_seconds=1)
        req = _fake_request("9.9.9.9")
        await rl(req)
        with pytest.raises(HTTPException):
            await rl(req)
        time.sleep(1.1)
        await rl(req)  # window elapsed, allowed again

    @pytest.mark.asyncio
    async def test_honors_x_forwarded_for(self):
        rl = RateLimiter(max_requests=1, window_seconds=60)
        r1 = SimpleNamespace(headers={"x-forwarded-for": "5.5.5.5, 10.0.0.1"}, client=SimpleNamespace(host="10.0.0.1"))
        await rl(r1)
        with pytest.raises(HTTPException):
            await rl(r1)  # same forwarded client IP


class TestRequireRole:
    @pytest.mark.asyncio
    async def test_allows_matching_role(self):
        checker = require_role("owner", "admin")
        user = await checker(current_user={"role": "admin", "sub": "x"})
        assert user["role"] == "admin"

    @pytest.mark.asyncio
    async def test_rejects_other_role(self):
        checker = require_role("owner", "admin")
        with pytest.raises(HTTPException) as exc:
            await checker(current_user={"role": "viewer"})
        assert exc.value.status_code == 403

    @pytest.mark.asyncio
    async def test_viewer_blocked_from_write_roles(self):
        checker = require_role(*WRITE_ROLES)
        with pytest.raises(HTTPException):
            await checker(current_user={"role": "viewer"})
        # bookkeeper allowed
        await checker(current_user={"role": "bookkeeper"})

    def test_role_sets(self):
        assert "viewer" not in WRITE_ROLES
        assert "viewer" not in ADMIN_ROLES
        assert set(ADMIN_ROLES) <= set(WRITE_ROLES)


class TestSecretKeyGuard:
    def test_production_with_default_secret_exits(self, monkeypatch):
        from app.core import config
        config.get_settings.cache_clear()
        monkeypatch.setenv("DEBUG", "false")
        monkeypatch.setenv("SECRET_KEY", config.INSECURE_DEFAULT_SECRET)
        with pytest.raises(SystemExit):
            config.get_settings()
        config.get_settings.cache_clear()

    def test_production_with_real_secret_ok(self, monkeypatch):
        from app.core import config
        config.get_settings.cache_clear()
        monkeypatch.setenv("DEBUG", "false")
        monkeypatch.setenv("SECRET_KEY", "a-real-strong-secret-value")
        s = config.get_settings()
        assert s.SECRET_KEY == "a-real-strong-secret-value"
        config.get_settings.cache_clear()


class TestRouteWiring:
    def _deps(self, path: str) -> int:
        for r in app.routes:
            if getattr(r, "path", None) == path and hasattr(r, "dependant"):
                return len(r.dependant.dependencies)
        return -1

    def test_auth_endpoints_have_rate_limit_dependency(self):
        for p in ("/api/v1/auth/login", "/api/v1/auth/register", "/api/v1/auth/forgot-password"):
            assert self._deps(p) >= 1, f"{p} missing rate-limit dependency"

    def test_email_endpoint_is_gated(self):
        assert self._deps("/api/health/email") >= 1
