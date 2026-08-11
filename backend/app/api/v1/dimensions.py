"""
Projects & Departments — GL dimensions (SQL Account-style project/department
accounting). Assign on invoices, bills and manual-journal lines; the dimension
is stamped onto the GL transaction (document level) or journal entry (line
level) and reports filter on coalesce(entry, transaction).
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_audit
from app.core.database import get_db
from app.core.permissions import require_write
from app.core.security import get_current_user
from app.models.models import Department, Project

router = APIRouter(prefix="/dimensions", tags=["dimensions"])

_MODELS = {"projects": Project, "departments": Department}


class DimensionCreate(BaseModel):
    name: str
    code: str | None = None
    description: str | None = None
    is_active: bool = True


class DimensionUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    description: str | None = None
    is_active: bool | None = None


def _model(kind: str):
    model = _MODELS.get(kind)
    if model is None:
        raise HTTPException(status_code=404, detail="Unknown dimension type — use 'projects' or 'departments'")
    return model


def _to_dict(row) -> dict:
    return {"id": str(row.id), "code": row.code, "name": row.name,
            "description": row.description, "is_active": row.is_active}


@router.get("/{kind}")
async def list_dimensions(
    kind: str,
    include_inactive: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    model = _model(kind)
    q = select(model).where(model.organization_id == current_user["org_id"]).order_by(model.name)
    if not include_inactive:
        q = q.where(model.is_active.is_(True))
    rows = (await db.execute(q)).scalars().all()
    return [_to_dict(r) for r in rows]


@router.post("/{kind}", status_code=201)
async def create_dimension(
    kind: str,
    payload: DimensionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    model = _model(kind)
    org_id = current_user["org_id"]
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Name is required")
    dup = (await db.execute(
        select(model.id).where(model.organization_id == org_id, model.name == name)
    )).first()
    if dup:
        raise HTTPException(status_code=409, detail=f"A {kind[:-1]} named '{name}' already exists")
    row = model(organization_id=org_id, name=name, code=payload.code,
                description=payload.description, is_active=payload.is_active)
    db.add(row)
    await db.commit()
    await log_audit(db, org_id, current_user["sub"], "create", kind[:-1], row.id)
    return _to_dict(row)


@router.patch("/{kind}/{dim_id}")
async def update_dimension(
    kind: str,
    dim_id: UUID,
    payload: DimensionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    model = _model(kind)
    row = (await db.execute(
        select(model).where(model.id == dim_id, model.organization_id == current_user["org_id"])
    )).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=f"{kind[:-1].capitalize()} not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "update", kind[:-1], dim_id)
    return _to_dict(row)


@router.delete("/{kind}/{dim_id}", status_code=204)
async def deactivate_dimension(
    kind: str,
    dim_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    """Soft delete: transactions may reference the dimension, so deactivate."""
    model = _model(kind)
    row = (await db.execute(
        select(model).where(model.id == dim_id, model.organization_id == current_user["org_id"])
    )).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=f"{kind[:-1].capitalize()} not found")
    row.is_active = False
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "deactivate", kind[:-1], dim_id)
