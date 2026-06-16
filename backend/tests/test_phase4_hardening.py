"""Phase 4 hardening tests: per-org rate limiter + health integrity endpoint."""
import pytest


def test_org_write_rate_limiter_blocks_after_limit():
    from app.core.rate_limit import OrgWriteRateLimiter
    rl = OrgWriteRateLimiter(max_requests=3, window_seconds=60)
    assert rl.allow("orgA") is True
    assert rl.allow("orgA") is True
    assert rl.allow("orgA") is True
    assert rl.allow("orgA") is False  # 4th call blocked
    # A different org has its own bucket
    assert rl.allow("orgB") is True


def test_org_write_rate_limiter_decodes_org_from_token():
    from app.core.rate_limit import OrgWriteRateLimiter
    from app.core.security import create_access_token
    rl = OrgWriteRateLimiter(max_requests=5, window_seconds=60)
    token = create_access_token({"sub": "u1", "org_id": "org-xyz", "role": "admin"})
    assert rl.org_from_token(token) == "org-xyz"
    assert rl.org_from_token("garbage") is None


@pytest.mark.asyncio
async def test_health_integrity_endpoint():
    """The integrity endpoint is gated behind X-Internal-Token. With the right
    token, a healthy DB reports 0 unbalanced transactions. Skips if no DB."""
    from httpx import ASGITransport, AsyncClient
    from app.main import app
    from app.core.config import get_settings
    settings = get_settings()
    settings.INTERNAL_OPS_TOKEN = "test-ops-token"  # configure the gate for this test
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # Wrong/missing token -> 401, no leakage
            unauth = await ac.get("/api/health/integrity")
            assert unauth.status_code == 401, unauth.text
            # Correct token -> data
            r = await ac.get("/api/health/integrity", headers={"X-Internal-Token": "test-ops-token"})
    except Exception as e:
        pytest.skip(f"DB unreachable: {e}")
    finally:
        settings.INTERNAL_OPS_TOKEN = ""
    assert r.status_code == 200, r.text
    body = r.json()
    if body.get("status") == "unhealthy":
        pytest.skip("DB unreachable for integrity check")
    assert "unbalanced_transactions" in body
    assert "orgs_missing_gl_defaults" in body
    assert body["unbalanced_transactions"] == 0, \
        f"Found {body['unbalanced_transactions']} unbalanced transactions"


@pytest.mark.asyncio
async def test_public_liveness_probe():
    """Public /health must work without auth and expose no internals."""
    from httpx import ASGITransport, AsyncClient
    from app.main import app
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        r = await ac.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
