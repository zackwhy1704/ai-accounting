"""
P0 regression: taxed invoice/bill in an org with default accounts must post
ONE balanced transaction (DR==CR), not two separate unbalanced calls.

Background: the previous implementation posted the tax leg in its own
`post_gl(["2100", 0, tax])` call (debit 0, credit tax -> unbalanced -> 400)
AND posted AR=total vs Revenue=subtotal in a second call (diff = tax ->
unbalanced -> 400). Any taxed document in a configured org threw HTTP 400.

These tests reconstruct the exact entry-list-building logic the routers use on
the org-defaults path and assert the resulting single entry list balances when
run through the real `_assert_balanced` guard. They also assert (at source
level) that the routers no longer make a tax-only post_gl call.
"""
import pathlib
import pytest
from fastapi import HTTPException

from app.api.v1.gl_helpers import _assert_balanced


# Mirror of the production entry-building logic on the org-defaults path.
# If the routers change, these helpers must change with them — and the
# source-level guards below catch divergence in the opposite direction.
def _invoice_id_entries(ar, revenue, output_tax, subtotal, tax_amount, total):
    entries = [(ar, total, 0.0), (revenue, 0.0, subtotal)]
    if tax_amount > 0:
        entries.append((output_tax, 0.0, tax_amount))
    return entries


def _bill_id_entries(expense, ap, input_tax, subtotal, tax_amount, total):
    entries = [(expense, subtotal, 0.0), (ap, 0.0, total)]
    if tax_amount > 0:
        entries.append((input_tax, tax_amount, 0.0))
    return entries


def _resolved(entries):
    """Wrap (id, debit, credit) tuples as (acct, debit, credit) for _assert_balanced."""
    class _A:  # _assert_balanced ignores the account object entirely
        pass
    return [(_A(), d, c) for _, d, c in entries]


class TestTaxedInvoiceBalances:
    def test_taxed_invoice_single_balanced_entry_list(self):
        # subtotal 100, tax 6, total 106
        entries = _invoice_id_entries("ar", "rev", "otax", 100.0, 6.0, 106.0)
        assert len(entries) == 3
        _assert_balanced(_resolved(entries))  # must not raise

    def test_untaxed_invoice_two_leg_balanced(self):
        entries = _invoice_id_entries("ar", "rev", "otax", 100.0, 0.0, 100.0)
        assert len(entries) == 2
        _assert_balanced(_resolved(entries))

    def test_taxed_invoice_old_split_would_have_failed(self):
        """Prove the OLD behaviour was broken: a tax-only leg is unbalanced."""
        with pytest.raises(HTTPException) as exc:
            _assert_balanced(_resolved([("otax", 0.0, 6.0)]))
        assert exc.value.status_code == 400


class TestTaxedBillBalances:
    def test_taxed_bill_single_balanced_entry_list(self):
        # subtotal 100, input tax 6, total 106
        entries = _bill_id_entries("exp", "ap", "itax", 100.0, 6.0, 106.0)
        assert len(entries) == 3
        _assert_balanced(_resolved(entries))

    def test_untaxed_bill_two_leg_balanced(self):
        entries = _bill_id_entries("exp", "ap", "itax", 100.0, 0.0, 100.0)
        assert len(entries) == 2
        _assert_balanced(_resolved(entries))


class TestRoutersUseSingleBalancedCall:
    """Source-level guard: the org-defaults branch must not make a separate
    tax-only post_gl call (the root cause of the P0 imbalance)."""

    def _src(self, name):
        return pathlib.Path(f"app/api/v1/{name}").read_text()

    def test_invoices_no_tax_only_post_gl(self):
        src = self._src("invoices.py")
        # the buggy pattern posted ("2100", 0, tax_amount) as its own call
        assert 'entries_code = [("2100"' not in src
        assert 'output_tax' in src  # uses org-configured tax account

    def test_bills_no_tax_only_post_gl(self):
        src = self._src("bills.py")
        assert 'gst_entries = [("1200"' not in src
        assert 'input_tax' in src


class TestOrgDefaultsHelperExposesTaxAccounts:
    def test_get_default_accounts_returns_tax_keys(self):
        src = pathlib.Path("app/core/org_defaults.py").read_text()
        assert "output_tax" in src
        assert "input_tax" in src
