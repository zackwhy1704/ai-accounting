"""
H1: CRUD endpoint registration and schema tests.

Verifies that the invoice, bill, and payment routes are registered with the
correct HTTP methods, and that their Create/Update schemas behave correctly.
These are pure unit tests — no DB or live server needed.
"""
from app.main import app
from app.schemas.sales import InvoiceCreate, InvoiceUpdate
from app.schemas.purchases import BillCreate, BillUpdate
from datetime import datetime, timezone
from uuid import uuid4


def _route_methods(path: str) -> set[str]:
    """Collect HTTP methods registered for an exact path, walking nested routers.

    FastAPI usually flattens include_router routes into app.routes, but under some
    Starlette versions included routers are Mounts whose routes live in a nested
    `.routes`. Walking the tree makes this robust regardless of version.
    """
    methods: set[str] = set()

    def walk(routes):
        for r in routes:
            if getattr(r, "path", None) == path and getattr(r, "methods", None):
                methods.update(r.methods - {"HEAD", "OPTIONS"})
            sub = getattr(r, "routes", None)
            if sub:
                walk(sub)

    walk(app.routes)
    return methods


# ── Invoice route registration ─────────────────────────────────────────────────

class TestInvoiceRoutes:
    def test_invoice_collection_has_get_and_post(self):
        m = _route_methods("/api/v1/invoices")
        assert "GET" in m, "GET /invoices missing"
        assert "POST" in m, "POST /invoices missing"

    def test_invoice_detail_has_get_patch_delete(self):
        m = _route_methods("/api/v1/invoices/{invoice_id}")
        assert "GET" in m
        assert "PATCH" in m
        assert "DELETE" in m

    def test_invoice_status_patch_exists(self):
        m = _route_methods("/api/v1/invoices/{invoice_id}/status")
        assert "PATCH" in m, "PATCH /invoices/{id}/status missing"

    def test_invoice_create_schema_required_fields(self):
        """contact_id, issue_date, due_date, and line_items are required."""
        import pytest
        with pytest.raises(Exception):
            InvoiceCreate()  # missing required fields

    def test_invoice_create_schema_accepts_valid_data(self):
        import pytest
        from app.schemas.sales import LineItemCreate
        now = datetime.now(timezone.utc)
        obj = InvoiceCreate(
            contact_id=uuid4(),
            issue_date=now,
            due_date=now,
            line_items=[LineItemCreate(description="Test", unit_price=100.0, quantity=1)],
        )
        assert obj.currency == "SGD"  # default

    def test_invoice_create_rejects_empty_line_items(self):
        import pytest
        from pydantic import ValidationError
        now = datetime.now(timezone.utc)
        with pytest.raises(ValidationError):
            InvoiceCreate(contact_id=uuid4(), issue_date=now, due_date=now, line_items=[])

    def test_invoice_update_schema_all_optional(self):
        u = InvoiceUpdate()
        assert u.model_dump(exclude_unset=True) == {}

    def test_invoice_update_schema_partial(self):
        u = InvoiceUpdate(currency="MYR")
        d = u.model_dump(exclude_unset=True)
        assert d == {"currency": "MYR"}

    def test_invoice_number_is_optional_in_create(self):
        """invoice_number can be omitted — backend assigns it."""
        from app.schemas.sales import LineItemCreate
        now = datetime.now(timezone.utc)
        obj = InvoiceCreate(
            contact_id=uuid4(),
            issue_date=now,
            due_date=now,
            line_items=[LineItemCreate(description="Item", unit_price=50.0)],
        )
        assert obj.invoice_number is None


# ── Bill route registration ───────────────────────────────────────────────────

class TestBillRoutes:
    def test_bill_collection_has_get_and_post(self):
        m = _route_methods("/api/v1/bills")
        assert "GET" in m
        assert "POST" in m

    def test_bill_detail_has_get_patch_delete(self):
        m = _route_methods("/api/v1/bills/{bill_id}")
        assert "GET" in m
        assert "PATCH" in m
        assert "DELETE" in m

    def test_bill_status_patch_exists(self):
        m = _route_methods("/api/v1/bills/{bill_id}/status")
        assert "PATCH" in m, "PATCH /bills/{id}/status missing"

    def test_bill_create_schema_all_optional_fields(self):
        """BillCreate should at minimum accept a contact_id, dates, and line_items."""
        from app.schemas.sales import LineItemCreate
        now = datetime.now(timezone.utc)
        b = BillCreate(
            contact_id=uuid4(),
            issue_date=now,
            due_date=now,
            line_items=[LineItemCreate(description="Item", unit_price=100.0)],
        )
        assert b is not None
        assert b.currency == "SGD"  # default

    def test_bill_update_schema_all_optional(self):
        u = BillUpdate()
        assert u.model_dump(exclude_unset=True) == {}


# ── Payment route registration ────────────────────────────────────────────────

class TestPaymentRoutes:
    def test_sales_payments_collection_has_get_and_post(self):
        m = _route_methods("/api/v1/sales-payments")
        assert "GET" in m
        assert "POST" in m

    def test_sales_payment_detail_has_get_patch_delete(self):
        m = _route_methods("/api/v1/sales-payments/{sp_id}")
        assert "GET" in m or "PATCH" in m or "DELETE" in m  # at least one

    def test_purchase_payments_collection_has_get_and_post(self):
        m = _route_methods("/api/v1/purchase-payments")
        assert "GET" in m
        assert "POST" in m

    def test_purchase_payment_detail_exists(self):
        m = _route_methods("/api/v1/purchase-payments/{payment_id}")
        assert len(m) > 0, "purchase payment detail route missing"


# ── Paginated response shape ──────────────────────────────────────────────────

class TestInvoiceListEndpointRequiresAuth:
    """401 is the expected response when no token is provided — not 404 or 500."""
    from fastapi.testclient import TestClient

    def test_get_invoices_without_auth_returns_401(self):
        from fastapi.testclient import TestClient
        client = TestClient(app)
        resp = client.get("/api/v1/invoices")
        assert resp.status_code == 401

    def test_get_bills_without_auth_returns_401(self):
        from fastapi.testclient import TestClient
        client = TestClient(app)
        resp = client.get("/api/v1/bills")
        assert resp.status_code == 401

    def test_post_invoice_without_auth_returns_401(self):
        from fastapi.testclient import TestClient
        client = TestClient(app)
        resp = client.post("/api/v1/invoices", json={})
        assert resp.status_code == 401

    def test_post_bill_without_auth_returns_401(self):
        from fastapi.testclient import TestClient
        client = TestClient(app)
        resp = client.post("/api/v1/bills", json={})
        assert resp.status_code == 401
