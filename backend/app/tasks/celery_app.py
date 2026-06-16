"""
Celery configuration for async document processing + scheduled jobs.
AWS migration: Replace Redis broker with SQS via celery[sqs].

To run the scheduler in production you need BOTH a worker and a beat process:
    celery -A app.tasks.celery_app worker --loglevel=info
    celery -A app.tasks.celery_app beat   --loglevel=info
"""
from celery import Celery
from celery.schedules import crontab
from app.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "ai_account",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    # Import task modules so @celery_app.task decorators register on the worker.
    include=["app.tasks.document_tasks", "app.tasks.recurring_tasks"],
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

# Scheduled jobs (run by `celery beat`)
celery_app.conf.beat_schedule = {
    "fire-due-recurring-invoices": {
        "task": "app.tasks.recurring_tasks.fire_due_recurring_invoices",
        "schedule": crontab(hour=1, minute=0),  # 01:00 Asia/Singapore daily
    },
}
