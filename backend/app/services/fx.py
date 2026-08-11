"""
Foreign-exchange helpers for multi-currency documents.

WIRED (FX-1, migration a035): every posting document snapshots its document-date
rate in an `exchange_rate` column, gl_posting converts all GL legs to the org
base currency via that rate, and payments post the realised FX difference
between invoice-date and payment-date base values to 5900 Foreign Exchange
Gain/Loss. Legacy rows default exchange_rate=1 (they were booked at face
value), so settlements against them clear AR/AP at exactly the booked amount.

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

from app.models.models import ExchangeRate, Organization


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


async def document_rate(db: AsyncSession, org_id, doc_currency: str | None, on_date: datetime | None = None) -> float:
    """Document-date rate from doc_currency to the org base currency (1.0 if same/none)."""
    if not doc_currency:
        return 1.0
    org = (await db.execute(select(Organization).where(Organization.id == org_id))).scalar_one_or_none()
    base = (org.base_currency if org and org.base_currency else "MYR")
    return await fx_rate(db, org_id, doc_currency, base, on_date)


def convert_doc_amounts(subtotal: float, tax_amount: float, total: float, rate: float) -> tuple[float, float, float]:
    """Convert (subtotal, tax, total) to base currency, guaranteed to satisfy
    total_base == subtotal_base + tax_base so the GL transaction stays balanced
    after per-leg rounding. The tax leg absorbs the rounding remainder."""
    total_b = to_base(total, rate)
    if not tax_amount or float(tax_amount) <= 0:
        return total_b, 0.0, total_b
    sub_b = to_base(subtotal, rate)
    return sub_b, round(total_b - sub_b, 2), total_b


def realised_fx_gain_loss(amount_doc_ccy: float, rate_at_invoice: float, rate_at_payment: float) -> float:
    """Realised FX gain (+) or loss (-) in base currency for an AR settlement."""
    base_invoice = to_base(amount_doc_ccy, rate_at_invoice)
    base_payment = to_base(amount_doc_ccy, rate_at_payment)
    return round(base_payment - base_invoice, 2)
