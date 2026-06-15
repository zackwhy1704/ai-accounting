"""Exchange rate endpoints + BNM/MAS auto-fetch service."""
import httpx
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func, or_
from uuid import UUID

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import require_write
from app.core.pagination import PaginationParams, paginated_result, apply_sort
from app.models.models import ExchangeRate, Organization
from app.schemas.schemas import ExchangeRateCreate, ExchangeRateUpdate, ExchangeRateResponse

router = APIRouter(prefix="/exchange-rates", tags=["exchange-rates"])

BNM_FX_URL = "https://api.bnm.gov.my/public/kl-usd-interbank-avg-rate"
BNM_HEADERS = {"Accept": "application/vnd.BNM.API.v1+json"}

MAS_FX_URL = "https://eservices.mas.gov.sg/statistics/api/v1/exchange-rates?end_date={date}&rows=10"


async def _fetch_bnm_rates(org_id: UUID, db: AsyncSession) -> list[ExchangeRate]:
    """Pull latest rates from Bank Negara Malaysia API."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(BNM_FX_URL, headers=BNM_HEADERS)
            resp.raise_for_status()
            data = resp.json().get("data", {})
        rate_value = float(data.get("rate", 0))
        if rate_value <= 0:
            return []
        now = datetime.now(timezone.utc)
        er = ExchangeRate(
            organization_id=org_id,
            from_currency="USD",
            to_currency="MYR",
            rate=rate_value,
            rate_date=now,
            source="bnm",
        )
        db.add(er)
        await db.commit()
        await db.refresh(er)
        return [er]
    except Exception:
        return []


async def _fetch_mas_rates(org_id: UUID, db: AsyncSession) -> list[ExchangeRate]:
    """Pull latest SGD rates from MAS API."""
    try:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        url = MAS_FX_URL.format(date=today)
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            records = resp.json().get("result", {}).get("records", [])
        created = []
        for rec in records:
            usd_sgd = rec.get("usd_sgd")
            if usd_sgd:
                er = ExchangeRate(
                    organization_id=org_id,
                    from_currency="USD",
                    to_currency="SGD",
                    rate=float(usd_sgd),
                    rate_date=datetime.now(timezone.utc),
                    source="mas",
                )
                db.add(er)
                created.append(er)
        if created:
            await db.commit()
        return created
    except Exception:
        return []


@router.get("")
async def list_exchange_rates(
    p: PaginationParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    org_id = current_user["org_id"]
    base = select(ExchangeRate).where(ExchangeRate.organization_id == org_id)
    if p.search:
        like = f"%{p.search}%"
        base = base.where(or_(
            ExchangeRate.from_currency.ilike(like),
            ExchangeRate.to_currency.ilike(like),
        ))
    if p.date_from:
        base = base.where(ExchangeRate.rate_date >= p.date_from)
    if p.date_to:
        base = base.where(ExchangeRate.rate_date <= p.date_to)

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    query = apply_sort(base, ExchangeRate, p, "rate_date").offset(p.offset).limit(p.limit)
    items = (await db.execute(query)).scalars().all()
    items = [ExchangeRateResponse.model_validate(i) for i in items]
    return paginated_result(items, total, p)


@router.post("", response_model=ExchangeRateResponse, status_code=201)
async def create_exchange_rate(
    payload: ExchangeRateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    er = ExchangeRate(
        organization_id=current_user["org_id"],
        **payload.model_dump(),
    )
    db.add(er)
    await db.commit()
    await db.refresh(er)
    return er


@router.post("/sync", response_model=list[ExchangeRateResponse])
async def sync_exchange_rates(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    """Fetch latest rates from BNM (MY) or MAS (SG) based on org country."""
    org_result = await db.execute(
        select(Organization).where(Organization.id == current_user["org_id"])
    )
    org = org_result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    if org.country == "MY":
        return await _fetch_bnm_rates(org.id, db)
    elif org.country == "SG":
        return await _fetch_mas_rates(org.id, db)
    else:
        raise HTTPException(status_code=400, detail="Auto-sync only supported for MY and SG")


@router.get("/latest/{from_currency}/{to_currency}", response_model=ExchangeRateResponse)
async def get_latest_rate(
    from_currency: str,
    to_currency: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(ExchangeRate)
        .where(
            ExchangeRate.organization_id == current_user["org_id"],
            ExchangeRate.from_currency == from_currency.upper(),
            ExchangeRate.to_currency == to_currency.upper(),
        )
        .order_by(desc(ExchangeRate.rate_date))
        .limit(1)
    )
    rate = result.scalar_one_or_none()
    if not rate:
        raise HTTPException(status_code=404, detail="No exchange rate found")
    return rate


async def _get_owned_rate(rate_id: UUID, org_id: UUID, db: AsyncSession) -> ExchangeRate:
    result = await db.execute(
        select(ExchangeRate).where(
            ExchangeRate.id == rate_id,
            ExchangeRate.organization_id == org_id,
        )
    )
    rate = result.scalar_one_or_none()
    if not rate:
        raise HTTPException(status_code=404, detail="Exchange rate not found")
    return rate


@router.get("/{rate_id}", response_model=ExchangeRateResponse)
async def get_exchange_rate(
    rate_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    return await _get_owned_rate(rate_id, current_user["org_id"], db)


@router.patch("/{rate_id}", response_model=ExchangeRateResponse)
async def update_exchange_rate(
    rate_id: UUID,
    payload: ExchangeRateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    rate = await _get_owned_rate(rate_id, current_user["org_id"], db)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(rate, key, value)
    await db.commit()
    await db.refresh(rate)
    return rate


@router.delete("/{rate_id}", status_code=204)
async def delete_exchange_rate(
    rate_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    rate = await _get_owned_rate(rate_id, current_user["org_id"], db)
    await db.delete(rate)
    await db.commit()
