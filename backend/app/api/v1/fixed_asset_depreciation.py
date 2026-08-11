"""
Automatic depreciation runs + schedules + register for fixed assets.

Split from fixed_assets.py (300-line router rule). The stored
depreciation_method / useful_life_years / salvage_value now actually compute
the amounts (services/depreciation.py); the old manual POST /{id}/depreciate
stays for one-off adjustments.
"""
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_audit
from app.core.database import get_db
from app.core.permissions import require_write
from app.core.security import get_current_user
from app.models.models import FixedAsset, Transaction
from app.services.depreciation import depreciation_schedule, monthly_depreciation
from .gl_helpers import post_gl_by_id

router = APIRouter(prefix="/fixed-assets", tags=["fixed-assets"])


@router.get("/{asset_id}/depreciation-schedule")
async def get_depreciation_schedule(
    asset_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    asset = (await db.execute(
        select(FixedAsset).where(FixedAsset.id == asset_id, FixedAsset.organization_id == current_user["org_id"])
    )).scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Fixed asset not found")
    remaining = depreciation_schedule(
        asset.depreciation_method, float(asset.purchase_cost), float(asset.salvage_value),
        int(asset.useful_life_years), float(asset.accumulated_depreciation),
    )
    return {
        "asset_id": str(asset.id),
        "method": asset.depreciation_method,
        "purchase_cost": float(asset.purchase_cost),
        "salvage_value": float(asset.salvage_value),
        "accumulated_depreciation": float(asset.accumulated_depreciation),
        "net_book_value": float(asset.current_value),
        "remaining_schedule": remaining,
    }


class DepreciationRunRequest(BaseModel):
    period_end: datetime
    asset_ids: list[UUID] | None = None  # default: every eligible asset


@router.post("/run-depreciation")
async def run_depreciation(
    payload: DepreciationRunRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    """Compute and post one month's depreciation for all (or selected) assets.

    Idempotent per period: an asset that already has a depreciation posting
    dated `period_end` is skipped, so re-running a month cannot double-charge.
    """
    org_id = current_user["org_id"]
    period_end = payload.period_end if payload.period_end.tzinfo else payload.period_end.replace(tzinfo=timezone.utc)

    q = select(FixedAsset).where(FixedAsset.organization_id == org_id, FixedAsset.status != "disposed")
    if payload.asset_ids:
        q = q.where(FixedAsset.id.in_(payload.asset_ids))
    assets = (await db.execute(q)).scalars().all()
    if not assets:
        raise HTTPException(status_code=404, detail="No fixed assets found")

    results, posted_total = [], 0.0
    for asset in assets:
        def skip(reason: str):
            results.append({"asset_id": str(asset.id), "code": asset.code, "name": asset.name,
                            "posted": False, "reason": reason})

        if not asset.depreciation_expense_account_id or not asset.accumulated_depreciation_account_id:
            skip("depreciation accounts not configured")
            continue
        if asset.purchase_date and asset.purchase_date > period_end:
            skip("purchased after this period")
            continue
        already = (await db.execute(
            select(Transaction.id).where(
                Transaction.organization_id == org_id,
                Transaction.source == "fixed_asset",
                Transaction.source_id == asset.id,
                Transaction.date == period_end,
                Transaction.description.like("Depreciation%"),
            )
        )).first()
        if already:
            skip("already depreciated for this period")
            continue

        amount = monthly_depreciation(
            asset.depreciation_method, float(asset.purchase_cost), float(asset.salvage_value),
            int(asset.useful_life_years), float(asset.accumulated_depreciation),
        )
        if amount <= 0:
            skip("fully depreciated")
            continue

        txn = await post_gl_by_id(
            db, org_id, period_end,
            f"Depreciation — {asset.name} ({period_end.strftime('%b %Y')})",
            asset.code or asset.name, "fixed_asset", asset.id,
            [(asset.depreciation_expense_account_id, amount, 0.0),
             (asset.accumulated_depreciation_account_id, 0.0, amount)],
        )
        if txn is None:
            skip("posting failed — verify accounts exist")
            continue
        asset.accumulated_depreciation = round(float(asset.accumulated_depreciation) + amount, 2)
        asset.current_value = round(float(asset.current_value) - amount, 2)
        posted_total = round(posted_total + amount, 2)
        results.append({"asset_id": str(asset.id), "code": asset.code, "name": asset.name,
                        "posted": True, "amount": amount,
                        "net_book_value": float(asset.current_value)})

    await db.commit()
    await log_audit(db, org_id, current_user["sub"], "run_depreciation", "fixed_asset", None,
                    {"period_end": period_end.isoformat(), "total": posted_total,
                     "posted": sum(1 for r in results if r["posted"])})
    return {"period_end": period_end.isoformat(), "total_depreciation": posted_total, "results": results}


@router.get("/register/report")
async def fixed_asset_register(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Fixed-asset register: cost, accumulated depreciation, NBV per asset + totals."""
    assets = (await db.execute(
        select(FixedAsset).where(FixedAsset.organization_id == current_user["org_id"])
        .order_by(FixedAsset.code)
    )).scalars().all()
    rows = [{
        "id": str(a.id), "code": a.code, "name": a.name, "asset_type": a.asset_type,
        "purchase_date": a.purchase_date.isoformat() if a.purchase_date else None,
        "method": a.depreciation_method, "useful_life_years": a.useful_life_years,
        "purchase_cost": float(a.purchase_cost), "salvage_value": float(a.salvage_value),
        "accumulated_depreciation": float(a.accumulated_depreciation),
        "net_book_value": float(a.current_value), "status": a.status,
    } for a in assets]
    return {
        "rows": rows,
        "totals": {
            "purchase_cost": round(sum(r["purchase_cost"] for r in rows), 2),
            "accumulated_depreciation": round(sum(r["accumulated_depreciation"] for r in rows), 2),
            "net_book_value": round(sum(r["net_book_value"] for r in rows), 2),
        },
    }
