from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Any

from app.core.config import get_settings
from app.core.security import get_current_user

router = APIRouter(prefix="/ai", tags=["ai"])
settings = get_settings()


class CategorizeRequest(BaseModel):
    description: str
    amount: float | None = None
    merchant: str | None = None


class CategorizeResponse(BaseModel):
    category: str
    account_code: str | None
    confidence: str
    reason: str


class TaxSuggestRequest(BaseModel):
    description: str
    amount: float | None = None
    country: str = "MY"  # MY | SG


class TaxSuggestResponse(BaseModel):
    tax_code: str
    tax_rate: float
    label: str
    reason: str


class ChatMessage(BaseModel):
    role: str  # user | assistant
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    context: dict[str, Any] | None = None


class ChatResponse(BaseModel):
    reply: str


def _get_client():
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(status_code=503, detail="AI service not configured")
    import anthropic
    return anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)


@router.post("/categorize-transaction", response_model=CategorizeResponse)
async def categorize_transaction(
    payload: CategorizeRequest,
    current_user: dict = Depends(get_current_user),
):
    """AI-powered bank transaction categorization."""
    client = _get_client()

    prompt = f"""You are an accounting assistant. Categorize this bank transaction for double-entry bookkeeping.

Transaction:
- Description: {payload.description}
- Amount: {payload.amount or "unknown"}
- Merchant: {payload.merchant or "unknown"}

Reply with ONLY valid JSON in this exact format:
{{
  "category": "Office Supplies",
  "account_code": "6100",
  "confidence": "high",
  "reason": "brief explanation"
}}

Common account codes: 4000=Revenue, 5000=COGS, 6000=Rent, 6100=Office Supplies, 6200=Utilities, 6300=Travel, 6400=Marketing, 6500=Salaries, 6600=Professional Fees, 6700=Insurance, 6900=Miscellaneous Expenses, 1200=Accounts Receivable, 2000=Accounts Payable"""

    message = await client.messages.create(
        model=settings.AI_MODEL,
        max_tokens=256,
        messages=[{"role": "user", "content": prompt}],
    )

    import json
    raw = message.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()

    try:
        data = json.loads(raw)
        return CategorizeResponse(**data)
    except Exception:
        return CategorizeResponse(
            category="Miscellaneous",
            account_code="6900",
            confidence="low",
            reason="Could not parse AI response",
        )


@router.post("/suggest-tax-code", response_model=TaxSuggestResponse)
async def suggest_tax_code(
    payload: TaxSuggestRequest,
    current_user: dict = Depends(get_current_user),
):
    """Suggest the appropriate tax code for an invoice/bill line item."""
    client = _get_client()

    country_context = (
        "Malaysia SST: SR=6% standard-rated service tax, ZR=zero-rated, OS=out-of-scope, ES43=exempt"
        if payload.country == "MY"
        else "Singapore GST: SR=9% standard-rated, ZR=zero-rated, ES=exempt, OS=out-of-scope"
    )

    prompt = f"""You are a tax compliance assistant for {payload.country}.

{country_context}

Item: {payload.description}
Amount: {payload.amount or "unknown"}

Reply with ONLY valid JSON:
{{
  "tax_code": "SR",
  "tax_rate": 9.0,
  "label": "Standard Rated",
  "reason": "brief explanation"
}}"""

    message = await client.messages.create(
        model=settings.AI_MODEL,
        max_tokens=200,
        messages=[{"role": "user", "content": prompt}],
    )

    import json
    raw = message.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()

    try:
        data = json.loads(raw)
        return TaxSuggestResponse(**data)
    except Exception:
        default_rate = 6.0 if payload.country == "MY" else 9.0
        return TaxSuggestResponse(
            tax_code="SR",
            tax_rate=default_rate,
            label="Standard Rated",
            reason="Default suggestion",
        )


@router.post("/chat", response_model=ChatResponse)
async def accounting_chat(
    payload: ChatRequest,
    current_user: dict = Depends(get_current_user),
):
    """Accounting AI chat assistant."""
    client = _get_client()

    system = """You are an expert accounting assistant for acculy.io, an AI-powered cloud accounting platform.
You help users with:
- Understanding accounting concepts (double-entry, debits/credits, chart of accounts)
- Malaysia SST compliance, MyInvois/LHDN e-invoice requirements
- Singapore GST compliance, IRAS filing
- Invoice and bill management best practices
- Financial reporting and analysis
Keep answers concise and practical. When unsure, say so."""

    messages = [{"role": m.role, "content": m.content} for m in payload.messages]

    message = await client.messages.create(
        model=settings.AI_MODEL,
        max_tokens=1024,
        system=system,
        messages=messages,
    )

    return ChatResponse(reply=message.content[0].text)
