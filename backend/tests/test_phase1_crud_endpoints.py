"""
Phase 1 CRUD-gap fixes — endpoint registration + update-schema behavior.

Verifies the routes that were missing (and 404'd the frontend) now exist with
the correct HTTP methods, and that the new *Update schemas behave as partial
(exclude_unset) updates. No DB/live-server needed.
"""
from app.main import app
from app.schemas.schemas import ManualJournalUpdate, ExchangeRateUpdate, ContactUpdate


def _route_methods(path: str) -> set[str]:
    """Collect HTTP methods for a path, walking nested routers (version-robust).

    Matches the exact prefixed path or a suffix match on a mounted (unprefixed)
    route, so a Starlette version that stops flattening the prefix can't make this
    silently return empty (false red). See test_crud_core for the rationale.
    """
    methods: set[str] = set()

    def walk(routes, prefix=""):
        for r in routes:
            rp = getattr(r, "path", None)
            sub = getattr(r, "routes", None)
            if rp and getattr(r, "methods", None):
                full = prefix + rp
                if full == path or rp == path or path.endswith(rp):
                    methods.update(r.methods - {"HEAD", "OPTIONS"})
            if sub:
                walk(sub, prefix + (rp or ""))

    walk(app.routes)
    return methods


class TestRouteRegistration:
    def test_manual_journal_patch_and_delete_exist(self):
        m = _route_methods("/api/v1/manual-journals/{journal_id}")
        assert "PATCH" in m, "manual journal PATCH missing (EditManualJournalPage would 404)"
        assert "DELETE" in m

    def test_exchange_rate_get_patch_delete_exist(self):
        m = _route_methods("/api/v1/exchange-rates/{rate_id}")
        assert {"GET", "PATCH", "DELETE"}.issubset(m)

    def test_payment_link_patch_delete_exist(self):
        m = _route_methods("/api/v1/payment-links/{link_id}")
        assert {"PATCH", "DELETE"}.issubset(m)

    def test_tax_rate_get_by_id_exists(self):
        m = _route_methods("/api/v1/tax-rates/{tax_rate_id}")
        assert "GET" in m

    def test_contact_patch_exists_and_put_kept(self):
        m = _route_methods("/api/v1/contacts/{contact_id}")
        assert "PATCH" in m, "contacts should expose PATCH"
        assert "PUT" in m, "PUT kept as alias for backward compatibility"


class TestUpdateSchemasArePartial:
    def test_manual_journal_update_all_optional(self):
        # empty body is valid (nothing changes)
        u = ManualJournalUpdate()
        assert u.model_dump(exclude_unset=True) == {}

    def test_manual_journal_update_partial(self):
        u = ManualJournalUpdate(reference="REF-1")
        assert u.model_dump(exclude_unset=True) == {"reference": "REF-1"}

    def test_exchange_rate_update_partial(self):
        u = ExchangeRateUpdate(rate=4.25)
        assert u.model_dump(exclude_unset=True) == {"rate": 4.25}

    def test_contact_update_name_not_required(self):
        # the whole point of ContactUpdate vs ContactCreate: name is optional
        u = ContactUpdate(email="new@example.com")
        dumped = u.model_dump(exclude_unset=True)
        assert dumped == {"email": "new@example.com"}
        assert "name" not in dumped
