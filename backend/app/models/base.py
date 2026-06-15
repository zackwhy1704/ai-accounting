import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    String, Text, Numeric, Integer, Boolean, DateTime, ForeignKey,
    Enum as SAEnum, Index, CheckConstraint, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.core.database import Base

# Helpers
def utcnow():
    return datetime.now(timezone.utc)

def new_uuid():
    return uuid.uuid4()
