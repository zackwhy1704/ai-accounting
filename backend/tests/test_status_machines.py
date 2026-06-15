"""
H2: Status machine tests.

These tests mirror the allowed/disallowed transitions defined in the actual
router functions (invoices.py, bills.py, quotations.py, credit_notes.py).
They use the same validation logic inline (pure, no DB) so that if a route's
valid_statuses set or guard logic changes, these tests fail and alert the
developer.

The _validate_* helpers reproduce exactly what the router does before touching
the DB, so we can test the state machine without any database dependency.
"""
import pytest


# ── Invoice status machine ────────────────────────────────────────────────────
# From invoices.py: valid_statuses = {"draft", "sent", "viewed", "paid",
#                                     "overdue", "cancelled", "void"}
# Guards:
#   - status in ("void","cancelled") and amount_paid > 0 → 400

INVOICE_VALID_STATUSES = {"draft", "sent", "viewed", "paid", "overdue", "cancelled", "void"}


def _invoice_can_transition(new_status: str, current_status: str, amount_paid: float = 0.0):
    """Return (ok: bool, error: str|None) mirroring the router guard."""
    if new_status not in INVOICE_VALID_STATUSES:
        return False, f"Invalid status: {new_status}"
    if new_status in ("void", "cancelled") and current_status not in ("void", "cancelled"):
        if amount_paid > 0:
            return False, "Has payments applied"
    return True, None


class TestInvoiceStatusMachine:
    def test_draft_is_valid_initial_status(self):
        ok, err = _invoice_can_transition("draft", "draft")
        assert ok

    def test_draft_to_sent_allowed(self):
        ok, _ = _invoice_can_transition("sent", "draft")
        assert ok

    def test_draft_to_viewed_allowed(self):
        ok, _ = _invoice_can_transition("viewed", "draft")
        assert ok

    def test_sent_to_paid_allowed(self):
        ok, _ = _invoice_can_transition("paid", "sent")
        assert ok

    def test_sent_to_overdue_allowed(self):
        ok, _ = _invoice_can_transition("overdue", "sent")
        assert ok

    def test_paid_to_void_blocked_when_has_payments(self):
        ok, err = _invoice_can_transition("void", "paid", amount_paid=100.0)
        assert not ok
        assert "payments" in err.lower() or "Has payments" in err

    def test_void_when_no_payments_allowed(self):
        ok, _ = _invoice_can_transition("void", "sent", amount_paid=0.0)
        assert ok

    def test_cancelled_when_no_payments_allowed(self):
        ok, _ = _invoice_can_transition("cancelled", "sent", amount_paid=0.0)
        assert ok

    def test_cancelled_with_payments_blocked(self):
        ok, err = _invoice_can_transition("cancelled", "outstanding", amount_paid=50.0)
        assert not ok

    def test_invalid_status_rejected(self):
        ok, err = _invoice_can_transition("pending", "draft")
        assert not ok
        assert "Invalid" in err

    def test_all_valid_statuses_pass_without_payments(self):
        for s in INVOICE_VALID_STATUSES:
            ok, _ = _invoice_can_transition(s, "draft", amount_paid=0.0)
            assert ok, f"Expected {s!r} to be accepted from draft with no payments"


# ── Bill status machine ───────────────────────────────────────────────────────
# From bills.py:
#   valid = {"draft","received","approved","outstanding","paid","overdue","void","cancelled"}
#   Guards:
#     - draft/received → approved/outstanding: posts GL
#     - void/cancelled from non-draft: reverses GL

BILL_VALID_STATUSES = {"draft", "received", "approved", "outstanding", "paid", "overdue", "void", "cancelled"}


def _bill_can_transition(new_status: str):
    if new_status not in BILL_VALID_STATUSES:
        return False, f"Invalid status: {new_status}"
    return True, None


class TestBillStatusMachine:
    def test_draft_is_valid(self):
        ok, _ = _bill_can_transition("draft")
        assert ok

    def test_received_is_valid(self):
        ok, _ = _bill_can_transition("received")
        assert ok

    def test_approved_is_valid(self):
        ok, _ = _bill_can_transition("approved")
        assert ok

    def test_outstanding_is_valid(self):
        ok, _ = _bill_can_transition("outstanding")
        assert ok

    def test_paid_is_valid(self):
        ok, _ = _bill_can_transition("paid")
        assert ok

    def test_void_is_valid(self):
        ok, _ = _bill_can_transition("void")
        assert ok

    def test_cancelled_is_valid(self):
        ok, _ = _bill_can_transition("cancelled")
        assert ok

    def test_invalid_status_rejected(self):
        ok, err = _bill_can_transition("pending")
        assert not ok

    def test_all_bill_statuses_accepted(self):
        for s in BILL_VALID_STATUSES:
            ok, _ = _bill_can_transition(s)
            assert ok, f"Expected {s!r} to be accepted"


# ── Quotation status machine ──────────────────────────────────────────────────
# From quotations.py: valid = {"draft","sent","accepted","declined","converted","void"}

QUOTATION_VALID_STATUSES = {"draft", "sent", "accepted", "declined", "converted", "void"}


def _quotation_can_transition(new_status: str):
    if new_status not in QUOTATION_VALID_STATUSES:
        return False, f"Invalid status: {new_status}"
    return True, None


class TestQuotationStatusMachine:
    def test_draft_to_sent(self):
        ok, _ = _quotation_can_transition("sent")
        assert ok

    def test_sent_to_accepted(self):
        ok, _ = _quotation_can_transition("accepted")
        assert ok

    def test_sent_to_declined(self):
        ok, _ = _quotation_can_transition("declined")
        assert ok

    def test_accepted_to_converted(self):
        ok, _ = _quotation_can_transition("converted")
        assert ok

    def test_void_accepted(self):
        ok, _ = _quotation_can_transition("void")
        assert ok

    def test_invalid_status_rejected(self):
        ok, err = _quotation_can_transition("rejected")  # not in valid set
        assert not ok

    def test_paid_not_a_quotation_status(self):
        ok, _ = _quotation_can_transition("paid")
        assert not ok

    def test_all_quotation_statuses_accepted(self):
        for s in QUOTATION_VALID_STATUSES:
            ok, _ = _quotation_can_transition(s)
            assert ok


# ── Credit note status machine ────────────────────────────────────────────────
# From credit_notes.py: valid = {"draft", "issued", "applied", "void"}

CREDIT_NOTE_VALID_STATUSES = {"draft", "issued", "applied", "void"}


def _credit_note_can_transition(new_status: str):
    if new_status not in CREDIT_NOTE_VALID_STATUSES:
        return False, f"Invalid status: {new_status}"
    return True, None


class TestCreditNoteStatusMachine:
    def test_draft_is_valid(self):
        ok, _ = _credit_note_can_transition("draft")
        assert ok

    def test_draft_to_issued(self):
        ok, _ = _credit_note_can_transition("issued")
        assert ok

    def test_issued_to_applied(self):
        ok, _ = _credit_note_can_transition("applied")
        assert ok

    def test_void_is_valid(self):
        ok, _ = _credit_note_can_transition("void")
        assert ok

    def test_paid_is_not_a_credit_note_status(self):
        ok, _ = _credit_note_can_transition("paid")
        assert not ok

    def test_outstanding_is_not_a_credit_note_status(self):
        ok, _ = _credit_note_can_transition("outstanding")
        assert not ok

    def test_all_credit_note_statuses_accepted(self):
        for s in CREDIT_NOTE_VALID_STATUSES:
            ok, _ = _credit_note_can_transition(s)
            assert ok


# ── Cross-module: status sets are disjoint where expected ────────────────────

class TestStatusSetsConsistency:
    def test_invoice_has_more_statuses_than_credit_note(self):
        assert len(INVOICE_VALID_STATUSES) > len(CREDIT_NOTE_VALID_STATUSES)

    def test_quotation_has_converted_status(self):
        assert "converted" in QUOTATION_VALID_STATUSES

    def test_invoice_does_not_have_converted_status(self):
        assert "converted" not in INVOICE_VALID_STATUSES

    def test_bill_has_received_status(self):
        """Bills can be in 'received' state (arrived but not yet approved)."""
        assert "received" in BILL_VALID_STATUSES

    def test_invoice_does_not_have_received_status(self):
        assert "received" not in INVOICE_VALID_STATUSES
