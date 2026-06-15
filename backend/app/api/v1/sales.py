"""Sales shim module.

The sales endpoints were split into per-entity routers (quotations,
delivery_orders, credit_notes, debit_notes, sales_payments, sales_refunds).
This module is kept as a shim so that:

  * `calc_totals` continues to live in one canonical place and is imported
    by the new routers and by purchase_debit_notes.
  * `next_sequence_number` and `SalesRefund` remain importable via
    `from .sales import ...` for the other routers that depend on them.
  * a (now empty) `router` symbol still exists for any legacy reference.
"""

from fastapi import APIRouter

# Re-exports — keep existing `from .sales import ...` imports working.
from app.core.sequences import next_sequence_number  # noqa: F401
from app.models.models import SalesRefund  # noqa: F401

router = APIRouter(tags=["Sales"])


# ── Helper: calculate line item totals ──
def calc_totals(line_items, has_discount=True):
    """Discount is either a percentage (0-100) or a flat amount depending on discount_mode."""
    subtotal = 0
    tax_amount = 0
    discount_total = 0
    for item in line_items:
        amount = item.quantity * item.unit_price
        disc_raw = getattr(item, 'discount', 0) or 0
        disc_mode = getattr(item, 'discount_mode', 'percent') or 'percent'
        if disc_mode == 'amount':
            disc_value = min(disc_raw, amount)
        else:
            disc_value = amount * (disc_raw / 100)
        amount_after_disc = amount - disc_value
        tax = amount_after_disc * (item.tax_rate / 100)
        subtotal += amount
        tax_amount += tax
        discount_total += disc_value
    return subtotal, discount_total, tax_amount
