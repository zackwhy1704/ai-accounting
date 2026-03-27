"""
End-to-end tests for the Accruly accounting platform.
Runs against a live backend at BASE_URL. Tests cover:

  1. Auth: register, login, me, org list
  2. Onboarding: SME flow, Firm flow
  3. Firm: settings, slug, dashboard, create/archive/restore clients
  4. Org switching: switch to client org, switch back to firm
  5. Client portal: public info, signup, doc upload
  6. Data isolation: client A cannot see client B data
  7. Navigation guards: firm endpoints fail for non-firm orgs
  8. Dashboard & CRUD: contacts, invoices, bills, accounts per org

Usage:
    python3 backend/tests/test_e2e.py
"""

import requests
import uuid
import sys
import json
from datetime import date

BASE_URL = "http://localhost:8000/api/v1"
PASS = 0
FAIL = 0
ERRORS: list[str] = []


# ── Helpers ──────────────────────────────────────────────
def uid() -> str:
    return uuid.uuid4().hex[:8]


def api(method, path, token=None, **kwargs):
    headers = kwargs.pop("headers", {})
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return requests.request(method, f"{BASE_URL}{path}", headers=headers, **kwargs)


def check(name: str, condition: bool, detail: str = ""):
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  \033[32m✓\033[0m {name}")
    else:
        FAIL += 1
        msg = f"{name}: {detail}" if detail else name
        ERRORS.append(msg)
        print(f"  \033[31m✗\033[0m {name}" + (f" — {detail}" if detail else ""))


def section(title: str):
    print(f"\n\033[1;36m{'─'*60}\033[0m")
    print(f"\033[1;36m  {title}\033[0m")
    print(f"\033[1;36m{'─'*60}\033[0m")


# ── State ────────────────────────────────────────────────
state = {}


# ══════════════════════════════════════════════════════════
#  1. AUTH: Register & Login
# ══════════════════════════════════════════════════════════
def test_auth_register_and_login():
    section("1. Auth: Register & Login")

    # --- Register SME user ---
    tag = uid()
    email_sme = f"sme-{tag}@test.com"
    r = api("POST", "/auth/register", json={
        "email": email_sme,
        "password": "testpass123",
        "full_name": f"SME User {tag}",
        "company_name": f"SME Co {tag}",
    })
    check("Register SME user", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
    state["sme_token"] = r.json().get("access_token")
    state["sme_email"] = email_sme

    # --- Register Firm user ---
    email_firm = f"firm-{tag}@test.com"
    r = api("POST", "/auth/register", json={
        "email": email_firm,
        "password": "testpass123",
        "full_name": f"Firm User {tag}",
        "company_name": f"Firm Co {tag}",
    })
    check("Register Firm user", r.status_code == 200, f"status={r.status_code}")
    state["firm_token"] = r.json().get("access_token")
    state["firm_email"] = email_firm

    # --- Login SME ---
    r = api("POST", "/auth/login", json={"email": email_sme, "password": "testpass123"})
    check("Login SME user", r.status_code == 200, f"status={r.status_code}")
    state["sme_token"] = r.json().get("access_token")

    # --- Login Firm ---
    r = api("POST", "/auth/login", json={"email": email_firm, "password": "testpass123"})
    check("Login Firm user", r.status_code == 200, f"status={r.status_code}")
    state["firm_token"] = r.json().get("access_token")

    # --- /auth/me ---
    r = api("GET", "/auth/me", token=state["sme_token"])
    check("GET /auth/me returns user", r.status_code == 200 and "email" in r.json(), f"status={r.status_code}")
    state["sme_user"] = r.json()

    r = api("GET", "/auth/me", token=state["firm_token"])
    check("GET /auth/me for firm user", r.status_code == 200, f"status={r.status_code}")
    state["firm_user"] = r.json()

    # --- /auth/organizations (pre-onboarding) ---
    r = api("GET", "/auth/organizations", token=state["sme_token"])
    check("List orgs for SME user", r.status_code == 200 and len(r.json()) >= 1, f"status={r.status_code}")
    orgs = r.json()
    state["sme_org_id"] = orgs[0]["organization_id"]
    check("SME org onboarding not completed", orgs[0]["onboarding_completed"] is False, f"got {orgs[0].get('onboarding_completed')}")

    # --- Bad login ---
    r = api("POST", "/auth/login", json={"email": email_sme, "password": "wrongpass"})
    check("Bad password returns 401", r.status_code == 401, f"status={r.status_code}")

    # --- Duplicate register ---
    r = api("POST", "/auth/register", json={
        "email": email_sme, "password": "testpass123",
        "full_name": "Dup", "company_name": "Dup Co",
    })
    check("Duplicate email rejected", r.status_code in (400, 409), f"status={r.status_code}")

    # --- No token ---
    r = api("GET", "/auth/me")
    check("No token returns 401/403", r.status_code in (401, 403), f"status={r.status_code}")


# ══════════════════════════════════════════════════════════
#  2. ONBOARDING
# ══════════════════════════════════════════════════════════
def test_onboarding():
    section("2. Onboarding")

    # --- SME onboarding ---
    r = api("POST", "/auth/onboarding", token=state["sme_token"], json={
        "org_type": "sme",
        "business_name": f"SME Biz {uid()}",
        "country": "SG",
        "currency": "SGD",
        "timezone": "Asia/Singapore",
        "fiscal_year_end_day": 31,
        "fiscal_year_end_month": 12,
        "has_employees": False,
        "industry": "Technology",
    })
    check("SME onboarding completes", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
    data = r.json()
    check("SME org_type set to sme", data.get("org_type") == "sme", f"got {data.get('org_type')}")
    check("SME onboarding_completed is true", data.get("onboarding_completed") is True, f"got {data.get('onboarding_completed')}")

    # --- Firm onboarding ---
    r = api("POST", "/auth/onboarding", token=state["firm_token"], json={
        "org_type": "firm",
        "business_name": f"Test Firm {uid()}",
        "country": "SG",
        "currency": "SGD",
        "timezone": "Asia/Singapore",
        "fiscal_year_end_day": 31,
        "fiscal_year_end_month": 12,
        "has_employees": True,
        "industry": "Accounting",
    })
    check("Firm onboarding completes", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
    data = r.json()
    check("Firm org_type set to firm", data.get("org_type") == "firm", f"got {data.get('org_type')}")
    state["firm_org_id"] = data.get("id")
    state["firm_name"] = data.get("name")

    # --- Verify org list after onboarding ---
    r = api("GET", "/auth/organizations", token=state["sme_token"])
    orgs = r.json()
    sme_org = next((o for o in orgs if o["organization_id"] == state["sme_org_id"]), None)
    check("SME org shows onboarding completed", sme_org and sme_org["onboarding_completed"] is True, f"got {sme_org}")

    r = api("GET", "/auth/organizations", token=state["firm_token"])
    orgs = r.json()
    firm_org = next((o for o in orgs if o["organization_id"] == state["firm_org_id"]), None)
    check("Firm org shows onboarding completed", firm_org and firm_org["onboarding_completed"] is True, "")
    check("Firm org has org_type=firm", firm_org and firm_org["org_type"] == "firm", f"got {firm_org}")


# ══════════════════════════════════════════════════════════
#  3. NAVIGATION GUARDS: Firm endpoints fail for non-firm
# ══════════════════════════════════════════════════════════
def test_navigation_guards():
    section("3. Navigation Guards: Firm endpoints blocked for SME")

    for endpoint in ["/firm/settings", "/firm/dashboard", "/firm/clients"]:
        r = api("GET", endpoint, token=state["sme_token"])
        check(f"SME blocked from GET {endpoint}", r.status_code == 403, f"status={r.status_code}")

    r = api("POST", "/firm/clients", token=state["sme_token"], json={"contact_name": "Test", "business_name": "Test Biz", "email": "test@test.com"})
    check("SME blocked from POST /firm/clients", r.status_code == 403, f"status={r.status_code}")

    r = api("PATCH", "/firm/settings", token=state["sme_token"], json={"slug": "test"})
    check("SME blocked from PATCH /firm/settings", r.status_code == 403, f"status={r.status_code}")


# ══════════════════════════════════════════════════════════
#  4. FIRM: Settings, Slug, Branding
# ══════════════════════════════════════════════════════════
def test_firm_settings():
    section("4. Firm: Settings, Slug, Branding")

    token = state["firm_token"]

    # --- GET settings ---
    r = api("GET", "/firm/settings", token=token)
    check("GET /firm/settings works", r.status_code == 200, f"status={r.status_code}")
    settings = r.json()
    check("Settings has slug field", "slug" in settings, "")
    check("Settings has brand color fields", "brand_primary_color" in settings, "")

    # --- Check slug availability ---
    test_slug = f"test-firm-{uid()}"
    r = api("GET", f"/firm/check-slug/{test_slug}", token=token)
    check("Slug check returns available", r.status_code == 200 and r.json().get("available") is True, f"body={r.text[:200]}")

    # --- Reserved slug ---
    r = api("GET", "/firm/check-slug/admin", token=token)
    check("Reserved slug 'admin' not available", r.status_code == 200 and r.json().get("available") is False, f"body={r.text[:200]}")

    # --- Update settings ---
    r = api("PATCH", "/firm/settings", token=token, json={
        "slug": test_slug,
        "brand_primary_color": "#FF5733",
        "brand_secondary_color": "#33FF57",
        "client_portal_enabled": True,
        "firm_description": "Test firm description",
        "firm_contact_email": "contact@testfirm.com",
        "firm_website": "https://testfirm.com",
        "firm_support_email": "support@testfirm.com",
    })
    check("PATCH /firm/settings succeeds", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
    updated = r.json()
    check("Slug saved correctly", updated.get("slug") == test_slug, f"got {updated.get('slug')}")
    check("Primary color saved", updated.get("brand_primary_color") == "#FF5733", f"got {updated.get('brand_primary_color')}")
    check("Portal enabled", updated.get("client_portal_enabled") is True, f"got {updated.get('client_portal_enabled')}")
    check("Portal URL generated", updated.get("portal_url") is not None and test_slug in updated.get("portal_url", ""), f"got {updated.get('portal_url')}")
    state["firm_slug"] = test_slug

    # --- Slug taken (public endpoint doesn't know who's asking) ---
    r = api("GET", f"/firm/check-slug/{test_slug}", token=token)
    check("Taken slug shows unavailable", r.json().get("available") is False, f"body={r.text[:200]}")

    # --- Verify settings persisted ---
    r = api("GET", "/firm/settings", token=token)
    check("Settings persisted after update", r.json().get("firm_description") == "Test firm description", f"got {r.json().get('firm_description')}")


# ══════════════════════════════════════════════════════════
#  5. FIRM: Create, List, Archive, Restore Clients
# ══════════════════════════════════════════════════════════
def test_firm_clients():
    section("5. Firm: Invite Clients, Accept, List, Archive, Restore")

    token = state["firm_token"]

    # --- Invite client A ---
    email_a = f"client-a-{uid()}@test.com"
    r = api("POST", "/firm/clients", token=token, json={
        "contact_name": f"Contact A {uid()}",
        "business_name": f"Client A Biz {uid()}",
        "email": email_a,
    })
    check("Invite client A", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
    invite_a = r.json()
    token_a = invite_a.get("token")
    check("Invite A has pending status", invite_a.get("status") == "pending", f"got {invite_a.get('status')}")
    check("Invite A returns token", token_a is not None, "")

    # --- Invite client B ---
    email_b = f"client-b-{uid()}@test.com"
    r = api("POST", "/firm/clients", token=token, json={
        "contact_name": f"Contact B {uid()}",
        "business_name": f"Client B Biz {uid()}",
        "email": email_b,
    })
    check("Invite client B", r.status_code == 200, f"status={r.status_code}")
    invite_b = r.json()
    token_b = invite_b.get("token")

    # --- Invite client C (for archive test) ---
    email_c = f"client-c-{uid()}@test.com"
    r = api("POST", "/firm/clients", token=token, json={
        "contact_name": f"Contact C {uid()}",
        "business_name": f"Client C Biz {uid()}",
        "email": email_c,
    })
    check("Invite client C", r.status_code == 200, f"status={r.status_code}")
    invite_c = r.json()
    token_c = invite_c.get("token")

    # --- Duplicate invite should fail ---
    r = api("POST", "/firm/clients", token=token, json={
        "contact_name": "Dup", "business_name": "Dup Biz", "email": email_a,
    })
    check("Duplicate invite rejected", r.status_code == 400, f"status={r.status_code}")

    # --- List invitations ---
    r = api("GET", "/firm/invitations", token=token)
    check("List invitations", r.status_code == 200 and len(r.json()) >= 3, f"status={r.status_code} count={len(r.json()) if r.status_code==200 else 'N/A'}")
    pending = [i for i in r.json() if i["status"] == "pending"]
    check("At least 3 pending invitations", len(pending) >= 3, f"got {len(pending)}")

    # --- Validate invite token (public endpoint) ---
    r = api("GET", f"/firm/invite/{token_a}")
    check("Validate invite A token", r.status_code == 200, f"status={r.status_code}")
    invite_info = r.json()
    check("Invite info has firm_name", invite_info.get("firm_name") is not None, "")
    check("Invite info has contact_name", invite_info.get("contact_name") == invite_a["contact_name"], "")

    # --- Accept invite A ---
    r = api("POST", "/firm/invite/accept", json={
        "token": token_a, "password": "testpass123", "phone": "+6591234567",
    })
    check("Accept invite A", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
    accept_a = r.json()
    state["client_a_id"] = accept_a.get("organization_id")
    state["client_a_name"] = invite_a["business_name"]
    check("Accept returns access_token", accept_a.get("access_token") is not None, "")
    check("Accept returns organization_id", state["client_a_id"] is not None, "")

    # --- Accept invite B ---
    r = api("POST", "/firm/invite/accept", json={
        "token": token_b, "password": "testpass123",
    })
    check("Accept invite B", r.status_code == 200, f"status={r.status_code}")
    state["client_b_id"] = r.json().get("organization_id")

    # --- Accept invite C ---
    r = api("POST", "/firm/invite/accept", json={
        "token": token_c, "password": "testpass123",
    })
    check("Accept invite C", r.status_code == 200, f"status={r.status_code}")
    state["client_c_id"] = r.json().get("organization_id")

    # --- Re-accept should fail ---
    r = api("POST", "/firm/invite/accept", json={
        "token": token_a, "password": "testpass123",
    })
    check("Re-accept invite fails", r.status_code == 400, f"status={r.status_code}")

    # --- Invitations now show accepted ---
    r = api("GET", "/firm/invitations", token=token)
    accepted = [i for i in r.json() if i["status"] == "accepted"]
    check("Invitations show accepted status", len(accepted) >= 3, f"got {len(accepted)}")

    # --- List clients ---
    r = api("GET", "/firm/clients", token=token)
    check("List clients returns >= 3", r.status_code == 200 and len(r.json()) >= 3, f"status={r.status_code} count={len(r.json()) if r.status_code==200 else 'N/A'}")

    # --- Dashboard ---
    r = api("GET", "/firm/dashboard", token=token)
    check("Dashboard loads", r.status_code == 200, f"status={r.status_code}")
    dash = r.json()
    check("Dashboard has total_clients >= 3", dash.get("total_clients", 0) >= 3, f"got {dash.get('total_clients')}")
    check("Dashboard has firm_name", dash.get("firm_name") is not None, "")
    check("Dashboard clients have metrics", len(dash.get("clients", [])) >= 3 and "metrics" in dash["clients"][0], "")

    # Verify client A in dashboard
    dash_client_a = next((c for c in dash["clients"] if c["id"] == state.get("client_a_id")), None)
    check("Client A in dashboard", dash_client_a is not None, f"looking for {state.get('client_a_id')}")
    if dash_client_a:
        check("Client A onboarding_completed=true", dash_client_a.get("onboarding_completed") is True, f"got {dash_client_a.get('onboarding_completed')}")
        check("Client A has user count >= 1", dash_client_a["metrics"]["users"] >= 1, f"got {dash_client_a['metrics']['users']}")

    # --- Archive client C ---
    r = api("DELETE", f"/firm/clients/{state['client_c_id']}", token=token)
    check("Archive client C", r.status_code == 200, f"status={r.status_code}")

    # --- Archived client not in default list ---
    r = api("GET", "/firm/clients", token=token)
    ids = [c["id"] for c in r.json()]
    check("Archived client C not in default list", state["client_c_id"] not in ids, "")

    # --- Archived client in include_archived list ---
    r = api("GET", "/firm/clients?include_archived=true", token=token)
    ids = [c["id"] for c in r.json()]
    check("Client C in include_archived list", state["client_c_id"] in ids, "")

    # --- Dashboard excludes archived ---
    r = api("GET", "/firm/dashboard", token=token)
    dash_ids = [c["id"] for c in r.json().get("clients", [])]
    check("Dashboard excludes archived client C", state["client_c_id"] not in dash_ids, "")

    # --- Restore client C ---
    r = api("POST", f"/firm/clients/{state['client_c_id']}/restore", token=token)
    check("Restore client C", r.status_code == 200, f"status={r.status_code}")

    r = api("GET", "/firm/clients", token=token)
    ids = [c["id"] for c in r.json()]
    check("Client C back in default list", state["client_c_id"] in ids, "")


# ══════════════════════════════════════════════════════════
#  6. ORG SWITCHING
# ══════════════════════════════════════════════════════════
def test_org_switching():
    section("6. Org Switching")

    token = state["firm_token"]

    # --- Firm user's org list should include firm + clients ---
    r = api("GET", "/auth/organizations", token=token)
    orgs = r.json()
    org_ids = [o["organization_id"] for o in orgs]
    check("Firm user has firm org", state["firm_org_id"] in org_ids, "")
    check("Firm user has client A", state["client_a_id"] in org_ids, "")
    check("Firm user has client B", state["client_b_id"] in org_ids, "")

    # --- Switch to client A ---
    r = api("POST", "/auth/switch-org", token=token, json={"organization_id": state["client_a_id"]})
    check("Switch to client A", r.status_code == 200, f"status={r.status_code}")
    client_a_token = r.json().get("access_token")
    state["client_a_token"] = client_a_token

    # --- Verify context is client A ---
    r = api("GET", "/auth/me", token=client_a_token)
    check("After switch, me.org_id is client A", r.json().get("organization_id") == state["client_a_id"], f"got {r.json().get('organization_id')}")

    # --- Client A org is NOT a firm, so firm endpoints should fail ---
    r = api("GET", "/firm/settings", token=client_a_token)
    check("Client A context: firm/settings blocked", r.status_code == 403, f"status={r.status_code}")

    # --- Dashboard works for client A context ---
    r = api("GET", "/dashboard", token=client_a_token)
    check("Client A dashboard loads", r.status_code == 200, f"status={r.status_code}")

    # --- Switch back to firm ---
    r = api("POST", "/auth/switch-org", token=client_a_token, json={"organization_id": state["firm_org_id"]})
    check("Switch back to firm", r.status_code == 200, f"status={r.status_code}")
    state["firm_token"] = r.json().get("access_token")

    # --- Verify firm context restored ---
    r = api("GET", "/firm/settings", token=state["firm_token"])
    check("Firm context restored: settings accessible", r.status_code == 200, f"status={r.status_code}")

    # --- Cannot switch to an org user doesn't belong to ---
    r = api("POST", "/auth/switch-org", token=state["sme_token"], json={"organization_id": state["client_a_id"]})
    check("SME user cannot switch to firm's client org", r.status_code in (403, 404), f"status={r.status_code}")


# ══════════════════════════════════════════════════════════
#  7. CLIENT PORTAL (Public)
# ══════════════════════════════════════════════════════════
def test_client_portal():
    section("7. Client Portal (Public)")

    slug = state.get("firm_slug")
    if not slug:
        check("SKIP: no slug configured", False, "firm_slug not set")
        return

    # --- Get portal info (no auth) ---
    r = api("GET", f"/firm/portal/{slug}")
    check("Portal info loads (no auth)", r.status_code == 200, f"status={r.status_code}")
    portal = r.json()
    check("Portal has firm_name", portal.get("firm_name") is not None, "")
    check("Portal has brand colors", portal.get("brand_primary_color") == "#FF5733", f"got {portal.get('brand_primary_color')}")
    check("Portal has description", portal.get("firm_description") == "Test firm description", "")

    # --- Non-existent portal ---
    r = api("GET", "/firm/portal/nonexistent-slug-xyz")
    check("Non-existent portal returns 404", r.status_code == 404, f"status={r.status_code}")

    # --- Portal signup ---
    portal_email = f"portal-{uid()}@client.com"
    r = api("POST", f"/firm/portal/{slug}/signup", json={
        "email": portal_email,
        "password": "clientpass123",
        "full_name": "Portal Client",
        "company_name": f"Portal Co {uid()}",
        "phone": "+6591234567",
    })
    check("Portal signup succeeds", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
    signup_data = r.json()
    check("Signup returns access_token", "access_token" in signup_data, "")
    state["portal_client_token"] = signup_data.get("access_token")

    # --- Verify portal client can access their dashboard ---
    r = api("GET", "/dashboard", token=state["portal_client_token"])
    check("Portal client can access dashboard", r.status_code == 200, f"status={r.status_code}")

    # --- Verify portal client's org is under the firm ---
    r = api("GET", "/auth/me", token=state["portal_client_token"])
    portal_org_id = r.json().get("organization_id")
    state["portal_client_org_id"] = portal_org_id

    # --- Verify firm user now has access to portal client's org ---
    r = api("GET", "/auth/organizations", token=state["firm_token"])
    firm_org_ids = [o["organization_id"] for o in r.json()]
    check("Firm user has access to portal client org", portal_org_id in firm_org_ids, f"portal_org={portal_org_id}")

    # --- Duplicate signup ---
    r = api("POST", f"/firm/portal/{slug}/signup", json={
        "email": portal_email, "password": "clientpass123",
        "full_name": "Dup", "company_name": "Dup Co",
    })
    check("Duplicate portal signup rejected", r.status_code == 400, f"status={r.status_code}")

    # --- Portal login (existing client can login via main auth from portal page) ---
    r = api("POST", "/auth/login", json={"email": portal_email, "password": "clientpass123"})
    check("Portal client can login via /auth/login", r.status_code == 200, f"status={r.status_code}")
    check("Portal login returns token", "access_token" in r.json(), "")

    # --- Portal login with wrong password ---
    r = api("POST", "/auth/login", json={"email": portal_email, "password": "wrongpass"})
    check("Portal login bad password returns 401", r.status_code == 401, f"status={r.status_code}")


# ══════════════════════════════════════════════════════════
#  8. DATA ISOLATION: Client A vs Client B
# ══════════════════════════════════════════════════════════
def test_data_isolation():
    section("8. Data Isolation: Client A vs Client B")

    token = state["firm_token"]

    # --- Switch to client A, create a contact ---
    r = api("POST", "/auth/switch-org", token=token, json={"organization_id": state["client_a_id"]})
    token_a = r.json()["access_token"]

    r = api("POST", "/contacts", token=token_a, json={
        "name": f"Contact A {uid()}", "type": "customer", "email": "a@test.com",
    })
    check("Create contact in client A", r.status_code in (200, 201), f"status={r.status_code} body={r.text[:200]}")
    if r.status_code in (200, 201):
        state["contact_a_id"] = r.json().get("id")

    # --- Switch to client B ---
    r = api("POST", "/auth/switch-org", token=token_a, json={"organization_id": state["client_b_id"]})
    token_b = r.json()["access_token"]

    # --- Client B should NOT see client A's contact ---
    r = api("GET", "/contacts", token=token_b)
    check("Client B contacts list loads", r.status_code == 200, f"status={r.status_code}")
    contact_ids = [c.get("id") for c in r.json()] if r.status_code == 200 else []
    check("Client A contact NOT visible in client B", state.get("contact_a_id") not in contact_ids, "")

    # --- Create a contact in client B ---
    r = api("POST", "/contacts", token=token_b, json={
        "name": f"Contact B {uid()}", "type": "supplier", "email": "b@test.com",
    })
    check("Create contact in client B", r.status_code in (200, 201), f"status={r.status_code}")

    # --- Switch back to client A, verify isolation ---
    r = api("POST", "/auth/switch-org", token=token_b, json={"organization_id": state["client_a_id"]})
    token_a2 = r.json()["access_token"]

    r = api("GET", "/contacts", token=token_a2)
    contacts_a = r.json() if r.status_code == 200 else []
    # Client A should only have their own contacts
    b_emails = [c.get("email") for c in contacts_a]
    check("Client B contact NOT visible in client A", "b@test.com" not in b_emails, f"emails={b_emails}")

    # --- Switch back to firm ---
    r = api("POST", "/auth/switch-org", token=token_a2, json={"organization_id": state["firm_org_id"]})
    state["firm_token"] = r.json()["access_token"]


# ══════════════════════════════════════════════════════════
#  9. CRUD: Invoices, Bills, Accounts per Org
# ══════════════════════════════════════════════════════════
def test_crud_per_org():
    section("9. CRUD: Invoices, Bills, Accounts per Org")

    # Switch to client A for CRUD tests
    r = api("POST", "/auth/switch-org", token=state["firm_token"], json={"organization_id": state["client_a_id"]})
    token = r.json()["access_token"]

    # --- Accounts (chart of accounts auto-created) ---
    r = api("GET", "/accounts", token=token)
    check("Accounts list loads", r.status_code == 200, f"status={r.status_code}")
    accounts = r.json() if r.status_code == 200 else []
    check("Default accounts created (>=10)", len(accounts) >= 10, f"count={len(accounts)}")

    # Find revenue and expense accounts for invoice/bill creation
    revenue_acc = next((a for a in accounts if a.get("type") == "revenue"), None)

    # --- Create Invoice ---
    if revenue_acc:
        today_iso = date.today().isoformat() + "T00:00:00Z"
        r = api("POST", "/invoices", token=token, json={
            "contact_id": state.get("contact_a_id"),
            "issue_date": today_iso,
            "due_date": today_iso,
            "line_items": [
                {"description": "Service A", "quantity": 1, "unit_price": 1000,
                 "account_id": revenue_acc["id"]},
            ],
        })
        check("Create invoice in client A", r.status_code in (200, 201), f"status={r.status_code} body={r.text[:300]}")
        if r.status_code in (200, 201):
            state["invoice_a_id"] = r.json().get("id")

        # --- List invoices ---
        r = api("GET", "/invoices", token=token)
        check("List invoices", r.status_code == 200, f"status={r.status_code}")
    else:
        check("SKIP invoice tests: no revenue account", False, "")

    # --- Create Bill ---
    expense_acc = next((a for a in accounts if a.get("type") == "expense"), None)
    if expense_acc:
        today_iso = date.today().isoformat() + "T00:00:00Z"
        r = api("POST", "/bills", token=token, json={
            "contact_id": state.get("contact_a_id"),
            "bill_number": f"BILL-{uid()}",
            "issue_date": today_iso,
            "due_date": today_iso,
            "line_items": [
                {"description": "Supply X", "quantity": 2, "unit_price": 500,
                 "account_id": expense_acc["id"]},
            ],
        })
        check("Create bill in client A", r.status_code in (200, 201), f"status={r.status_code} body={r.text[:300]}")
    else:
        check("SKIP bill tests: no expense account", False, "")

    # --- Dashboard reflects data ---
    r = api("GET", "/dashboard", token=token)
    check("Client A dashboard loads with data", r.status_code == 200, f"status={r.status_code}")

    # Switch back to firm
    r = api("POST", "/auth/switch-org", token=token, json={"organization_id": state["firm_org_id"]})
    state["firm_token"] = r.json()["access_token"]

    # --- Firm dashboard should show client A metrics ---
    r = api("GET", "/firm/dashboard", token=state["firm_token"])
    dash = r.json()
    client_a_dash = next((c for c in dash.get("clients", []) if c["id"] == state["client_a_id"]), None)
    check("Firm dashboard shows client A", client_a_dash is not None, "")
    if client_a_dash:
        check("Client A metrics show invoices", client_a_dash["metrics"]["invoices"] >= 1, f"got {client_a_dash['metrics']}")


# ══════════════════════════════════════════════════════════
#  10. EDGE CASES
# ══════════════════════════════════════════════════════════
def test_edge_cases():
    section("10. Edge Cases")

    token = state["firm_token"]

    # --- Archive non-existent client ---
    fake_id = str(uuid.uuid4())
    r = api("DELETE", f"/firm/clients/{fake_id}", token=token)
    check("Archive non-existent client returns 404", r.status_code == 404, f"status={r.status_code}")

    # --- Restore non-existent client ---
    r = api("POST", f"/firm/clients/{fake_id}/restore", token=token)
    check("Restore non-existent client returns 404", r.status_code == 404, f"status={r.status_code}")

    # --- Invite client with empty name ---
    r = api("POST", "/firm/clients", token=token, json={"contact_name": "", "business_name": "Biz", "email": "x@y.com"})
    check("Empty contact name rejected", r.status_code in (400, 422), f"status={r.status_code}")

    # --- Slug too short ---
    r = api("GET", "/firm/check-slug/ab")
    check("Short slug check", r.status_code == 200, f"status={r.status_code}")

    # --- SME user cannot access firm's client via switch ---
    r = api("POST", "/auth/switch-org", token=state["sme_token"], json={"organization_id": state["client_a_id"]})
    check("SME user cannot switch to firm client", r.status_code in (403, 404), f"status={r.status_code}")

    # --- Firm user cannot access SME user's org ---
    r = api("POST", "/auth/switch-org", token=state["firm_token"], json={"organization_id": state["sme_org_id"]})
    check("Firm user cannot switch to unrelated SME org", r.status_code in (403, 404), f"status={r.status_code}")


# ══════════════════════════════════════════════════════════
#  RUN ALL
# ══════════════════════════════════════════════════════════
def main():
    print("\n\033[1;35m╔══════════════════════════════════════════════════════════╗\033[0m")
    print("\033[1;35m║        ACCRULY E2E TEST SUITE                            ║\033[0m")
    print("\033[1;35m╚══════════════════════════════════════════════════════════╝\033[0m")

    try:
        r = requests.get(f"{BASE_URL}/firm/check-slug/health-check", timeout=5)
    except requests.ConnectionError:
        print(f"\n\033[31m✗ Cannot connect to {BASE_URL}. Is the backend running?\033[0m")
        sys.exit(1)

    test_auth_register_and_login()
    test_onboarding()
    test_navigation_guards()
    test_firm_settings()
    test_firm_clients()
    test_org_switching()
    test_client_portal()
    test_data_isolation()
    test_crud_per_org()
    test_edge_cases()

    # ── Summary ──
    total = PASS + FAIL
    print(f"\n\033[1;35m{'═'*60}\033[0m")
    print(f"\033[1;35m  RESULTS: {PASS}/{total} passed", end="")
    if FAIL:
        print(f", \033[31m{FAIL} FAILED\033[0m")
    else:
        print(f"  \033[32mALL PASSED\033[0m")
    print(f"\033[1;35m{'═'*60}\033[0m")

    if ERRORS:
        print(f"\n\033[31mFailed tests:\033[0m")
        for e in ERRORS:
            print(f"  • {e}")

    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    main()
