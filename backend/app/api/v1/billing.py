from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import Organization
from app.services.stripe_service import stripe_service, PLANS

router = APIRouter(prefix="/billing", tags=["Billing"])


@router.get("/plans")
async def get_plans():
    return {
        plan_id: {
            "name": config["name"],
            "price_monthly": config["price_monthly"],
            "ai_scans_limit": config["ai_scans_limit"],
            "users_limit": config["users_limit"],
        }
        for plan_id, config in PLANS.items()
    }


@router.get("/usage")
async def get_usage(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Organization).where(Organization.id == current_user["org_id"])
    )
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    return {
        "plan": org.plan,
        "ai_scans_used": org.ai_scans_used,
        "ai_scans_limit": org.ai_scans_limit,
        "ai_scans_remaining": max(0, org.ai_scans_limit - org.ai_scans_used),
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
