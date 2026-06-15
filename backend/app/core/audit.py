"""Lightweight audit log writer.

Call log_audit() inside any mutation handler after the DB commit.
Uses fire-and-forget via db.add() so it never blocks the main response.
"""
from __future__ import annotations
from typing import Any
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.settings import AuditLog


async def log_audit(
    db: AsyncSession,
    org_id: Any,
    user_id: Any,
    action: str,          # e.g. "create", "update", "delete", "status_change", "void"
    entity_type: str,     # e.g. "invoice", "bill", "payment", "credit_note"
    entity_id: Any,
    changes: dict | None = None,
) -> None:
    """Write one audit log row. Silently swallows all exceptions so audit
    failures never break the main operation."""
    try:
        import uuid as _uuid
        # Coerce entity_id to UUID if it's a string
        eid = entity_id
        if isinstance(eid, str):
            try:
                eid = _uuid.UUID(eid)
            except Exception:
                eid = None

        entry = AuditLog(
            organization_id=org_id,
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=eid,
            changes=changes or {},
        )
        db.add(entry)
        await db.flush()
    except Exception:
        pass  # Audit failures must never break the main operation
