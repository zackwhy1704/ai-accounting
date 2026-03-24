"""
Stripe integration for hybrid pricing model.
Handles SaaS subscriptions and usage-based AI scan billing.
"""
import stripe
from app.core.config import get_settings

settings = get_settings()
stripe.api_key = settings.STRIPE_SECRET_KEY

# Plan configuration matching frontend pricing
PLANS = {
    "starter": {
        "name": "Starter",
        "price_monthly": 0,
        "ai_scans_limit": 10,
        "users_limit": 1,
        "stripe_price_id": None,  # Free tier
    },
    "essentials": {
        "name": "Essentials",
        "price_monthly": 2900,  # cents
        "ai_scans_limit": 100,
        "users_limit": 3,
        "stripe_price_id": "",  # Set via env/Stripe dashboard
    },
    "professional": {
        "name": "Professional",
        "price_monthly": 6900,
        "ai_scans_limit": 500,
        "users_limit": 10,
        "stripe_price_id": "",
    },
    "enterprise": {
        "name": "Enterprise",
        "price_monthly": 14900,
        "ai_scans_limit": -1,  # Unlimited
        "users_limit": 25,
        "stripe_price_id": "",
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
