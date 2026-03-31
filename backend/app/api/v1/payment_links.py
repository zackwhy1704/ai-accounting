"""
Payment Links — public Stripe checkout links for invoices.
Supports: Stripe card, FPX (Malaysia online banking via Stripe).
"""
import secrets
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from uuid import UUID

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import PaymentLink, Invoice, Organization

router = APIRouter(prefix="/payment-links", tags=["payment-links"])


class PaymentLinkCreate(BaseModel):
    invoice_id: UUID | None = None
    amount: float
    currency: str = "MYR"
    description: str | None = None
    gateway: str = "stripe"          # stripe | fpx | paypal
    expires_in_days: int | None = 30


class PaymentLinkResponse(BaseModel):
    id: UUID
    organization_id: UUID
    invoice_id: UUID | None
    token: str
    is_active: bool
    expires_at: datetime | None
    amount: float
    currency: str
    description: str | None
    gateway: str
    stripe_checkout_id: str | None
    paid_at: datetime | None
    paid_amount: float | None
    created_at: datetime
    pay_url: str
    model_config = {"from_attributes": True}


def _make_token() -> str:
    return secrets.token_urlsafe(32)


@router.get("", response_model=list[PaymentLinkResponse])
async def list_payment_links(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(PaymentLink)
        .where(PaymentLink.organization_id == current_user["org_id"])
        .order_by(PaymentLink.created_at.desc())
    )
    links = result.scalars().all()
    return [_enrich(l) for l in links]


@router.post("", response_model=PaymentLinkResponse, status_code=201)
async def create_payment_link(
    payload: PaymentLinkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    expires_at = None
    if payload.expires_in_days:
        expires_at = datetime.now(timezone.utc) + timedelta(days=payload.expires_in_days)

    link = PaymentLink(
        organization_id=current_user["org_id"],
        invoice_id=payload.invoice_id,
        token=_make_token(),
        is_active=True,
        expires_at=expires_at,
        amount=payload.amount,
        currency=payload.currency,
        description=payload.description,
        gateway=payload.gateway,
    )
    db.add(link)
    await db.commit()
    await db.refresh(link)
    return _enrich(link)


@router.get("/{token}/public")
async def get_public_payment_link(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint — no auth required. Returns payment page data."""
    result = await db.execute(select(PaymentLink).where(PaymentLink.token == token))
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Payment link not found")
    if not link.is_active:
        raise HTTPException(status_code=410, detail="Payment link is no longer active")
    if link.expires_at and link.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Payment link has expired")
    if link.paid_at:
        raise HTTPException(status_code=409, detail="Invoice already paid")

    # Get org name for display
    org_result = await db.execute(select(Organization).where(Organization.id == link.organization_id))
    org = org_result.scalar_one_or_none()

    return {
        "token": link.token,
        "amount": float(link.amount),
        "currency": link.currency,
        "description": link.description,
        "gateway": link.gateway,
        "expires_at": link.expires_at.isoformat() if link.expires_at else None,
        "organization_name": org.name if org else "Unknown",
        "is_active": link.is_active,
    }


@router.post("/{token}/checkout")
async def create_checkout_session(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """Create a Stripe checkout session for this payment link."""
    result = await db.execute(select(PaymentLink).where(PaymentLink.token == token))
    link = result.scalar_one_or_none()
    if not link or not link.is_active:
        raise HTTPException(status_code=404, detail="Payment link not found or inactive")
    if link.paid_at:
        raise HTTPException(status_code=409, detail="Already paid")

    # Get org settings for Stripe key
    org_result = await db.execute(select(Organization).where(Organization.id == link.organization_id))
    org = org_result.scalar_one_or_none()

    try:
        import stripe
        from app.core.config import get_settings
        settings = get_settings()
        stripe.api_key = settings.STRIPE_SECRET_KEY if hasattr(settings, "STRIPE_SECRET_KEY") else ""

        # Build payment method types based on gateway and currency
        pm_types = ["card"]
        if link.gateway == "fpx" and link.currency == "MYR":
            pm_types = ["fpx"]
        elif link.gateway == "stripe":
            pm_types = ["card"]

        session = stripe.checkout.Session.create(
            payment_method_types=pm_types,
            line_items=[{
                "price_data": {
                    "currency": link.currency.lower(),
                    "product_data": {"name": link.description or f"Payment to {org.name if org else 'Merchant'}"},
                    "unit_amount": int(float(link.amount) * 100),
                },
                "quantity": 1,
            }],
            mode="payment",
            success_url=f"/pay/{token}/success",
            cancel_url=f"/pay/{token}",
            metadata={"payment_link_token": token},
        )
        link.stripe_checkout_id = session.id
        await db.commit()
        return {"checkout_url": session.url, "session_id": session.id}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Stripe error: {str(e)}")


def _enrich(link: PaymentLink) -> dict:
    d = {
        "id": link.id,
        "organization_id": link.organization_id,
        "invoice_id": link.invoice_id,
        "token": link.token,
        "is_active": link.is_active,
        "expires_at": link.expires_at,
        "amount": float(link.amount),
        "currency": link.currency,
        "description": link.description,
        "gateway": link.gateway,
        "stripe_checkout_id": link.stripe_checkout_id,
        "paid_at": link.paid_at,
        "paid_amount": float(link.paid_amount) if link.paid_amount else None,
        "created_at": link.created_at,
        "pay_url": f"/pay/{link.token}",
    }
    return d
