from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import Organization
from app.services.stripe_service import stripe_service, PLANS

router = APIRouter(prefix="/billing", tags=["Billing"])


def _country_from_request(request: Request) -> str:
    """Best-effort country detection: Cloudflare header → Accept-Language → default MY."""
    cf = request.headers.get("cf-ipcountry") or request.headers.get("x-vercel-ip-country")
    if cf and len(cf) == 2:
        return cf.upper()
    al = request.headers.get("accept-language", "")
    lower = al.lower()
    if "sg" in lower or "en-sg" in lower:
        return "SG"
    if "my" in lower or "ms-my" in lower:
        return "MY"
    return "MY"


@router.get("/plans")
async def get_plans(request: Request, currency: str | None = None):
    """Return plan list, localized to caller's currency (SGD for SG, MYR otherwise).
    Override with ?currency=SGD or ?currency=MYR."""
    if currency and currency.upper() in ("SGD", "MYR"):
        cur = currency.upper()
    else:
        country = _country_from_request(request)
        cur = "SGD" if country == "SG" else "MYR"

    result = []
    for plan_id, config in PLANS.items():
        if cur == "SGD":
            price_cents = config.get("price_monthly_sgd", config["price_monthly"])
        else:
            price_cents = config.get("price_monthly_myr", config["price_monthly"])
        result.append({
            "id": plan_id,
            "name": config["name"],
            "tagline": config.get("tagline", ""),
            "price": price_cents / 100,
            "currency": cur,
            "ai_scans": "Unlimited" if config["ai_scans_limit"] == -1 else config["ai_scans_limit"],
            "max_users": config["users_limit"] if config["users_limit"] != -1 else "Unlimited",
            "features": config.get("features", []),
            "popular": config.get("popular", False),
            "audience": config.get("audience", "business"),
        })
    return result


@router.get("/usage")
async def get_usage(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.models.models import User as UserModel
    from sqlalchemy import func

    result = await db.execute(
        select(Organization).where(Organization.id == current_user["org_id"])
    )
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    users_count_result = await db.execute(
        select(func.count()).select_from(UserModel).where(UserModel.organization_id == org.id)
    )
    users_count = users_count_result.scalar() or 0

    return {
        "plan": org.plan,
        "ai_scans_used": org.ai_scans_used,
        "ai_scans_limit": org.ai_scans_limit,
        "users_count": users_count,
    }


@router.post("/upgrade")
async def upgrade_plan(
    plan: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if plan not in PLANS:
        raise HTTPException(status_code=400, detail="Invalid plan")

    result = await db.execute(
        select(Organization).where(Organization.id == current_user["org_id"])
    )
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    # Create Stripe customer if needed
    if not org.stripe_customer_id:
        org.stripe_customer_id = await stripe_service.create_customer(
            email=current_user.get("email", ""),
            name=org.name,
            org_id=str(org.id),
        )

    # Create subscription
    sub_result = await stripe_service.create_subscription(org.stripe_customer_id, plan)
    org.plan = plan
    org.ai_scans_limit = PLANS[plan]["ai_scans_limit"]
    org.stripe_subscription_id = sub_result.get("id")

    return {"plan": plan, "subscription": sub_result}


@router.post("/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    result = await stripe_service.handle_webhook(payload, sig)
    return {"received": True, "type": result["type"]}
