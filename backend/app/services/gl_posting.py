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

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.gl_helpers import post_gl, post_gl_by_id
from app.core.org_defaults import get_default_accounts
from app.services.fx import convert_doc_amounts, to_base

FX_GAIN_LOSS_CODE = "5900"


async def _fx_account_id(db: AsyncSession, org_id):
    """Account id for 5900 Foreign Exchange Gain/Loss, or None if not in the chart."""
    from app.models.models import Account
    return (await db.execute(
        select(Account.id).where(Account.organization_id == org_id, Account.code == FX_GAIN_LOSS_CODE)
    )).scalar_one_or_none()


async def post_invoice_gl(
    db: AsyncSession, org_id, *, issue_date: datetime, number: str,
    invoice_id: UUID, subtotal: float, tax_amount: float, total: float,
    rate: float = 1.0, project_id=None, department_id=None,
):
    """DR AR (total) / CR Revenue (subtotal) / CR Output Tax (tax) — one balanced txn.
    Amounts arrive in document currency; `rate` converts them to org base currency."""
    subtotal, tax_amount, total = convert_doc_amounts(subtotal, tax_amount, total, rate)
    defaults = await get_default_accounts(db, org_id)
    if defaults.get("ar") and defaults.get("revenue") and (tax_amount == 0 or defaults.get("output_tax")):
        entries = [(defaults["ar"], total, 0.0), (defaults["revenue"], 0.0, subtotal)]
        if tax_amount > 0:
            entries.append((defaults["output_tax"], 0.0, tax_amount))
        return await post_gl_by_id(db, org_id, issue_date, f"Invoice {number}", number, "invoice", invoice_id, entries,
                                   project_id=project_id, department_id=department_id)
    entries_code = [("1100", total, 0), ("4000", 0, subtotal)]
    if tax_amount > 0:
        entries_code.append(("2100", 0, tax_amount))
    return await post_gl(db, org_id, issue_date, f"Invoice {number}", number, "invoice", invoice_id, entries_code,
                         project_id=project_id, department_id=department_id)


async def post_bill_gl(
    db: AsyncSession, org_id, *, issue_date: datetime, number: str,
    bill_id: UUID, subtotal: float, tax_amount: float, total: float,
    rate: float = 1.0, project_id=None, department_id=None,
):
    """DR Expense (subtotal) / DR Input Tax (tax) / CR AP (total) — one balanced txn."""
    subtotal, tax_amount, total = convert_doc_amounts(subtotal, tax_amount, total, rate)
    defaults = await get_default_accounts(db, org_id)
    if defaults.get("ap") and defaults.get("expense") and (tax_amount == 0 or defaults.get("input_tax")):
        entries = [(defaults["expense"], subtotal, 0.0), (defaults["ap"], 0.0, total)]
        if tax_amount > 0:
            entries.append((defaults["input_tax"], tax_amount, 0.0))
        return await post_gl_by_id(db, org_id, issue_date, f"Bill {number}", number, "bill", bill_id, entries,
                                   project_id=project_id, department_id=department_id)
    entries_code = [("5000", subtotal, 0), ("2000", 0, total)]
    if tax_amount > 0:
        entries_code.append(("1200", tax_amount, 0))
    return await post_gl(db, org_id, issue_date, f"Bill {number}", number, "bill", bill_id, entries_code,
                         project_id=project_id, department_id=department_id)


async def post_sales_payment_gl(
    db: AsyncSession, org_id, *, payment_date: datetime, number: str,
    payment_id: UUID, amount: float, rate: float = 1.0,
    cleared_base: float | None = None,
):
    """DR Bank / CR AR — customer payment received.

    `amount` is in payment currency; `rate` is the payment-date rate to base.
    `cleared_base` is the base-currency value at which the settled invoices/debit
    notes were originally booked (sum of allocation x invoice-date rate). The
    difference between bank-at-payment and AR-at-booking is realised FX gain
    (CR 5900) or loss (DR 5900). Without a 5900 account the AR leg clears at the
    bank value (pre-FX behaviour) so the transaction always balances.
    """
    bank_base = to_base(amount, rate)
    ar_base = round(float(cleared_base), 2) if cleared_base is not None else bank_base
    fx_diff = round(bank_base - ar_base, 2)
    fx_id = await _fx_account_id(db, org_id) if fx_diff != 0 else None
    if fx_diff != 0 and fx_id is None:
        ar_base, fx_diff = bank_base, 0.0

    defaults = await get_default_accounts(db, org_id)
    if defaults.get("bank") and defaults.get("ar"):
        entries = [(defaults["bank"], bank_base, 0.0), (defaults["ar"], 0.0, ar_base)]
        if fx_diff > 0:
            entries.append((fx_id, 0.0, fx_diff))
        elif fx_diff < 0:
            entries.append((fx_id, -fx_diff, 0.0))
        return await post_gl_by_id(
            db, org_id, payment_date, f"Payment received {number}", number, "payment", payment_id, entries,
        )
    entries_code = [("1000", bank_base, 0), ("1100", 0, ar_base)]
    if fx_diff > 0:
        entries_code.append((FX_GAIN_LOSS_CODE, 0, fx_diff))
    elif fx_diff < 0:
        entries_code.append((FX_GAIN_LOSS_CODE, -fx_diff, 0))
    return await post_gl(
        db, org_id, payment_date, f"Payment received {number}", number, "payment", payment_id, entries_code,
    )


async def post_purchase_payment_gl(
    db: AsyncSession, org_id, *, payment_date: datetime, number: str,
    payment_id: UUID, amount: float, rate: float = 1.0,
    cleared_base: float | None = None,
):
    """DR AP / CR Bank — payment made to supplier.

    `cleared_base` is the base value at which the settled bill/debit note was
    booked. Paying less base than booked is a realised FX gain (CR 5900);
    paying more is a loss (DR 5900). See post_sales_payment_gl.
    """
    bank_base = to_base(amount, rate)
    ap_base = round(float(cleared_base), 2) if cleared_base is not None else bank_base
    fx_diff = round(ap_base - bank_base, 2)
    fx_id = await _fx_account_id(db, org_id) if fx_diff != 0 else None
    if fx_diff != 0 and fx_id is None:
        ap_base, fx_diff = bank_base, 0.0

    defaults = await get_default_accounts(db, org_id)
    desc = f"Purchase payment {number}"
    if defaults.get("ap") and defaults.get("bank"):
        entries = [(defaults["ap"], ap_base, 0.0), (defaults["bank"], 0.0, bank_base)]
        if fx_diff > 0:
            entries.append((fx_id, 0.0, fx_diff))
        elif fx_diff < 0:
            entries.append((fx_id, -fx_diff, 0.0))
        return await post_gl_by_id(
            db, org_id, payment_date, desc, number, "purchase_payment", payment_id, entries,
        )
    entries_code = [("2000", ap_base, 0), ("1000", 0, bank_base)]
    if fx_diff > 0:
        entries_code.append((FX_GAIN_LOSS_CODE, 0, fx_diff))
    elif fx_diff < 0:
        entries_code.append((FX_GAIN_LOSS_CODE, -fx_diff, 0))
    return await post_gl(
        db, org_id, payment_date, desc, number, "purchase_payment", payment_id, entries_code,
    )


# ── Credit / debit notes & refunds & receipts ──────────────────────────────────
# NOTE: `subtotal` below is the NET (after-discount) figure returned by
# calculate_line_items, so `total == subtotal + tax_amount`. The revenue/expense
# leg uses `subtotal` directly — never `subtotal - discount` (that double-counts
# the discount and unbalances the transaction).

async def post_credit_note_gl(
    db: AsyncSession, org_id, *, issue_date: datetime, number: str,
    cn_id: UUID, subtotal: float, tax_amount: float, total: float,
    rate: float = 1.0,
):
    """Sales credit note (reverses a sale): DR Revenue / DR Output Tax / CR AR."""
    subtotal, tax_amount, total = convert_doc_amounts(subtotal, tax_amount, total, rate)
    defaults = await get_default_accounts(db, org_id)
    if defaults.get("ar") and defaults.get("revenue") and (tax_amount == 0 or defaults.get("output_tax")):
        entries = [(defaults["revenue"], subtotal, 0.0), (defaults["ar"], 0.0, total)]
        if tax_amount > 0:
            entries.append((defaults["output_tax"], tax_amount, 0.0))
        return await post_gl_by_id(db, org_id, issue_date, f"Credit Note {number}", number, "credit_note", cn_id, entries)
    entries_code = [("4000", subtotal, 0), ("1100", 0, total)]
    if tax_amount > 0:
        entries_code.append(("2100", tax_amount, 0))
    return await post_gl(db, org_id, issue_date, f"Credit Note {number}", number, "credit_note", cn_id, entries_code)


async def post_debit_note_gl(
    db: AsyncSession, org_id, *, issue_date: datetime, number: str,
    dn_id: UUID, subtotal: float, tax_amount: float, total: float,
    rate: float = 1.0,
):
    """Sales debit note (increases a sale): DR AR / CR Revenue / CR Output Tax."""
    subtotal, tax_amount, total = convert_doc_amounts(subtotal, tax_amount, total, rate)
    defaults = await get_default_accounts(db, org_id)
    if defaults.get("ar") and defaults.get("revenue") and (tax_amount == 0 or defaults.get("output_tax")):
        entries = [(defaults["ar"], total, 0.0), (defaults["revenue"], 0.0, subtotal)]
        if tax_amount > 0:
            entries.append((defaults["output_tax"], 0.0, tax_amount))
        return await post_gl_by_id(db, org_id, issue_date, f"Debit Note {number}", number, "debit_note", dn_id, entries)
    entries_code = [("1100", total, 0), ("4000", 0, subtotal)]
    if tax_amount > 0:
        entries_code.append(("2100", 0, tax_amount))
    return await post_gl(db, org_id, issue_date, f"Debit Note {number}", number, "debit_note", dn_id, entries_code)


async def post_sale_receipt_gl(
    db: AsyncSession, org_id, *, receipt_date: datetime, number: str,
    receipt_id: UUID, subtotal: float, tax_amount: float, total: float,
    rate: float = 1.0,
):
    """Cash sale receipt: DR Bank / CR Revenue / CR Output Tax."""
    subtotal, tax_amount, total = convert_doc_amounts(subtotal, tax_amount, total, rate)
    defaults = await get_default_accounts(db, org_id)
    if defaults.get("bank") and defaults.get("revenue") and (tax_amount == 0 or defaults.get("output_tax")):
        entries = [(defaults["bank"], total, 0.0), (defaults["revenue"], 0.0, subtotal)]
        if tax_amount > 0:
            entries.append((defaults["output_tax"], 0.0, tax_amount))
        return await post_gl_by_id(db, org_id, receipt_date, f"Receipt {number}", number, "sale_receipt", receipt_id, entries)
    entries_code = [("1000", total, 0), ("4000", 0, subtotal)]
    if tax_amount > 0:
        entries_code.append(("2100", 0, tax_amount))
    return await post_gl(db, org_id, receipt_date, f"Receipt {number}", number, "sale_receipt", receipt_id, entries_code)


async def post_sales_refund_gl(
    db: AsyncSession, org_id, *, refund_date: datetime, number: str,
    refund_id: UUID, amount: float, rate: float = 1.0,
):
    """Refund to customer: DR AR (restores receivable) / CR Bank."""
    amount = to_base(amount, rate)
    defaults = await get_default_accounts(db, org_id)
    if defaults.get("ar") and defaults.get("bank"):
        return await post_gl_by_id(
            db, org_id, refund_date, f"Refund {number}", number, "refund", refund_id,
            [(defaults["ar"], amount, 0.0), (defaults["bank"], 0.0, amount)],
        )
    return await post_gl(
        db, org_id, refund_date, f"Refund {number}", number, "refund", refund_id,
        [("1100", amount, 0), ("1000", 0, amount)],
    )


async def post_purchase_credit_note_gl(
    db: AsyncSession, org_id, *, issue_date: datetime, number: str,
    pcn_id: UUID, subtotal: float, tax_amount: float, total: float,
    rate: float = 1.0,
):
    """Purchase credit note (reduces a purchase): DR AP / CR Expense / CR Input Tax."""
    subtotal, tax_amount, total = convert_doc_amounts(subtotal, tax_amount, total, rate)
    defaults = await get_default_accounts(db, org_id)
    if defaults.get("ap") and defaults.get("expense") and (tax_amount == 0 or defaults.get("input_tax")):
        entries = [(defaults["ap"], total, 0.0), (defaults["expense"], 0.0, subtotal)]
        if tax_amount > 0:
            entries.append((defaults["input_tax"], 0.0, tax_amount))
        return await post_gl_by_id(db, org_id, issue_date, f"Purchase Credit Note {number}", number, "purchase_credit_note", pcn_id, entries)
    entries_code = [("2000", total, 0), ("5000", 0, subtotal)]
    if tax_amount > 0:
        entries_code.append(("1200", 0, tax_amount))
    return await post_gl(db, org_id, issue_date, f"Purchase Credit Note {number}", number, "purchase_credit_note", pcn_id, entries_code)


async def post_purchase_debit_note_gl(
    db: AsyncSession, org_id, *, issue_date: datetime, number: str,
    pdn_id: UUID, subtotal: float, tax_amount: float, total: float,
    rate: float = 1.0,
):
    """Purchase debit note (increases a purchase / reduces payable): DR AP / CR Expense / DR Input Tax reversal."""
    subtotal, tax_amount, total = convert_doc_amounts(subtotal, tax_amount, total, rate)
    defaults = await get_default_accounts(db, org_id)
    if defaults.get("ap") and defaults.get("expense") and (tax_amount == 0 or defaults.get("input_tax")):
        entries = [(defaults["ap"], total, 0.0), (defaults["expense"], 0.0, subtotal)]
        if tax_amount > 0:
            entries.append((defaults["input_tax"], 0.0, tax_amount))
        return await post_gl_by_id(db, org_id, issue_date, f"Purchase Debit Note {number}", number, "purchase_debit_note", pdn_id, entries)
    entries_code = [("2000", total, 0), ("5000", 0, subtotal)]
    if tax_amount > 0:
        entries_code.append(("1200", 0, tax_amount))
    return await post_gl(db, org_id, issue_date, f"Purchase Debit Note {number}", number, "purchase_debit_note", pdn_id, entries_code)


async def post_purchase_refund_gl(
    db: AsyncSession, org_id, *, refund_date: datetime, number: str,
    refund_id: UUID, amount: float, rate: float = 1.0,
):
    """Refund from supplier: DR Bank / CR AP (restores payable)."""
    amount = to_base(amount, rate)
    defaults = await get_default_accounts(db, org_id)
    if defaults.get("bank") and defaults.get("ap"):
        return await post_gl_by_id(
            db, org_id, refund_date, f"Purchase Refund {number}", number, "purchase_refund", refund_id,
            [(defaults["bank"], amount, 0.0), (defaults["ap"], 0.0, amount)],
        )
    return await post_gl(
        db, org_id, refund_date, f"Purchase Refund {number}", number, "purchase_refund", refund_id,
        [("1000", amount, 0), ("2000", 0, amount)],
    )
