"""
Document processing service.
Priority: Azure Document Intelligence → Claude Vision API → error.

Enterprise-level handling:
- Async Claude client (non-blocking)
- Per-request timeout (30s)
- Retry with exponential backoff (3 attempts)
- Background processing decoupled from upload
"""
import os
import uuid
import json
import base64
import logging
import asyncio
import aiofiles
from pathlib import Path

from app.core.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

OCR_TIMEOUT = 30  # seconds per API call
OCR_MAX_RETRIES = 2  # retry up to 2 times (3 total attempts)

EXTRACTION_SCHEMA = """\
Extract ALL data from this document image. Return ONLY valid JSON with this structure:
{
  "document_type": "invoice" | "receipt" | "bill" | "credit_note" | "purchase_order" | "bank_statement" | "not_a_document" | "other",
  "confidence": 0.95,
  "vendor_name": "company/person name on the document",
  "vendor_address": "full address if present",
  "invoice_number": "document reference number",
  "invoice_date": "YYYY-MM-DD",
  "due_date": "YYYY-MM-DD or null",
  "subtotal": 0.00,
  "tax_amount": 0.00,
  "total": 0.00,
  "currency": "3-letter code e.g. SGD, MYR, USD",
  "line_items": [
    {
      "description": "item description",
      "quantity": 1.0,
      "unit_price": 0.00,
      "amount": 0.00
    }
  ],
  "notes": "any additional info, payment terms, bank details etc"
}

Rules:
- Extract REAL values from the document. Do NOT invent or guess data.
- "confidence": a float 0.0–1.0 indicating how confident you are this is a financial document (invoice/receipt/bill). Use 0.0 for photos, memes, screenshots, or anything clearly not a financial document. Use 0.1–0.4 for documents that have some text but are not invoices/bills/receipts. Use 0.5+ only for actual financial documents.
- "document_type": use "not_a_document" if the image is not a financial/business document at all (e.g. a photo, screenshot, meme).
- If a field is not present, use null for strings/dates and 0.0 for numbers.
- For line_items, extract every line item visible. If none, return empty array.
- Currency: detect from symbols ($ = USD/SGD based on context, RM = MYR, £ = GBP, € = EUR).
- Dates: always convert to YYYY-MM-DD format.
- Numbers: return as floats without currency symbols or commas.
- Return ONLY the JSON object, no markdown, no explanation."""


def _get_media_type(content_type: str) -> str:
    """Map content type to Claude Vision media type."""
    mapping = {
        "application/pdf": "application/pdf",
        "image/jpeg": "image/jpeg",
        "image/png": "image/png",
        "image/webp": "image/webp",
    }
    return mapping.get(content_type, "image/jpeg")


class DocumentProcessor:
    def __init__(self):
        self._azure_client = None
        self._anthropic_client = None

    @property
    def azure_client(self):
        if self._azure_client is None and settings.AZURE_FORM_RECOGNIZER_ENDPOINT:
            from azure.ai.formrecognizer import DocumentAnalysisClient
            from azure.core.credentials import AzureKeyCredential
            self._azure_client = DocumentAnalysisClient(
                endpoint=settings.AZURE_FORM_RECOGNIZER_ENDPOINT,
                credential=AzureKeyCredential(settings.AZURE_FORM_RECOGNIZER_KEY),
            )
        return self._azure_client

    @property
    def anthropic_client(self):
        """Lazy-init async Anthropic client with connection pooling."""
        if self._anthropic_client is None and settings.ANTHROPIC_API_KEY:
            import anthropic
            self._anthropic_client = anthropic.AsyncAnthropic(
                api_key=settings.ANTHROPIC_API_KEY,
                timeout=OCR_TIMEOUT,
                max_retries=0,  # We handle retries ourselves
            )
        return self._anthropic_client

    async def process_invoice(self, file_content: bytes, content_type: str = "image/jpeg") -> dict:
        """Extract structured data from a document. Tries Azure first, falls back to Claude Vision."""
        # Try Azure first
        if self.azure_client:
            try:
                return await self._process_with_azure(file_content)
            except Exception as e:
                logger.warning(f"Azure OCR failed, falling back to Claude: {e}")

        # Fall back to Claude Vision
        if self.anthropic_client:
            return await self._process_with_claude_retried(file_content, content_type)

        raise RuntimeError(
            "No OCR provider configured. Set ANTHROPIC_API_KEY or AZURE_FORM_RECOGNIZER_ENDPOINT in .env"
        )

    async def _process_with_claude_retried(self, file_content: bytes, content_type: str) -> dict:
        """Retry wrapper with exponential backoff."""
        last_error = None
        for attempt in range(OCR_MAX_RETRIES + 1):
            try:
                return await asyncio.wait_for(
                    self._process_with_claude(file_content, content_type),
                    timeout=OCR_TIMEOUT,
                )
            except asyncio.TimeoutError:
                last_error = TimeoutError(f"OCR timed out after {OCR_TIMEOUT}s (attempt {attempt + 1})")
                logger.warning(f"Claude OCR timeout, attempt {attempt + 1}/{OCR_MAX_RETRIES + 1}")
            except Exception as e:
                last_error = e
                err_str = str(e).lower()
                # Don't retry on auth errors or invalid requests
                if "401" in err_str or "403" in err_str or "invalid" in err_str:
                    raise
                logger.warning(f"Claude OCR error, attempt {attempt + 1}/{OCR_MAX_RETRIES + 1}: {e}")

            if attempt < OCR_MAX_RETRIES:
                wait = 2 ** attempt  # 1s, 2s
                logger.info(f"Retrying OCR in {wait}s...")
                await asyncio.sleep(wait)

        raise RuntimeError(f"OCR failed after {OCR_MAX_RETRIES + 1} attempts: {last_error}")

    async def _process_with_claude(self, file_content: bytes, content_type: str) -> dict:
        """Use async Claude Vision API to extract document data."""
        b64_data = base64.b64encode(file_content).decode("utf-8")
        media_type = _get_media_type(content_type)

        logger.info(f"Sending document to Claude Vision ({media_type}, {len(file_content)} bytes)")

        message = await self.anthropic_client.messages.create(
            model=settings.AI_MODEL,
            max_tokens=4096,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image" if not media_type.endswith("pdf") else "document",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": b64_data,
                            },
                        },
                        {
                            "type": "text",
                            "text": EXTRACTION_SCHEMA,
                        },
                    ],
                }
            ],
        )

        raw = message.content[0].text.strip()
        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()

        try:
            extracted = json.loads(raw)
        except json.JSONDecodeError as e:
            logger.error(f"Claude returned invalid JSON: {raw[:200]}...")
            raise RuntimeError(f"Failed to parse Claude response as JSON: {e}")

        # Normalize the response
        return self._normalize(extracted)

    async def _process_with_azure(self, file_content: bytes) -> dict:
        """Use Azure Document Intelligence to extract invoice data."""
        poller = self.azure_client.begin_analyze_document("prebuilt-invoice", file_content)
        result = poller.result()

        extracted = {
            "vendor_name": None, "vendor_address": None, "invoice_number": None,
            "invoice_date": None, "due_date": None, "subtotal": None,
            "tax_amount": None, "total": None, "currency": None, "line_items": [],
        }

        for doc in result.documents:
            fields = doc.fields
            if fields.get("VendorName"):
                extracted["vendor_name"] = fields["VendorName"].value
            if fields.get("VendorAddress"):
                extracted["vendor_address"] = fields["VendorAddress"].content
            if fields.get("InvoiceId"):
                extracted["invoice_number"] = fields["InvoiceId"].value
            if fields.get("InvoiceDate"):
                extracted["invoice_date"] = str(fields["InvoiceDate"].value)
            if fields.get("DueDate"):
                extracted["due_date"] = str(fields["DueDate"].value)
            if fields.get("SubTotal"):
                extracted["subtotal"] = fields["SubTotal"].value
            if fields.get("TotalTax"):
                extracted["tax_amount"] = fields["TotalTax"].value
            if fields.get("InvoiceTotal"):
                extracted["total"] = fields["InvoiceTotal"].value
            if fields.get("CurrencyCode"):
                extracted["currency"] = fields["CurrencyCode"].value
            if fields.get("Items"):
                for item in fields["Items"].value:
                    item_fields = item.value
                    line = {
                        "description": item_fields.get("Description", {}).value if item_fields.get("Description") else None,
                        "quantity": item_fields.get("Quantity", {}).value if item_fields.get("Quantity") else None,
                        "unit_price": item_fields.get("UnitPrice", {}).value if item_fields.get("UnitPrice") else None,
                        "amount": item_fields.get("Amount", {}).value if item_fields.get("Amount") else None,
                    }
                    extracted["line_items"].append(line)

        return extracted

    def _normalize(self, data: dict) -> dict:
        """Ensure consistent field types."""
        def to_float(v):
            if v is None:
                return 0.0
            try:
                return float(v)
            except (ValueError, TypeError):
                return 0.0

        return {
            "document_type": data.get("document_type", "other"),
            "confidence": to_float(data.get("confidence", 0)),
            "vendor_name": data.get("vendor_name"),
            "vendor_address": data.get("vendor_address"),
            "invoice_number": data.get("invoice_number"),
            "invoice_date": data.get("invoice_date"),
            "due_date": data.get("due_date"),
            "subtotal": to_float(data.get("subtotal")),
            "tax_amount": to_float(data.get("tax_amount")),
            "total": to_float(data.get("total")),
            "currency": data.get("currency", "SGD"),
            "line_items": [
                {
                    "description": item.get("description"),
                    "quantity": to_float(item.get("quantity", 1)),
                    "unit_price": to_float(item.get("unit_price")),
                    "amount": to_float(item.get("amount")),
                }
                for item in (data.get("line_items") or [])
            ],
            "notes": data.get("notes"),
        }


class StorageService:
    """File storage abstraction. Supports local and S3-compatible storage."""

    def __init__(self):
        self.backend = settings.STORAGE_BACKEND

    async def upload_file(self, file_content: bytes, filename: str, content_type: str) -> str:
        if self.backend == "s3":
            return await self._upload_s3(file_content, filename, content_type)
        return await self._upload_local(file_content, filename)

    async def _upload_local(self, file_content: bytes, filename: str) -> str:
        upload_dir = Path(settings.LOCAL_STORAGE_PATH)
        upload_dir.mkdir(parents=True, exist_ok=True)
        unique_name = f"{uuid.uuid4().hex}_{filename}"
        file_path = upload_dir / unique_name
        async with aiofiles.open(file_path, "wb") as f:
            await f.write(file_content)
        return str(file_path)

    async def _upload_s3(self, file_content: bytes, filename: str, content_type: str) -> str:
        import boto3
        s3_client = boto3.client(
            "s3", region_name=settings.S3_REGION,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
            endpoint_url=settings.S3_ENDPOINT_URL or None,
        )
        key = f"documents/{uuid.uuid4().hex}/{filename}"
        s3_client.put_object(
            Bucket=settings.S3_BUCKET_NAME, Key=key,
            Body=file_content, ContentType=content_type,
        )
        if settings.S3_ENDPOINT_URL:
            return f"{settings.S3_ENDPOINT_URL}/{settings.S3_BUCKET_NAME}/{key}"
        return f"https://{settings.S3_BUCKET_NAME}.s3.{settings.S3_REGION}.amazonaws.com/{key}"

    async def delete_file(self, file_url: str) -> None:
        if self.backend == "s3":
            pass
        else:
            path = Path(file_url)
            if path.exists():
                path.unlink()


document_processor = DocumentProcessor()
storage_service = StorageService()
