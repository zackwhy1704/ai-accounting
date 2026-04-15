"""
Stripe integration for hybrid pricing model.
Handles SaaS subscriptions and usage-based AI scan billing.
"""
import stripe
from app.core.config import get_settings

settings = get_settings()
stripe.api_key = settings.STRIPE_SECRET_KEY

# Plan configuration (MYR, billed monthly)
PLANS = {
    "starter": {
        "name": "Starter",
        "tagline": "Forever. No credit card.",
        "price_monthly": 0,  # default (MYR cents)
        "price_monthly_myr": 0,
        "price_monthly_sgd": 0,
        "currency": "MYR",
        "ai_scans_limit": 3,
        "users_limit": 1,
        "stripe_price_id": None,
        "features": [
            "1 user",
            "Up to 20 invoices/month",
            "5 bills/month",
            "Basic reports (P&L, BS)",
            "3 AI scans/month",
            "No white-label",
        ],
        "audience": "business",
    },
    "growth": {
        "name": "Growth",
        "tagline": "vs Xero Standard equivalent",
        "price_monthly": 5900,  # MYR sen
        "price_monthly_myr": 5900,
        "price_monthly_sgd": 1900,  # SGD cents
        "currency": "MYR",
        "ai_scans_limit": 30,
        "users_limit": 3,
        "stripe_price_id": "",
        "popular": True,
        "features": [
            "3 users",
            "Unlimited invoices & bills",
            "Full sales + purchase modules",
            "Bank reconciliation",
            "All 14 reports",
            "30 AI scans/month",
            "SST / GST compliance",
            "MyInvois included",
            "No white-label",
        ],
        "audience": "business",
    },
    "business": {
        "name": "Business",
        "tagline": "Xero Premium equivalent",
        "price_monthly": 12900,
        "price_monthly_myr": 12900,
        "price_monthly_sgd": 3900,
        "currency": "MYR",
        "ai_scans_limit": 100,
        "users_limit": 10,
        "stripe_price_id": "",
        "features": [
            "10 users",
            "Everything in Growth",
            "100 AI scans/month",
            "Multi-currency + FX rates",
            "Inventory management",
            "Fixed assets",
            "Custom fields",
            "Payment links (Stripe/FPX)",
            "Recurring invoices",
        ],
        "audience": "business",
    },
    "firm": {
        "name": "Firm",
        "tagline": "Per firm. Includes up to 10 client orgs.",
        "price_monthly": 29900,
        "price_monthly_myr": 29900,
        "price_monthly_sgd": 8900,
        "currency": "MYR",
        "ai_scans_limit": 300,
        "users_limit": -1,
        "stripe_price_id": "",
        "features": [
            "Unlimited firm users",
            "10 client orgs included",
            "Full white-label (domain, logo, colours)",
            "300 AI scans/month pooled",
            "Firm dashboard + client portal",
            "Document sharing",
            "RM 25/mo per additional client",
        ],
        "audience": "firm",
    },
}

# Usage-based pricing for extra AI scans
AI_SCAN_PRICE_CENTS = 5  # $0.05 per scan


class StripeService:
    async def create_customer(self, email: str, name: str, org_id: str) -> str:
        """Create a Stripe customer for the organization."""
        if not settings.STRIPE_SECRET_KEY:
            return f"mock_cus_{org_id}"

        customer = stripe.Customer.create(
            email=email,
            name=name,
            metadata={"organization_id": org_id},
        )
        return customer.id

    async def create_subscription(self, customer_id: str, plan: str) -> dict:
        """Create a subscription for the given plan."""
        plan_config = PLANS.get(plan)
        if not plan_config or not plan_config["stripe_price_id"]:
            return {"id": f"mock_sub_{plan}", "status": "active"}

        subscription = stripe.Subscription.create(
            customer=customer_id,
            items=[{"price": plan_config["stripe_price_id"]}],
            payment_behavior="default_incomplete",
            expand=["latest_invoice.payment_intent"],
        )
        return {
            "id": subscription.id,
            "status": subscription.status,
            "client_secret": subscription.latest_invoice.payment_intent.client_secret
            if subscription.latest_invoice
            else None,
        }

    async def record_ai_scan_usage(self, customer_id: str, scans: int = 1) -> None:
        """Record usage-based AI scan for metered billing."""
        if not settings.STRIPE_SECRET_KEY:
            return
        # In production, use Stripe Usage Records with a metered price
        # stripe.SubscriptionItem.create_usage_record(...)

    async def create_checkout_session(self, customer_id: str, plan: str, success_url: str, cancel_url: str) -> str:
        """Create a Stripe Checkout session for plan upgrade."""
        plan_config = PLANS.get(plan)
        if not plan_config or not plan_config["stripe_price_id"]:
            return ""

        session = stripe.checkout.Session.create(
            customer=customer_id,
            mode="subscription",
            line_items=[{"price": plan_config["stripe_price_id"], "quantity": 1}],
            success_url=success_url,
            cancel_url=cancel_url,
        )
        return session.url

    async def handle_webhook(self, payload: bytes, sig_header: str) -> dict:
        """Process Stripe webhook events."""
        if not settings.STRIPE_WEBHOOK_SECRET:
            return {"type": "mock", "data": {}}

        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )

        if event.type == "invoice.paid":
            return {"type": "invoice.paid", "data": event.data.object}
        elif event.type == "customer.subscription.updated":
            return {"type": "subscription.updated", "data": event.data.object}
        elif event.type == "customer.subscription.deleted":
            return {"type": "subscription.deleted", "data": event.data.object}

        return {"type": event.type, "data": {}}


stripe_service = StripeService()
