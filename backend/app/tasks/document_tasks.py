"""
Async document processing tasks.
Phase 2: Documents are processed asynchronously via Celery workers.
"""
import asyncio
from app.tasks.celery_app import celery_app
from app.services.document_service import document_processor


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def process_document_task(self, document_id: str, file_path: str, file_type: str):
    """Process a document asynchronously using Azure Document Intelligence.

    1. Read file from storage
    2. Send to Azure for OCR/extraction
    3. Update document record with extracted data
    4. Notify user via WebSocket/email
    """
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        with open(file_path, "rb") as f:
            file_content = f.read()

        # Determine processing model based on file type hint
        if "invoice" in file_path.lower() or file_type in ("application/pdf",):
            result = loop.run_until_complete(
                document_processor.process_invoice(file_content)
            )
        else:
            result = loop.run_until_complete(
                document_processor.process_receipt(file_content)
            )

        loop.close()

        # TODO: Update document record in DB with extracted data
        # This would be done via a direct DB connection or API call

        return {
            "document_id": document_id,
            "status": "processed",
            "extracted_data": result,
        }

    except Exception as exc:
        # Retry with exponential backoff
        raise self.retry(exc=exc)
