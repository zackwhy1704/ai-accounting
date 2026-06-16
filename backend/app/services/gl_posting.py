"""
Centralised GL posting for documents.

Every document type built its own `if org defaults set: post by id else: post by
code` block inline. Ten near-identical copies meant they could drift — that is
exactly how the P0 taxed-invoice/bill imbalance happened in 2 of them. This
module is the single place that:

  * resolves accounts (org defaults first, hardcoded chart codes as fallback),
  * builds ONE balanced entry list (all legs, including tax, in one transaction),
  * delegates to the gl_helpers writers.

Routers call these functions instead of hand-rolling entries.
"""
from datetime import datetime
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.gl_helpers import post_gl, post_gl_by_id
from app.core.org_defaults import get_default_accounts


async def post_invoice_gl(
    db: AsyncSession, org_id, *, issue_date: datetime, number: str,
    invoice_id: UUID, subtotal: float, tax_amount: float, total: float,
):
    """DR AR (total) / CR Revenue (subtotal) / CR Output Tax (tax) — one balanced txn."""
    defaults = await get_default_accounts(db, org_id)
    if defaults.get("ar") and defaults.get("revenue") and (tax_amount == 0 or defaults.get("output_tax")):
        entries = [(defaults["ar"], total, 0.0), (defaults["revenue"], 0.0, subtotal)]
        if tax_amount > 0:
            entries.append((defaults["output_tax"], 0.0, tax_amount))
        return await post_gl_by_id(db, org_id, issue_date, f"Invoice {number}", number, "invoice", invoice_id, entries)
    entries_code = [("1100", total, 0), ("4000", 0, subtotal)]
    if tax_amount > 0:
        entries_code.append(("2100", 0, tax_amount))
    return await post_gl(db, org_id, issue_date, f"Invoice {number}", number, "invoice", invoice_id, entries_code)


async def post_bill_gl(
    db: AsyncSession, org_id, *, issue_date: datetime, number: str,
    bill_id: UUID, subtotal: float, tax_amount: float, total: float,
):
    """DR Expense (subtotal) / DR Input Tax (tax) / CR AP (total) — one balanced txn."""
    defaults = await get_default_accounts(db, org_id)
    if defaults.get("ap") and defaults.get("expense") and (tax_amount == 0 or defaults.get("input_tax")):
        entries = [(defaults["expense"], subtotal, 0.0), (defaults["ap"], 0.0, total)]
        if tax_amount > 0:
            entries.append((defaults["input_tax"], tax_amount, 0.0))
        return await post_gl_by_id(db, org_id, issue_date, f"Bill {number}", number, "bill", bill_id, entries)
    entries_code = [("5000", subtotal, 0), ("2000", 0, total)]
    if tax_amount > 0:
        entries_code.append(("1200", tax_amount, 0))
    return await post_gl(db, org_id, issue_date, f"Bill {number}", number, "bill", bill_id, entries_code)


async def post_sales_payment_gl(
    db: AsyncSession, org_id, *, payment_date: datetime, number: str,
    payment_id: UUID, amount: float,
):
    """DR Bank / CR AR — customer payment received."""
    defaults = await get_default_accounts(db, org_id)
    if defaults.get("bank") and defaults.get("ar"):
        return await post_gl_by_id(
            db, org_id, payment_date, f"Payment received {number}", number, "payment", payment_id,
            [(defaults["bank"], amount, 0.0), (defaults["ar"], 0.0, amount)],
        )
    return await post_gl(
        db, org_id, payment_date, f"Payment received {number}", number, "payment", payment_id,
        [("1000", amount, 0), ("1100", 0, amount)],
    )


async def post_purchase_payment_gl(
    db: AsyncSession, org_id, *, payment_date: datetime, number: str,
    payment_id: UUID, amount: float,
):
    """DR AP / CR Bank — payment made to supplier."""
    defaults = await get_default_accounts(db, org_id)
    desc = f"Purchase payment {number}"
    if defaults.get("ap") and defaults.get("bank"):
        return await post_gl_by_id(
            db, org_id, payment_date, desc, number, "purchase_payment", payment_id,
            [(defaults["ap"], amount, 0.0), (defaults["bank"], 0.0, amount)],
        )
    return await post_gl(
        db, org_id, payment_date, desc, number, "purchase_payment", payment_id,
        [("2000", amount, 0), ("1000", 0, amount)],
    )
