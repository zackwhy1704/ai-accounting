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
        "stripe_product_id": None,
        "stripe_price_id_myr": None,
        "stripe_price_id_sgd": None,
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
        "stripe_product_id": "prod_ULAnTpe3eNAjOp",
        "stripe_price_id_myr": "price_1TMUSFGKa28ddRDdl1YqoQX0",
        "stripe_price_id_sgd": "price_1TMUSGGKa28ddRDdfpTmtraI",
        "stripe_price_id": "price_1TMUSFGKa28ddRDdl1YqoQX0",  # default MYR
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
        "stripe_product_id": "prod_ULAnRv8jOosH9m",
        "stripe_price_id_myr": "price_1TMUSGGKa28ddRDd7jiDLv7l",
        "stripe_price_id_sgd": "price_1TMUSHGKa28ddRDdquXhTToU",
        "stripe_price_id": "price_1TMUSGGKa28ddRDd7jiDLv7l",
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
        "stripe_product_id": "prod_ULAnap1fHJY3JS",
        "stripe_price_id_myr": "price_1TMUSIGKa28ddRDdFlUx6ZVT",
        "stripe_price_id_sgd": "price_1TMUSJGKa28ddRDdp6vmEiA8",
        "stripe_price_id": "price_1TMUSIGKa28ddRDdFlUx6ZVT",
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

# AI scan top-up add-ons — monthly recurring, stackable with any paid plan
ADDONS = {
    "scans_50": {
        "name": "+50 AI Scans",
        "extra_scans": 50,
        "price_monthly_myr": 1500,  # MYR sen
        "price_monthly_sgd": 500,   # SGD cents (approx parity)
        "stripe_product_id": "prod_ULAn6NtBciJP2b",
        "stripe_price_id_myr": "price_1TMUSKGKa28ddRDdCNkrF7i9",
        "stripe_price_id_sgd": "price_1TMVghGKa28ddRDdxNf3yjoA",
    },
    "scans_200": {
        "name": "+200 AI Scans",
        "extra_scans": 200,
        "price_monthly_myr": 4500,
        "price_monthly_sgd": 1500,
        "stripe_product_id": "prod_ULAnAvjrLTWKgA",
        "stripe_price_id_myr": "price_1TMUSLGKa28ddRDdVHfH6pcE",
        "stripe_price_id_sgd": "price_1TMVgiGKa28ddRDdQAqdX0rX",
    },
    "scans_500": {
        "name": "+500 AI Scans",
        "extra_scans": 500,
        "price_monthly_myr": 9000,
        "price_monthly_sgd": 3000,
        "stripe_product_id": "prod_ULAn2fH9H6jgkj",
        "stripe_price_id_myr": "price_1TMUSLGKa28ddRDd4YxFgb4L",
        "stripe_price_id_sgd": "price_1TMVgjGKa28ddRDdnozdAwyM",
    },
    "scans_unlimited": {
        "name": "Unlimited AI Scans",
        "extra_scans": -1,
        "price_monthly_myr": 18000,
        "price_monthly_sgd": 6000,
        "stripe_product_id": "prod_ULAnMbriJRRcZS",
        "stripe_price_id_myr": "price_1TMUSMGKa28ddRDdHqHfFEvv",
        "stripe_price_id_sgd": "price_1TMVglGKa28ddRDdE3HqgLby",
    },
}


def _price_for(plan_config: dict, currency: str) -> str:
    """Pick Stripe price id for the given currency. Falls back to MYR."""
    key = f"stripe_price_id_{currency.lower()}"
    return plan_config.get(key) or plan_config.get("stripe_price_id_myr") or plan_config.get("stripe_price_id", "") or ""


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

    async def create_subscription(self, customer_id: str, plan: str, currency: str = "MYR") -> dict:
        """Create a subscription for the given plan in the requested currency."""
        plan_config = PLANS.get(plan)
        if not plan_config:
            return {"id": f"mock_sub_{plan}", "status": "active"}
        price_id = _price_for(plan_config, currency)
        if not price_id:
            return {"id": f"mock_sub_{plan}", "status": "active"}

        subscription = stripe.Subscription.create(
            customer=customer_id,
            items=[{"price": price_id}],
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

    async def add_addon(self, customer_id: str, subscription_id: str, addon: str, currency: str = "MYR") -> dict:
        """Attach an AI-scan add-on as an extra line item on the customer's subscription."""
        addon_config = ADDONS.get(addon)
        if not addon_config:
            return {"error": "Invalid addon"}
        price_id = addon_config.get(f"stripe_price_id_{currency.lower()}") or addon_config.get("stripe_price_id_myr")
        if not price_id:
            return {"id": f"mock_addon_{addon}", "status": "active"}
        if subscription_id and not subscription_id.startswith("mock_"):
            item = stripe.SubscriptionItem.create(
                subscription=subscription_id,
                price=price_id,
                quantity=1,
                proration_behavior="create_prorations",
            )
            return {"subscription_item_id": item.id, "status": "active"}
        # No active sub: create a standalone subscription for the add-on
        sub = stripe.Subscription.create(
            customer=customer_id,
            items=[{"price": price_id}],
            payment_behavior="default_incomplete",
            expand=["latest_invoice.payment_intent"],
        )
        return {
            "id": sub.id,
            "status": sub.status,
            "client_secret": sub.latest_invoice.payment_intent.client_secret if sub.latest_invoice else None,
        }

    async def record_ai_scan_usage(self, customer_id: str, scans: int = 1) -> None:
        """Record usage-based AI scan for metered billing."""
        if not settings.STRIPE_SECRET_KEY:
            return
        # In production, use Stripe Usage Records with a metered price
        # stripe.SubscriptionItem.create_usage_record(...)

    async def create_checkout_session(
        self,
        customer_id: str,
        plan: str | None,
        success_url: str,
        cancel_url: str,
        currency: str = "MYR",
        addon: str | None = None,
    ) -> str:
        """Create a Stripe Checkout session for a plan and/or add-on."""
        line_items = []
        if plan:
            plan_config = PLANS.get(plan)
            if not plan_config:
                return ""
            pid = _price_for(plan_config, currency)
            if pid:
                line_items.append({"price": pid, "quantity": 1})
        if addon:
            addon_config = ADDONS.get(addon)
            if addon_config:
                aid = addon_config.get(f"stripe_price_id_{currency.lower()}") or addon_config.get("stripe_price_id_myr")
                if aid:
                    line_items.append({"price": aid, "quantity": 1})
        if not line_items:
            return ""

        session = stripe.checkout.Session.create(
            customer=customer_id,
            mode="subscription",
            line_items=line_items,
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
