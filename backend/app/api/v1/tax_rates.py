import csv
import io
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import TaxRate
from app.schemas.schemas import TaxRateCreate, TaxRateUpdate, TaxRateResponse

router = APIRouter(prefix="/tax-rates", tags=["tax-rates"])


@router.get("", response_model=list[TaxRateResponse])
async def list_tax_rates(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(TaxRate)
        .where(TaxRate.organization_id == current_user["org_id"])
        .order_by(TaxRate.rate)
    )
    return result.scalars().all()


@router.post("", response_model=TaxRateResponse, status_code=201)
async def create_tax_rate(
    payload: TaxRateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    # Enforce unique code per org
    existing = await db.execute(
        select(TaxRate).where(
            TaxRate.organization_id == current_user["org_id"],
            TaxRate.code == payload.code,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Tax rate code already exists")

    tax_rate = TaxRate(
        organization_id=current_user["org_id"],
        **payload.model_dump(),
    )
    db.add(tax_rate)
    await db.commit()
    await db.refresh(tax_rate)
    return tax_rate


@router.patch("/{tax_rate_id}", response_model=TaxRateResponse)
async def update_tax_rate(
    tax_rate_id: UUID,
    payload: TaxRateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(TaxRate).where(
            TaxRate.id == tax_rate_id,
            TaxRate.organization_id == current_user["org_id"],
        )
    )
    tax_rate = result.scalar_one_or_none()
    if not tax_rate:
        raise HTTPException(status_code=404, detail="Tax rate not found")
    for key, val in payload.model_dump(exclude_unset=True).items():
        setattr(tax_rate, key, val)
    await db.commit()
    await db.refresh(tax_rate)
    return tax_rate


@router.delete("/{tax_rate_id}", status_code=204)
async def delete_tax_rate(
    tax_rate_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(TaxRate).where(
            TaxRate.id == tax_rate_id,
            TaxRate.organization_id == current_user["org_id"],
        )
    )
    tax_rate = result.scalar_one_or_none()
    if not tax_rate:
        raise HTTPException(status_code=404, detail="Tax rate not found")
    await db.delete(tax_rate)
    await db.commit()


@router.post("/upload-csv", response_model=list[TaxRateResponse], status_code=201)
async def upload_tax_rates_csv(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Upload a CSV file with columns: code, name, rate, tax_type, sst_category (optional).
    Skips rows where the code already exists."""
    org_id = current_user["org_id"]
    content = (await file.read()).decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(content))

    created = []
    for row in reader:
        code = (row.get("code") or "").strip()
        name = (row.get("name") or "").strip()
        rate_str = (row.get("rate") or "0").strip()
        if not code or not name:
            continue
        try:
            rate = float(rate_str)
        except ValueError:
            continue

        existing = await db.execute(
            select(TaxRate).where(TaxRate.organization_id == org_id, TaxRate.code == code)
        )
        if existing.scalar_one_or_none():
            continue

        tr = TaxRate(
            organization_id=org_id,
            code=code, name=name, rate=rate,
            tax_type=(row.get("tax_type") or "SST").strip().upper(),
            sst_category=(row.get("sst_category") or "").strip() or None,
        )
        db.add(tr)
        await db.flush()
        created.append(tr)

    await db.commit()
    for tr in created:
        await db.refresh(tr)
    return created
