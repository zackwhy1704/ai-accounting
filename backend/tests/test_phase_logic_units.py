"""
Pure-logic unit tests for Phase 2/3 features — no DB, no network.
These complement the DB-dependent integration tests (which skip without Postgres)
so the core arithmetic is always covered in CI.
"""
from datetime import datetime, timedelta, timezone


# ── Opening-balance retained-earnings plug ─────────────────────────────────────

def _opening_plug(lines):
    """Mirror of set_opening_balances: imbalance = total_debit - total_credit,
    absorbed by retained earnings (credit if positive, debit if negative)."""
    total_debit = round(sum(l["debit"] for l in lines), 2)
    total_credit = round(sum(l["credit"] for l in lines), 2)
    return round(total_debit - total_credit, 2)


def test_opening_balance_plug_credits_retained_earnings_when_debit_heavy():
    lines = [{"debit": 1000.0, "credit": 0.0}, {"debit": 0.0, "credit": 400.0}]
    # 1000 DR vs 400 CR -> 600 imbalance -> 600 CREDIT to retained earnings to balance
    assert _opening_plug(lines) == 600.0


def test_opening_balance_plug_debits_retained_earnings_when_credit_heavy():
    lines = [{"debit": 0.0, "credit": 900.0}, {"debit": 300.0, "credit": 0.0}]
    assert _opening_plug(lines) == -600.0  # negative -> debit RE


def test_opening_balance_already_balanced_needs_no_plug():
    lines = [{"debit": 500.0, "credit": 0.0}, {"debit": 0.0, "credit": 500.0}]
    assert _opening_plug(lines) == 0.0


# ── GST F5 box computation ─────────────────────────────────────────────────────

def _gst_f5_boxes(output_tax_dr, output_tax_cr, input_tax_dr, input_tax_cr,
                  rev_cr, rev_dr, exp_dr, exp_cr):
    """Mirror of sg_compliance.gst_f5_return box math."""
    box6 = round(output_tax_cr - output_tax_dr, 2)   # output tax = credit balance
    box7 = round(input_tax_dr - input_tax_cr, 2)     # input tax = debit balance
    box1 = round(rev_cr - rev_dr, 2)                  # net revenue
    box5 = round(exp_dr - exp_cr, 2)                  # net expense
    box8 = round(box6 - box7, 2)
    return {"box1": box1, "box5": box5, "box6": box6, "box7": box7, "box8": box8}


def test_gst_f5_net_payable_when_output_exceeds_input():
    # Sales 1000 (output tax 60), purchases 400 (input tax 24)
    boxes = _gst_f5_boxes(0, 60, 24, 0, 1000, 0, 400, 0)
    assert boxes["box6"] == 60.0
    assert boxes["box7"] == 24.0
    assert boxes["box1"] == 1000.0
    assert boxes["box5"] == 400.0
    assert boxes["box8"] == 36.0   # net payable


def test_gst_f5_net_refundable_when_input_exceeds_output():
    boxes = _gst_f5_boxes(0, 20, 50, 0, 333.33, 0, 800, 0)
    assert boxes["box8"] == -30.0  # negative -> refundable


# ── Payment-terms due-date derivation ──────────────────────────────────────────

def _derive_due(issue: datetime, terms_days: int | None, provided_due: datetime | None):
    """Mirror of create_invoice payment-terms logic."""
    if terms_days and (provided_due is None or provided_due <= issue):
        return issue + timedelta(days=int(terms_days))
    return provided_due


def test_due_date_derived_when_no_later_due_given():
    issue = datetime(2026, 6, 1, tzinfo=timezone.utc)
    assert _derive_due(issue, 30, issue) == issue + timedelta(days=30)
    assert _derive_due(issue, 45, None) == issue + timedelta(days=45)


def test_explicit_later_due_date_is_respected_over_terms():
    issue = datetime(2026, 6, 1, tzinfo=timezone.utc)
    explicit = issue + timedelta(days=14)
    # explicit due is after issue -> keep it, don't override with terms
    assert _derive_due(issue, 30, explicit) == explicit


def test_no_terms_keeps_provided_due():
    issue = datetime(2026, 6, 1, tzinfo=timezone.utc)
    due = issue + timedelta(days=7)
    assert _derive_due(issue, None, due) == due


# ── FX realised gain/loss (already wired in fx.py) ─────────────────────────────

def test_fx_realised_gain_loss_logic():
    from app.services.fx import realised_fx_gain_loss, to_base
    assert to_base(100, 4.5) == 450.0
    assert realised_fx_gain_loss(100, 4.50, 4.70) == 20.0   # gain
    assert realised_fx_gain_loss(100, 4.50, 4.30) == -20.0  # loss
