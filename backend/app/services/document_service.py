"""
Document processing service using Azure Document Intelligence.
AWS-migratable: swap Azure client for AWS Textract with same interface.
"""
import os
import uuid
import aiofiles
from pathlib import Path
from azure.ai.formrecognizer import DocumentAnalysisClient
from azure.core.credentials import AzureKeyCredential
from app.core.config import get_settings

settings = get_settings()


class DocumentProcessor:
    """Processes documents using Azure Document Intelligence (Form Recognizer).

    Migration path to AWS:
    - Replace DocumentAnalysisClient with boto3 textract client
    - AnalyzeExpense maps to Azure's prebuilt-invoice model
    - AnalyzeDocument maps to prebuilt-document model
    """

    def __init__(self):
        self._client = None

    @property
    def client(self) -> DocumentAnalysisClient:
        if self._client is None and settings.AZURE_FORM_RECOGNIZER_ENDPOINT:
            self._client = DocumentAnalysisClient(
                endpoint=settings.AZURE_FORM_RECOGNIZER_ENDPOINT,
                credential=AzureKeyCredential(settings.AZURE_FORM_RECOGNIZER_KEY),
            )
        return self._client

    async def process_invoice(self, file_content: bytes) -> dict:
        """Extract structured data from an invoice/receipt using Azure prebuilt-invoice model."""
        if not self.client:
            # Return mock data when Azure is not configured
            return self._mock_extraction()

        poller = self.client.begin_analyze_document("prebuilt-invoice", file_content)
        result = poller.result()

        extracted = {
            "vendor_name": None,
            "vendor_address": None,
            "invoice_number": None,
            "invoice_date": None,
            "due_date": None,
            "subtotal": None,
            "tax_amount": None,
            "total": None,
            "currency": None,
            "line_items": [],
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

    async def process_receipt(self, file_content: bytes) -> dict:
        """Extract data from a receipt using Azure prebuilt-receipt model."""
        if not self.client:
            return self._mock_extraction()

        poller = self.client.begin_analyze_document("prebuilt-receipt", file_content)
        result = poller.result()

        extracted = {
            "merchant_name": None,
            "transaction_date": None,
            "total": None,
            "subtotal": None,
            "tax": None,
            "items": [],
        }

        for doc in result.documents:
            fields = doc.fields
            if fields.get("MerchantName"):
                extracted["merchant_name"] = fields["MerchantName"].value
            if fields.get("TransactionDate"):
                extracted["transaction_date"] = str(fields["TransactionDate"].value)
            if fields.get("Total"):
                extracted["total"] = fields["Total"].value
            if fields.get("Subtotal"):
                extracted["subtotal"] = fields["Subtotal"].value
            if fields.get("TotalTax"):
                extracted["tax"] = fields["TotalTax"].value

        return extracted

    def _mock_extraction(self) -> dict:
        """Mock extraction for development without Azure credentials."""
        return {
            "vendor_name": "Sample Vendor Pte Ltd",
            "invoice_number": f"INV-{uuid.uuid4().hex[:6].upper()}",
            "invoice_date": "2026-03-24",
            "due_date": "2026-04-23",
            "subtotal": 1000.00,
            "tax_amount": 90.00,
            "total": 1090.00,
            "currency": "SGD",
            "line_items": [
                {"description": "Professional Services", "quantity": 1, "unit_price": 1000.00, "amount": 1000.00}
            ],
            "_mock": True,
        }


class StorageService:
    """File storage abstraction. Supports local and S3-compatible storage.

    AWS migration: Just change STORAGE_BACKEND to "s3" and configure S3 credentials.
    """

    def __init__(self):
        self.backend = settings.STORAGE_BACKEND

    async def upload_file(self, file_content: bytes, filename: str, content_type: str) -> str:
        """Upload file and return URL/path."""
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
            "s3",
            region_name=settings.S3_REGION,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
            endpoint_url=settings.S3_ENDPOINT_URL or None,
        )

        key = f"documents/{uuid.uuid4().hex}/{filename}"
        s3_client.put_object(
            Bucket=settings.S3_BUCKET_NAME,
            Key=key,
            Body=file_content,
            ContentType=content_type,
        )

        if settings.S3_ENDPOINT_URL:
            return f"{settings.S3_ENDPOINT_URL}/{settings.S3_BUCKET_NAME}/{key}"
        return f"https://{settings.S3_BUCKET_NAME}.s3.{settings.S3_REGION}.amazonaws.com/{key}"

    async def delete_file(self, file_url: str) -> None:
        if self.backend == "s3":
            # Parse key from URL and delete from S3
            pass
        else:
            path = Path(file_url)
            if path.exists():
                path.unlink()


document_processor = DocumentProcessor()
storage_service = StorageService()
