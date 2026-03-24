"""
Celery configuration for async document processing.
AWS migration: Replace Redis broker with SQS via celery[sqs].
"""
from celery import Celery
from app.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "ai_account",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Singapore",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,  # Retry on worker crash
    worker_prefetch_multiplier=1,  # Fair scheduling
    # AWS SQS migration: uncomment below
    # broker_url = "sqs://"
    # broker_transport_options = {
    #     "region": "ap-southeast-1",
    #     "queue_name_prefix": "ai-account-",
    # }
)
