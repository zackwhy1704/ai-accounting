from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    APP_NAME: str = "AI Account"
    DEBUG: bool = True
    API_V1_PREFIX: str = "/api/v1"
    SECRET_KEY: str = "change-me-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    ALGORITHM: str = "HS256"

    # Database - AWS-migratable (works with RDS PostgreSQL)
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/ai_account"

    # Storage - S3-compatible (works with AWS S3, Supabase Storage, MinIO)
    STORAGE_BACKEND: str = "local"  # "local", "s3"
    S3_BUCKET_NAME: str = "ai-account-documents"
    S3_REGION: str = "ap-southeast-1"
    S3_ACCESS_KEY: str = ""
    S3_SECRET_KEY: str = ""
    S3_ENDPOINT_URL: str = ""  # For MinIO/Supabase, leave empty for AWS
    LOCAL_STORAGE_PATH: str = "./uploads"

    # Azure Document Intelligence (OCR)
    AZURE_FORM_RECOGNIZER_ENDPOINT: str = ""
    AZURE_FORM_RECOGNIZER_KEY: str = ""

    # Anthropic Claude (Vision OCR fallback)
    ANTHROPIC_API_KEY: str = ""
    AI_MODEL: str = "claude-haiku-4-5-20251001"

    # Stripe
    STRIPE_SECRET_KEY: str = ""
    STRIPE_PUBLISHABLE_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""

    # Celery (async task queue) - uses Redis, migratable to SQS
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/0"

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    model_config = {"env_file": ".env", "extra": "ignore"}


@lru_cache()
def get_settings() -> Settings:
    return Settings()
