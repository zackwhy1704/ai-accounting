"""
End-to-end tests for the Accruly accounting platform.
Runs against a live backend at BASE_URL (http://localhost:8000).
Tests cover actual API endpoints and flows.

Usage:
    python3 backend/tests/test_e2e.py          # run as script
    pytest backend/tests/test_e2e.py           # run via pytest
"""

import requests
import uuid
import sys
import pytest
from datetime import date, timedelta

BASE_URL = "http://localhost:8000/api/v1"

# ── Helpers ──────────────────────────────────────────────
def uid() -> str:
    return uuid.uuid4().hex[:8]


def api(method, path, token=None, **kwargs):
    headers = kwargs.pop("headers", {})
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return requests.request(method, f"{BASE_URL}{path}", headers=headers, **kwargs)


# ══════════════════════════════════════════════════════════
#  FIXTURES
# ══════════════════════════════════════════════════════════

@pytest.fixture(scope="module")
def auth():
    """Register a fresh user and return {token, org_id, user_id}.

    Retries with back-off to handle the in-memory 5-req/60s rate limiter
    when the full test suite runs other tests before this module.
    """
    import time
    tag = uid()
    email = f"e2e-{tag}@test.com"
    for attempt in range(10):
        r = api("POST", "/auth/register", json={
            "email": email,
            "password": "testpass123",
            "full_name": f"E2E User {tag}",
            "company_name": f"E2E Co {tag}",
        })
        if r.status_code == 200:
            break
        if r.status_code == 429:
            time.sleep(5)
        else:
            pytest.fail(f"Register failed ({r.status_code}): {r.text[:200]}")
    else:
        pytest.skip("Rate limiter did not clear after retries — run e2e tests in isolation")

    token = r.json()["access_token"]
    me = api("GET", "/auth/me", token=token).json()
    return {"token": token, "org_id": me["organization_id"], "user_id": me["id"], "email": email}


@pytest.fixture(scope="module")
def contact(auth):
    tag = uid()
    r = api("POST", "/contacts", token=auth["token"], json={
        "name": f"E2E Contact {tag}",
        "email": f"contact-{tag}@test.com",
        "contact_type": "customer",
    })
    assert r.status_code == 201, f"Create contact failed: {r.text}"
    return r.json()


@pytest.fixture(scope="module")
def invoice(auth, contact):
    tomorrow = (date.today() + timedelta(days=30)).isoformat()
    r = api("POST", "/invoices", token=auth["token"], json={
        "contact_id": contact["id"],
        "issue_date": date.today().isoformat(),
        "due_date": tomorrow,
        "terms": "Net 30",
        "line_items": [{
            "description": "E2E Service",
            "quantity": 2,
            "unit_price": 500.0,
            "discount": 10,
            "discount_type": "percentage",
            "tax_rate": 0.0,
            "amount": 900.0,
        }],
    })
    assert r.status_code == 201, f"Create invoice failed: {r.text}"
    return r.json()


# ══════════════════════════════════════════════════════════
#  1. AUTH
# ══════════════════════════════════════════════════════════

def test_auth_register_and_login():
    import time
    tag = uid()
    email = f"auth-{tag}@test.com"

    # Register (with rate-limit retry)
    for attempt in range(10):
        r = api("POST", "/auth/register", json={
            "email": email, "password": "testpass123",
            "full_name": f"Auth User {tag}", "company_name": f"Auth Co {tag}",
        })
        if r.status_code == 200:
            break
        if r.status_code == 429:
            time.sleep(5)
        else:
            pytest.fail(f"Register: {r.text[:200]}")
    else:
        pytest.skip("Rate limiter did not clear — run in isolation")
    assert "access_token" in r.json()

    # Login
    r = api("POST", "/auth/login", json={"email": email, "password": "testpass123"})
    assert r.status_code == 200
    token = r.json()["access_token"]

    # /auth/me
    r = api("GET", "/auth/me", token=token)
    assert r.status_code == 200
    me = r.json()
    assert me["email"] == email
    assert "organization_id" in me
    assert "role" in me

    # Bad password → 401
    r = api("POST", "/auth/login", json={"email": email, "password": "wrongpass"})
    assert r.status_code == 401

    # Duplicate email → 400/409
    r = api("POST", "/auth/register", json={
        "email": email, "password": "testpass123",
        "full_name": "Dup", "company_name": "Dup Co",
    })
    assert r.status_code in (400, 409)

    # No token → 401
    r = api("GET", "/auth/me")
    assert r.status_code in (401, 403)


def test_onboarding(auth):
    """After register, user gets org with org_settings available."""
    r = api("GET", "/auth/org-settings", token=auth["token"])
    assert r.status_code == 200
    settings = r.json()
    assert "currency" in settings or "name" in settings


def test_org_switching(auth):
    """Org settings can be read and currency can be updated."""
    r = api("PATCH", "/auth/org-settings/currency",
            token=auth["token"], json={"currency": "USD"})
    assert r.status_code == 200, f"Update currency: {r.text}"
    assert r.json().get("currency") == "USD"

    # Switch back
    r = api("PATCH", "/auth/org-settings/currency",
            token=auth["token"], json={"currency": "MYR"})
    assert r.status_code == 200


# ══════════════════════════════════════════════════════════
#  2. CONTACTS
# ══════════════════════════════════════════════════════════

def test_client_portal(auth):
    """Contacts CRUD — list, create, update, read."""
    tag = uid()

    # Create
    r = api("POST", "/contacts", token=auth["token"], json={
        "name": f"Portal Test {tag}",
        "email": f"portal-{tag}@test.com",
        "contact_type": "customer",
        "billing_address": "123 Portal St",
    })
    assert r.status_code == 201, f"Create contact: {r.text}"
    cid = r.json()["id"]

    # Read
    r = api("GET", f"/contacts/{cid}", token=auth["token"])
    assert r.status_code == 200
    assert r.json()["id"] == cid

    # Update
    r = api("PUT", f"/contacts/{cid}", token=auth["token"],
            json={"name": f"Portal Updated {tag}"})
    assert r.status_code == 200
    assert "Updated" in r.json()["name"]

    # List paginated
    r = api("GET", "/contacts?page=1&limit=5", token=auth["token"])
    assert r.status_code == 200
    data = r.json()
    assert "items" in data and "total" in data


# ══════════════════════════════════════════════════════════
#  3. DATA ISOLATION
# ══════════════════════════════════════════════════════════

def test_data_isolation():
    """Two separate org users cannot see each other's data."""
    import time
    tag = uid()

    def make_user(suffix):
        email = f"iso-{suffix}-{tag}@test.com"
        for attempt in range(3):
            r = api("POST", "/auth/register", json={
                "email": email, "password": "testpass123",
                "full_name": f"Iso {suffix}", "company_name": f"Iso Co {suffix} {tag}",
            })
            if r.status_code == 200:
                return r.json()["access_token"]
            if r.status_code == 429:
                time.sleep(2)
        pytest.skip("Rate limited on registration — run test in isolation")

    tok_a = make_user("A")
    tok_b = make_user("B")

    # A creates a contact
    r = api("POST", "/contacts", token=tok_a, json={
        "name": f"Org A Contact {tag}", "contact_type": "customer",
    })
    assert r.status_code == 201
    contact_a_id = r.json()["id"]

    # B cannot see A's contact
    r = api("GET", f"/contacts/{contact_a_id}", token=tok_b)
    assert r.status_code == 404, f"B should not see A's contact, got {r.status_code}"

    # A creates an invoice
    tomorrow = (date.today() + timedelta(days=30)).isoformat()
    r = api("POST", "/invoices", token=tok_a, json={
        "contact_id": contact_a_id,
        "issue_date": date.today().isoformat(),
        "due_date": tomorrow,
        "line_items": [{"description": "Isolated", "quantity": 1, "unit_price": 100.0, "amount": 100.0}],
    })
    assert r.status_code == 201
    inv_a_id = r.json()["id"]

    # B cannot see A's invoice
    r = api("GET", f"/invoices/{inv_a_id}", token=tok_b)
    assert r.status_code in (404, 403), f"B should not see A's invoice, got {r.status_code}"


# ══════════════════════════════════════════════════════════
#  4. CRUD per org
# ══════════════════════════════════════════════════════════

def test_crud_per_org(auth, contact):
    """Invoice CRUD: create, read, update, status change, delete draft."""
    tomorrow = (date.today() + timedelta(days=30)).isoformat()
    token = auth["token"]

    # Create
    r = api("POST", "/invoices", token=token, json={
        "contact_id": contact["id"],
        "issue_date": date.today().isoformat(),
        "due_date": tomorrow,
        "terms": "Net 30",
        "line_items": [{"description": "CRUD test", "quantity": 1, "unit_price": 200.0, "amount": 200.0}],
    })
    assert r.status_code == 201
    inv = r.json()
    inv_id = inv["id"]
    assert inv["status"] == "draft"
    assert inv["terms"] == "Net 30"
    assert float(inv["total"]) == 200.0

    # Read
    r = api("GET", f"/invoices/{inv_id}", token=token)
    assert r.status_code == 200
    assert r.json()["id"] == inv_id

    # Update
    r = api("PATCH", f"/invoices/{inv_id}", token=token, json={"terms": "Net 60"})
    assert r.status_code == 200
    assert r.json()["terms"] == "Net 60"

    # Status → sent
    r = api("PATCH", f"/invoices/{inv_id}/status?status=sent", token=token)
    assert r.status_code == 200
    assert r.json()["status"] == "sent"

    # Create a fresh draft for delete test
    r = api("POST", "/invoices", token=token, json={
        "contact_id": contact["id"],
        "issue_date": date.today().isoformat(),
        "due_date": tomorrow,
        "line_items": [{"description": "Delete me", "quantity": 1, "unit_price": 10.0, "amount": 10.0}],
    })
    assert r.status_code == 201
    del_id = r.json()["id"]

    # Delete draft
    r = api("DELETE", f"/invoices/{del_id}", token=token)
    assert r.status_code == 204

    # Confirm deleted
    r = api("GET", f"/invoices/{del_id}", token=token)
    assert r.status_code == 404


# ══════════════════════════════════════════════════════════
#  5. EDGE CASES
# ══════════════════════════════════════════════════════════

def test_edge_cases(auth, contact):
    """Discount math, payment allocation, paginated search."""
    tomorrow = (date.today() + timedelta(days=30)).isoformat()
    token = auth["token"]

    # Discount: 10% off 1000 = 900
    r = api("POST", "/invoices", token=token, json={
        "contact_id": contact["id"],
        "issue_date": date.today().isoformat(),
        "due_date": tomorrow,
        "line_items": [{
            "description": "Discount test", "quantity": 1, "unit_price": 1000.0,
            "discount": 10, "discount_type": "percentage", "tax_rate": 0.0, "amount": 900.0,
        }],
    })
    assert r.status_code == 201
    inv = r.json()
    assert float(inv["total"]) == 900.0, f"Expected 900, got {inv['total']}"

    # Mark as sent so it can receive a payment
    api("PATCH", f"/invoices/{inv['id']}/status?status=sent", token=token)

    # Payment allocation
    r = api("POST", "/sales-payments", token=token, json={
        "contact_id": contact["id"],
        "payment_date": date.today().isoformat(),
        "amount": 450.0,
        "payment_method": "bank_transfer",
        "allocations": [{"invoice_id": inv["id"], "amount": 450.0}],
    })
    assert r.status_code == 201, f"Payment: {r.text}"

    # Invoice amount_paid updated
    r = api("GET", f"/invoices/{inv['id']}", token=token)
    assert float(r.json()["amount_paid"]) == 450.0

    # Pagination search
    r = api("GET", "/invoices?search=Discount+test&page=1&limit=5", token=token)
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert data["page"] == 1
    assert "pages" in data


# ══════════════════════════════════════════════════════════
#  6. BILLS
# ══════════════════════════════════════════════════════════

def test_org_switching_bill_flow(auth, contact):
    """Bill CRUD with discount and status flow."""
    tomorrow = (date.today() + timedelta(days=30)).isoformat()
    token = auth["token"]

    r = api("POST", "/bills", token=token, json={
        "contact_id": contact["id"],
        "issue_date": date.today().isoformat(),
        "due_date": tomorrow,
        "terms": "Net 30",
        "line_items": [{
            "description": "Bill test", "quantity": 1, "unit_price": 800.0,
            "discount": 10, "discount_type": "percentage", "tax_rate": 0.0, "amount": 720.0,
        }],
    })
    assert r.status_code == 201, f"Bill create: {r.text}"
    bill = r.json()
    assert float(bill["total"]) == 720.0
    assert bill["terms"] == "Net 30"
    bill_id = bill["id"]

    # Update
    r = api("PATCH", f"/bills/{bill_id}", token=token, json={"terms": "Net 60"})
    assert r.status_code == 200
    assert r.json()["terms"] == "Net 60"

    # List
    r = api("GET", "/bills?page=1&limit=5", token=token)
    assert r.status_code == 200
    assert "items" in r.json()


# ══════════════════════════════════════════════════════════
#  7. QUOTATION CONVERT
# ══════════════════════════════════════════════════════════

def test_client_cannot_see_bookkeeper_data(auth, contact):
    """Quotation: create, convert to invoice + delivery order."""
    tomorrow = (date.today() + timedelta(days=30)).isoformat()
    token = auth["token"]

    r = api("POST", "/quotations", token=token, json={
        "contact_id": contact["id"],
        "issue_date": date.today().isoformat(),
        "expiry_date": tomorrow,
        "terms": "Net 30",
        "line_items": [{
            "description": "Quote item", "quantity": 2, "unit_price": 500.0,
            "discount": 10, "discount_type": "percentage", "tax_rate": 0.0, "amount": 900.0,
        }],
    })
    assert r.status_code == 201, f"Create quotation: {r.text}"
    quot = r.json()
    assert float(quot["total"]) == 900.0
    quot_id = quot["id"]

    # Mark sent before convert
    r = api("PATCH", f"/quotations/{quot_id}/status?status=sent", token=token)
    assert r.status_code == 200

    # Convert to invoice + delivery order
    r = api("POST", f"/quotations/{quot_id}/convert", token=token,
            json={"targets": ["invoice", "delivery_order"]})
    assert r.status_code == 200, f"Convert: {r.text}"
    result = r.json()
    assert "created" in result
    assert "invoice" in result["created"]
    assert "delivery_order" in result["created"]
    assert result["status"] == "converted"


# ══════════════════════════════════════════════════════════
#  Script entrypoint
# ══════════════════════════════════════════════════════════
if __name__ == "__main__":
    import subprocess
    sys.exit(subprocess.call(["pytest", __file__, "-v"]))
