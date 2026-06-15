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
from app.core.line_items import calculate_line_items as _calc


def calc_totals(line_items, has_discount=True):
    """Delegate to canonical calculate_line_items. Returns (subtotal, discount_total, tax_amount)."""
    items_dicts = [
        {
            "quantity": getattr(item, "quantity", 1),
            "unit_price": getattr(item, "unit_price", 0),
            "discount": getattr(item, "discount", 0) or 0,
            "discount_mode": getattr(item, "discount_mode", "percent") or "percent",
            "tax_rate": getattr(item, "tax_rate", 0) or 0,
        }
        for item in line_items
    ]
    subtotal, tax_amount, discount_total, _ = _calc(items_dicts)
    return subtotal, discount_total, tax_amount
