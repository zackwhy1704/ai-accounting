import csv
import io
import json
import base64
import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import TaxRate
from app.schemas.schemas import TaxRateCreate, TaxRateUpdate, TaxRateResponse

logger = logging.getLogger(__name__)
ALLOWED_PDF_TYPE = "application/pdf"

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


@router.post("/import-pdf", status_code=200)
async def import_tax_rates_from_pdf(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a PDF and extract tax codes via AI. Returns extracted rows for review before saving."""
    if file.content_type != ALLOWED_PDF_TYPE:
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")

    from app.core.config import get_settings
    settings = get_settings()
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(status_code=503, detail="AI extraction not configured")

    import anthropic
    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY, timeout=90)
    b64 = base64.b64encode(content).decode()

    prompt = """\
Extract ALL tax code / tax rate lines from this document.
Return ONLY a valid JSON array with this structure:
[
  {
    "code": "SST-6",
    "name": "Sales and Service Tax 6%",
    "rate": 6.0,
    "tax_type": "SST",
    "sst_category": null
  }
]

Rules:
- tax_type must be one of: SST, GST, VAT, Service Tax, Withholding, None
- rate is a number (percentage, e.g. 6.0 for 6%)
- sst_category is optional string or null
- Extract every tax code row visible in the document
- Return ONLY the JSON array, no markdown, no explanation"""

    def _repair_truncated_json(raw: str) -> str:
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()
        try:
            json.loads(raw)
            return raw
        except json.JSONDecodeError:
            pass
        last_brace = raw.rfind("}")
        if last_brace != -1:
            raw = raw[:last_brace + 1] + "\n]"
        return raw

    try:
        message = await client.messages.create(
            model=settings.AI_MODEL,
            max_tokens=8000,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "document",
                        "source": {"type": "base64", "media_type": "application/pdf", "data": b64},
                    },
                    {"type": "text", "text": prompt},
                ],
            }],
        )
        raw = message.content[0].text.strip()
        raw = _repair_truncated_json(raw)
        extracted = json.loads(raw)
        if not isinstance(extracted, list):
            raise ValueError("Expected a JSON array")
    except json.JSONDecodeError as e:
        logger.error(f"PDF tax rate import JSON parse failed: {e}")
        raise HTTPException(status_code=422, detail="Failed to parse extracted tax codes. Try a cleaner document.")
    except Exception as e:
        logger.error(f"PDF tax rate import failed: {e}")
        raise HTTPException(status_code=422, detail=f"Failed to extract tax codes from PDF: {e}")

    return {"tax_rates": extracted, "count": len(extracted)}


@router.post("/import-pdf/confirm", response_model=list[TaxRateResponse], status_code=201)
async def confirm_import_tax_rates(
    tax_rates: list[TaxRateCreate],
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save extracted tax rates. Skips duplicates by code."""
    org_id = current_user["org_id"]
    existing_result = await db.execute(
        select(TaxRate.code).where(TaxRate.organization_id == org_id)
    )
    existing_codes = {r for r in existing_result.scalars()}

    created = []
    for item in tax_rates:
        if item.code in existing_codes:
            continue
        tr = TaxRate(organization_id=org_id, **item.model_dump())
        db.add(tr)
        created.append(tr)
        existing_codes.add(item.code)

    await db.flush()
    await db.commit()
    for tr in created:
        await db.refresh(tr)
    return created
