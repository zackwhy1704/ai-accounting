import json
import base64
import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import Account
from app.schemas.schemas import AccountCreate, AccountUpdate, AccountResponse

router = APIRouter(prefix="/accounts", tags=["Chart of Accounts"])
logger = logging.getLogger(__name__)

ALLOWED_PDF_TYPE = "application/pdf"


@router.get("", response_model=list[AccountResponse])
async def list_accounts(
    type: str | None = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Account).where(
        Account.organization_id == current_user["org_id"],
        Account.is_active.is_(True),
    ).order_by(Account.code)
    if type:
        query = query.where(Account.type == type)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{account_id}", response_model=AccountResponse)
async def get_account(
    account_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Account).where(
            Account.id == account_id,
            Account.organization_id == current_user["org_id"],
        )
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


@router.post("", response_model=AccountResponse, status_code=201)
async def create_account(
    data: AccountCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        select(Account).where(
            Account.organization_id == current_user["org_id"],
            Account.code == data.code,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Account code {data.code} already exists")

    account = Account(organization_id=current_user["org_id"], **data.model_dump())
    db.add(account)
    await db.flush()
    return account


@router.patch("/{account_id}", response_model=AccountResponse)
async def update_account(
    account_id: UUID,
    data: AccountUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Account).where(
            Account.id == account_id,
            Account.organization_id == current_user["org_id"],
        )
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # Check code uniqueness if changing code
    if data.code and data.code != account.code:
        clash = await db.execute(
            select(Account).where(
                Account.organization_id == current_user["org_id"],
                Account.code == data.code,
                Account.id != account_id,
            )
        )
        if clash.scalar_one_or_none():
            raise HTTPException(status_code=400, detail=f"Account code {data.code} already exists")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(account, field, value)

    await db.commit()
    await db.refresh(account)
    return account


@router.delete("/{account_id}", status_code=204)
async def delete_account(
    account_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Account).where(
            Account.id == account_id,
            Account.organization_id == current_user["org_id"],
        )
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    if account.is_system:
        raise HTTPException(status_code=400, detail="System accounts cannot be deleted")
    account.is_active = False
    await db.commit()


@router.post("/import-pdf", status_code=200)
async def import_accounts_from_pdf(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a PDF chart of accounts and extract account lines via AI.
    Returns a list of extracted accounts for user review before saving."""
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
Extract ALL account lines from this chart of accounts document.
Return ONLY valid JSON array with this structure:
[
  {
    "code": "1000",
    "name": "Cash at Bank",
    "type": "asset",
    "subtype": "bank",
    "description": "optional description or null"
  }
]

Rules:
- type must be one of: asset, liability, equity, revenue, expense
- subtype is optional (e.g. bank, current, fixed, operating, cogs, owner, retained)
- Extract every account row visible in the document
- If a field is missing use null
- Return ONLY the JSON array, no markdown, no explanation"""

    def _repair_truncated_json(raw: str) -> str:
        """Best-effort repair of a JSON array truncated mid-response."""
        raw = raw.strip()
        # Strip markdown fences
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()
        # If it already parses, return as-is
        try:
            json.loads(raw)
            return raw
        except json.JSONDecodeError:
            pass
        # Truncate to last complete object: find last '}' and close the array
        last_brace = raw.rfind("}")
        if last_brace != -1:
            raw = raw[:last_brace + 1] + "\n]"
        return raw

    try:
        message = await client.messages.create(
            model=settings.AI_MODEL,
            max_tokens=16000,  # maximise to reduce truncation risk
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
        logger.error(f"PDF account import JSON parse failed: {e}")
        raise HTTPException(
            status_code=422,
            detail="The document is too large to extract in one pass. Try splitting it into smaller sections (e.g. Assets only, then Liabilities, etc.) and import each separately."
        )
    except Exception as e:
        logger.error(f"PDF account import failed: {e}")
        raise HTTPException(status_code=422, detail=f"Failed to extract accounts from PDF: {e}")

    return {"accounts": extracted, "count": len(extracted)}


@router.post("/import-pdf/confirm", response_model=list[AccountResponse], status_code=201)
async def confirm_import_accounts(
    accounts: list[AccountCreate],
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save a list of accounts extracted from PDF. Skips duplicates by code."""
    org_id = current_user["org_id"]
    existing_result = await db.execute(
        select(Account.code).where(Account.organization_id == org_id)
    )
    existing_codes = {r for r in existing_result.scalars()}

    created = []
    for item in accounts:
        if item.code in existing_codes:
            continue  # skip duplicates
        account = Account(organization_id=org_id, **item.model_dump())
        db.add(account)
        created.append(account)
        existing_codes.add(item.code)

    await db.flush()
    await db.commit()
    for a in created:
        await db.refresh(a)
    return created
