"""Pure pricing math for sales/purchase documents.

These functions centralize the discount/total/tax arithmetic that was
previously inlined (and duplicated) across the routers. They are intentionally
pure: no DB, no ORM, no I/O. Each function reproduces the *exact* prior inline
behavior so financial output (subtotal, tax_amount, total) is byte-identical
before and after migration.

Prior inline behavior (invoices.py and bills.py):
  - line_total = quantity * unit_price
  - discount in "amount" mode: min(discount, line_total)   # clamped to line
  - discount in any other mode (percent): line_total * (discount / 100)
  - after_disc = line_total - discount_amount
  - tax = after_disc * (tax_rate / 100)
  - subtotal = sum(after_disc); tax_amount = sum(tax); total = subtotal + tax_amount

bills.py read discount/discount_mode defensively via getattr with a 'percent'
default; that defaulting happens at the call site, not in the math, so it does
not change the arithmetic here.
"""

from __future__ import annotations


def line_total(quantity: float, unit_price: float) -> float:
    """Gross line amount before discount.

    Both invoices.py and bills.py compute this as quantity * unit_price for
    every line type (there is no services-line special-casing in either
    source file), so this is a straight multiplication.
    """
    return quantity * unit_price


def line_discount_amount(discount: float, discount_mode: str, gross: float) -> float:
    """Discount amount for a single line.

    In "amount" mode the discount is clamped to the line gross via
    ``min(discount, gross)`` (so it can never exceed the line). Any other
    mode (treated as percent) returns ``gross * (discount / 100)``.

    Mirrors the prior inline ``_disc_amount`` in invoices.py and the
    ``_disc_amount``/``_disc_upd`` closures in bills.py exactly.
    """
    if discount_mode == "amount":
        return min(discount, gross)
    return gross * (discount / 100)


def line_after_discount(quantity: float, unit_price: float, discount: float, discount_mode: str) -> float:
    """Net line amount after discount (gross - discount), before tax."""
    gross = line_total(quantity, unit_price)
    return gross - line_discount_amount(discount, discount_mode, gross)


def line_tax(after_disc: float, tax_rate: float) -> float:
    """Tax on a discounted line: after_disc * (tax_rate / 100)."""
    return after_disc * (tax_rate / 100)


def compute_totals(items: list[dict]) -> tuple[float, float, float]:
    """Aggregate subtotal, tax_amount, and total over a list of line items.

    Each item dict must provide: quantity, unit_price, discount,
    discount_mode, tax_rate. Returns (subtotal, tax_amount, total) where:
      subtotal   = sum of after-discount line amounts
      tax_amount = sum of per-line tax
      total      = subtotal + tax_amount

    Reproduces the prior inline accumulation loops verbatim.
    """
    subtotal = 0.0
    tax_amount = 0.0
    for item in items:
        after_disc = line_after_discount(
            item["quantity"], item["unit_price"], item["discount"], item["discount_mode"]
        )
        subtotal += after_disc
        tax_amount += line_tax(after_disc, item["tax_rate"])
    return subtotal, tax_amount, subtotal + tax_amount
