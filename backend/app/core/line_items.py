"""Canonical line-item total calculation (dict-based).

Builds on app.services.pricing (the pure per-line math). This is the single
entry point new code should use to compute document totals from a list of
line-item dicts. It also mutates each item's `amount` in place (after-discount,
pre-tax) to match the prior inline behavior in the routers.

Returns (subtotal, total_tax, total_discount, total) where:
  subtotal   = sum of after-discount line amounts
  total_tax  = sum of per-line tax
  total      = subtotal + total_tax
"""
from app.services import pricing


def calculate_line_items(items: list[dict], discount_mode_field: str = "discount_mode"):
    subtotal = 0.0
    total_tax = 0.0
    total_discount = 0.0
    for item in items:
        qty = item.get("quantity", 1) or 0
        price = item.get("unit_price", 0) or 0
        discount = item.get("discount", 0) or 0
        mode = item.get(discount_mode_field, "percent") or "percent"
        tax_rate = item.get("tax_rate", 0) or 0

        gross = pricing.line_total(qty, price)
        disc = pricing.line_discount_amount(discount, mode, gross)
        after_disc = gross - disc
        tax = pricing.line_tax(after_disc, tax_rate)

        item["amount"] = round(after_disc, 2)
        subtotal += after_disc
        total_tax += tax
        total_discount += disc

    return (
        round(subtotal, 2),
        round(total_tax, 2),
        round(total_discount, 2),
        round(subtotal + total_tax, 2),
    )
