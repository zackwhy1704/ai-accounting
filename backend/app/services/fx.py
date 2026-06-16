"""
⚠️  NOT YET WIRED — see roadmap item FX-1.

These helpers are correct and unit-tested, but NOTHING in the routers or
gl_posting imports them yet. Today, a document in a non-base currency posts GL at
FACE VALUE (no conversion), and no realised FX gain/loss is recorded on payment.
Do NOT assume FX conversion happens anywhere. The 5900 Foreign Exchange Gain/Loss
account is seeded but currently never receives a posting.

To make multi-currency real, see the FX-1 plan:
  1. snapshot the document-date rate on Invoice/Bill/SalesPayment/PurchasePayment
  2. convert GL legs to base currency in gl_posting when currency != base
  3. post realised_fx_gain_loss() to 5900 on settlement
Until then the UI shows a single-currency advisory on multi-currency documents.

Foreign-exchange helpers for multi-currency documents.

- fx_rate(): look up the most recent rate at/before a date (1.0 if same currency
  or no rate on file — callers post at face value rather than fail).
- to_base(): convert a document-currency amount to the org base currency.
- realised_fx_gain_loss(): on settlement, the difference between the base value at
  invoice date and at payment date is a realised FX gain (or loss).

Gain/loss convention (receivable / AR):
    gain = base_at_payment - base_at_invoice
A positive number means the foreign currency strengthened — more base currency
received than booked — a GAIN (credit 5900). Negative = LOSS (debit 5900).
"""
from datetime import datetime

from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import ExchangeRate


async def fx_rate(db: AsyncSession, org_id, from_currency: str, to_currency: str, on_date: datetime | None = None) -> float:
    """Most recent rate (from->to) at or before on_date. 1.0 if same or none found."""
    if not from_currency or not to_currency or from_currency.upper() == to_currency.upper():
        return 1.0
    q = (
        select(ExchangeRate)
        .where(
            ExchangeRate.organization_id == org_id,
            ExchangeRate.from_currency == from_currency.upper(),
            ExchangeRate.to_currency == to_currency.upper(),
        )
        .order_by(desc(ExchangeRate.rate_date))
        .limit(1)
    )
    if on_date is not None:
        q = (
            select(ExchangeRate)
            .where(
                ExchangeRate.organization_id == org_id,
                ExchangeRate.from_currency == from_currency.upper(),
                ExchangeRate.to_currency == to_currency.upper(),
                ExchangeRate.rate_date <= on_date,
            )
            .order_by(desc(ExchangeRate.rate_date))
            .limit(1)
        )
    rate = (await db.execute(q)).scalar_one_or_none()
    return float(rate.rate) if rate and rate.rate else 1.0


def to_base(amount: float, rate: float) -> float:
    return round(float(amount or 0) * float(rate or 1.0), 2)


def realised_fx_gain_loss(amount_doc_ccy: float, rate_at_invoice: float, rate_at_payment: float) -> float:
    """Realised FX gain (+) or loss (-) in base currency for an AR settlement."""
    base_invoice = to_base(amount_doc_ccy, rate_at_invoice)
    base_payment = to_base(amount_doc_ccy, rate_at_payment)
    return round(base_payment - base_invoice, 2)
