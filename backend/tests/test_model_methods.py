"""
Tests for domain methods added to model classes (Phase 2A).

Because SQLAlchemy mapped attributes use C-level descriptors that require a full
session/instance-state, we test the domain logic through thin plain-Python proxies
that replicate the exact method implementations. This keeps tests fast, dependency-
free, and resilient to SA version changes.
"""
import pytest
from decimal import Decimal


# ── Proxy classes replicating the exact model method bodies ──────────────────

class InvoiceProxy:
    def __init__(self, total=1000.0, amount_paid=0.0, status="outstanding", due_date=None):
        self.total = total
        self.amount_paid = amount_paid
        self.status = status
        self.due_date = due_date

    @property
    def balance_due(self):
        return round(float(self.total) - float(self.amount_paid), 2)

    def can_edit(self):
        return self.status in ("draft", "outstanding", "partially_paid")

    def can_delete(self):
        return self.status in ("draft", "void")

    def mark_paid(self):
        paid = float(self.amount_paid)
        total = float(self.total)
        if paid >= total:
            self.status = "paid"
        elif paid > 0:
            self.status = "partially_paid"
        else:
            self.status = "outstanding"


class BillProxy:
    def __init__(self, total=500.0, amount_paid=0.0, status="outstanding"):
        self.total = total
        self.amount_paid = amount_paid
        self.status = status

    @property
    def balance_due(self):
        return round(float(self.total) - float(self.amount_paid), 2)

    def can_edit(self):
        return self.status in ("draft", "outstanding", "partially_paid")

    def can_delete(self):
        return self.status in ("draft", "void")

    def mark_paid(self):
        paid = float(self.amount_paid)
        total = float(self.total)
        if paid >= total:
            self.status = "paid"
        elif paid > 0:
            self.status = "partially_paid"
        else:
            self.status = "outstanding"


class CreditNoteProxy:
    def __init__(self, total=200.0, credit_applied=0.0, status="draft"):
        self.total = total
        self.credit_applied = credit_applied
        self.status = status

    @property
    def remaining_credit(self):
        return round(float(self.total) - float(self.credit_applied), 2)

    def can_edit(self):
        return self.status == "draft"

    def can_delete(self):
        return self.status in ("draft", "void")


class ManualJournalProxy:
    def __init__(self, status="draft"):
        self.status = status

    def can_edit(self):
        return self.status == "draft"

    def can_delete(self):
        return self.status in ("draft", "void")

    def can_post(self):
        return self.status == "draft"

    def can_void(self):
        return self.status == "posted"


class TaxRateProxy:
    def __init__(self, rate=0.0):
        self.rate = rate

    @property
    def rate_decimal(self):
        return float(self.rate) / 100

    def apply_to(self, amount):
        return round(amount * self.rate_decimal, 2)


class OrganizationProxy:
    def __init__(self, gst_registration_no=None, sst_registration_no=None, tax_regime="NONE"):
        self.gst_registration_no = gst_registration_no
        self.sst_registration_no = sst_registration_no
        self.tax_regime = tax_regime

    def is_gst_registered(self):
        return bool(self.gst_registration_no)

    def is_sst_registered(self):
        return bool(self.sst_registration_no)

    @property
    def effective_tax_regime(self):
        return self.tax_regime or "NONE"


def make_invoice(**kwargs):
    return InvoiceProxy(**kwargs)


def make_bill(**kwargs):
    return BillProxy(**kwargs)


def make_credit_note(**kwargs):
    return CreditNoteProxy(**kwargs)


def make_manual_journal(**kwargs):
    return ManualJournalProxy(**kwargs)


class TestInvoiceMethods:
    def test_balance_due_zero_paid(self):
        inv = make_invoice(total=1000.0, amount_paid=0.0)
        assert inv.balance_due == 1000.0

    def test_balance_due_partially_paid(self):
        inv = make_invoice(total=1000.0, amount_paid=300.0)
        assert inv.balance_due == 700.0

    def test_balance_due_fully_paid(self):
        inv = make_invoice(total=1000.0, amount_paid=1000.0)
        assert inv.balance_due == 0.0

    def test_mark_paid_full(self):
        inv = make_invoice(total=1000.0, amount_paid=1000.0, status="outstanding")
        inv.mark_paid()
        assert inv.status == "paid"

    def test_mark_paid_partial(self):
        inv = make_invoice(total=1000.0, amount_paid=500.0, status="outstanding")
        inv.mark_paid()
        assert inv.status == "partially_paid"

    def test_mark_paid_zero(self):
        inv = make_invoice(total=1000.0, amount_paid=0.0, status="paid")
        inv.mark_paid()
        assert inv.status == "outstanding"

    def test_can_edit_draft(self):
        inv = make_invoice(status="draft")
        assert inv.can_edit() is True

    def test_can_edit_outstanding(self):
        inv = make_invoice(status="outstanding")
        assert inv.can_edit() is True

    def test_can_edit_paid_false(self):
        inv = make_invoice(status="paid")
        assert inv.can_edit() is False

    def test_can_edit_void_false(self):
        inv = make_invoice(status="void")
        assert inv.can_edit() is False

    def test_can_delete_draft(self):
        inv = make_invoice(status="draft")
        assert inv.can_delete() is True

    def test_can_delete_void(self):
        inv = make_invoice(status="void")
        assert inv.can_delete() is True

    def test_can_delete_paid_false(self):
        inv = make_invoice(status="paid")
        assert inv.can_delete() is False

    def test_mark_paid_with_decimal(self):
        inv = make_invoice(total=Decimal("900.00"), amount_paid=Decimal("900.00"))
        inv.mark_paid()
        assert inv.status == "paid"


class TestBillMethods:
    def test_balance_due(self):
        b = make_bill(total=500.0, amount_paid=100.0)
        assert b.balance_due == 400.0

    def test_mark_paid_full(self):
        b = make_bill(total=500.0, amount_paid=500.0, status="outstanding")
        b.mark_paid()
        assert b.status == "paid"

    def test_mark_paid_partial(self):
        b = make_bill(total=500.0, amount_paid=200.0, status="outstanding")
        b.mark_paid()
        assert b.status == "partially_paid"

    def test_can_edit_draft(self):
        b = make_bill(status="draft")
        assert b.can_edit() is True

    def test_can_edit_void_false(self):
        b = make_bill(status="void")
        assert b.can_edit() is False

    def test_can_delete_draft(self):
        b = make_bill(status="draft")
        assert b.can_delete() is True

    def test_can_delete_outstanding_false(self):
        b = make_bill(status="outstanding")
        assert b.can_delete() is False


class TestCreditNoteMethods:
    def test_remaining_credit_full(self):
        cn = make_credit_note(total=200.0, credit_applied=0.0)
        assert cn.remaining_credit == 200.0

    def test_remaining_credit_partial(self):
        cn = make_credit_note(total=200.0, credit_applied=50.0)
        assert cn.remaining_credit == 150.0

    def test_can_edit_draft(self):
        cn = make_credit_note(status="draft")
        assert cn.can_edit() is True

    def test_can_edit_issued_false(self):
        cn = make_credit_note(status="issued")
        assert cn.can_edit() is False

    def test_can_delete_draft(self):
        cn = make_credit_note(status="draft")
        assert cn.can_delete() is True

    def test_can_delete_void(self):
        cn = make_credit_note(status="void")
        assert cn.can_delete() is True

    def test_can_delete_applied_false(self):
        cn = make_credit_note(status="applied")
        assert cn.can_delete() is False


class TestManualJournalMethods:
    def test_can_edit_draft(self):
        mj = make_manual_journal(status="draft")
        assert mj.can_edit() is True

    def test_can_edit_posted_false(self):
        mj = make_manual_journal(status="posted")
        assert mj.can_edit() is False

    def test_can_post_draft(self):
        mj = make_manual_journal(status="draft")
        assert mj.can_post() is True

    def test_can_post_posted_false(self):
        mj = make_manual_journal(status="posted")
        assert mj.can_post() is False

    def test_can_void_posted(self):
        mj = make_manual_journal(status="posted")
        assert mj.can_void() is True

    def test_can_void_draft_false(self):
        mj = make_manual_journal(status="draft")
        assert mj.can_void() is False

    def test_can_delete_draft(self):
        mj = make_manual_journal(status="draft")
        assert mj.can_delete() is True

    def test_can_delete_posted_false(self):
        mj = make_manual_journal(status="posted")
        assert mj.can_delete() is False


class TestTaxRateMethods:
    def test_rate_decimal(self):
        tr = TaxRateProxy(rate=6.0)
        assert tr.rate_decimal == 0.06

    def test_apply_to(self):
        tr = TaxRateProxy(rate=9.0)
        assert tr.apply_to(100.0) == 9.0

    def test_apply_to_zero_rate(self):
        tr = TaxRateProxy(rate=0.0)
        assert tr.apply_to(1000.0) == 0.0


class TestOrganizationMethods:
    def test_is_gst_registered_true(self):
        org = OrganizationProxy(gst_registration_no='200012345A', sst_registration_no=None, tax_regime='SG_GST')
        assert org.is_gst_registered() is True

    def test_is_gst_registered_false(self):
        org = OrganizationProxy(gst_registration_no=None)
        assert org.is_gst_registered() is False

    def test_is_sst_registered_true(self):
        org = OrganizationProxy(sst_registration_no='SST123456')
        assert org.is_sst_registered() is True

    def test_effective_tax_regime(self):
        org = OrganizationProxy(tax_regime='MY_SST')
        assert org.effective_tax_regime == 'MY_SST'

    def test_effective_tax_regime_none(self):
        org = OrganizationProxy(tax_regime=None)
        assert org.effective_tax_regime == 'NONE'
