"""
Audit trail read API. Every mutation writes AuditLog rows (core/audit.py);
this exposes them — filterable, paginated, admin-only.
"""
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.pagination import PaginationParams, paginated_result
from app.core.permissions import require_admin
from app.models.models import AuditLog, User

router = APIRouter(prefix="/audit-logs", tags=["audit-logs"])


@router.get("")
async def list_audit_logs(
    entity_type: str | None = None,
    entity_id: UUID | None = None,
    user_id: UUID | None = None,
    action: str | None = None,
    p: PaginationParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_admin()),
):
    org_id = current_user["org_id"]
    base = select(AuditLog).where(AuditLog.organization_id == org_id)
    if entity_type:
        base = base.where(AuditLog.entity_type == entity_type)
    if entity_id:
        base = base.where(AuditLog.entity_id == entity_id)
    if user_id:
        base = base.where(AuditLog.user_id == user_id)
    if action:
        base = base.where(AuditLog.action == action)
    if p.date_from:
        base = base.where(AuditLog.created_at >= p.date_from)
    if p.date_to:
        base = base.where(AuditLog.created_at <= p.date_to)

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    rows = (await db.execute(
        base.order_by(AuditLog.created_at.desc()).offset(p.offset).limit(p.limit)
    )).scalars().all()

    user_ids = {r.user_id for r in rows if r.user_id}
    users = {u.id: u for u in (await db.execute(
        select(User).where(User.id.in_(user_ids))
    )).scalars().all()} if user_ids else {}

    items = [{
        "id": str(r.id),
        "action": r.action,
        "entity_type": r.entity_type,
        "entity_id": str(r.entity_id) if r.entity_id else None,
        "changes": r.changes,
        "user_id": str(r.user_id) if r.user_id else None,
        "user_email": users[r.user_id].email if r.user_id in users else None,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    } for r in rows]
    return paginated_result(items, total, p)
