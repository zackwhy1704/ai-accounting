"""Tests for global error-handling + observability middleware in app/main.py."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_httpexception_passthrough_not_swallowed():
    """Auth-protected route should return 401 (HTTPException), not be turned into 500."""
    resp = client.get("/api/v1/invoices")
    assert resp.status_code == 401, resp.text
    # Should still carry the normal HTTPException 'detail' shape.
    assert "detail" in resp.json()


def test_unknown_path_returns_404_not_500():
    """A totally unknown path must be FastAPI's default 404, not swallowed to 500."""
    resp = client.get("/api/this/path/does/not/exist")
    assert resp.status_code == 404, resp.text


def test_request_id_header_present_on_normal_response():
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert "X-Request-ID" in resp.headers
    assert len(resp.headers["X-Request-ID"]) > 0


def test_validation_error_shape():
    """Missing/bad body on login should return a structured 422."""
    resp = client.post("/api/v1/auth/login", json={})
    assert resp.status_code == 422, resp.text
    body = resp.json()
    assert body["error"] == "Validation error"
    assert isinstance(body["details"], list)
    assert len(body["details"]) > 0
    assert "field" in body["details"][0]
    assert "message" in body["details"][0]
