"""
Purchase requisitions — internal request-to-buy workflow:
draft → submitted → approved (admin) → converted to a draft Purchase Order.
"""
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_audit
from app.core.database import get_db
from app.core.pagination import PaginationParams, paginated_result, apply_sort
from app.core.permissions import require_admin, require_write
from app.core.security import get_current_user
from app.core.sequences import next_sequence_number
from app.models.models import PurchaseOrder, PurchaseOrderLineItem, PurchaseRequisition

router = APIRouter(prefix="/purchase-requisitions", tags=["purchase-requisitions"])


class RequisitionCreate(BaseModel):
    needed_by: datetime | None = None
    notes: str | None = None
    lines: list[dict]  # {product_id?, description, quantity, est_unit_price?}


class RequisitionUpdate(BaseModel):
    needed_by: datetime | None = None
    notes: str | None = None
    lines: list[dict] | None = None


def _dict(r: PurchaseRequisition) -> dict:
    return {
        "id": str(r.id), "requisition_number": r.requisition_number, "status": r.status,
        "request_date": r.request_date.isoformat() if r.request_date else None,
        "needed_by": r.needed_by.isoformat() if r.needed_by else None,
        "requested_by": str(r.requested_by) if r.requested_by else None,
        "approved_by": str(r.approved_by) if r.approved_by else None,
        "approved_at": r.approved_at.isoformat() if r.approved_at else None,
        "rejection_reason": r.rejection_reason, "notes": r.notes, "lines": r.lines,
        "purchase_order_id": str(r.purchase_order_id) if r.purchase_order_id else None,
    }


def _validate_lines(lines: list[dict]) -> None:
    if not lines:
        raise HTTPException(status_code=422, detail="At least one line is required")
    for l in lines:
        if not (l.get("description") or "").strip():
            raise HTTPException(status_code=422, detail="Every line needs a description")
        if float(l.get("quantity") or 0) <= 0:
            raise HTTPException(status_code=422, detail="Line quantities must be positive")


@router.get("")
async def list_requisitions(
    status: str | None = None,
    p: PaginationParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    org_id = current_user["org_id"]
    base = select(PurchaseRequisition).where(PurchaseRequisition.organization_id == org_id)
    if status:
        base = base.where(PurchaseRequisition.status == status)
    if p.search:
        base = base.where(or_(
            PurchaseRequisition.requisition_number.ilike(f"%{p.search}%"),
            PurchaseRequisition.notes.ilike(f"%{p.search}%"),
        ))
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    rows = (await db.execute(
        apply_sort(base, PurchaseRequisition, p, "request_date").offset(p.offset).limit(p.limit)
    )).scalars().all()
    return paginated_result([_dict(r) for r in rows], total, p)


@router.post("", status_code=201)
async def create_requisition(payload: RequisitionCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_write())):
    _validate_lines(payload.lines)
    org_id = current_user["org_id"]
    req = PurchaseRequisition(
        organization_id=org_id,
        requisition_number=await next_sequence_number(
            db, PurchaseRequisition, PurchaseRequisition.requisition_number, org_id, "PR"),
        needed_by=payload.needed_by, notes=payload.notes, lines=payload.lines,
        requested_by=current_user["sub"], request_date=datetime.now(timezone.utc),
    )
    db.add(req)
    await db.commit()
    await log_audit(db, org_id, current_user["sub"], "create", "purchase_requisition", req.id)
    return _dict(req)


async def _load(db: AsyncSession, req_id: UUID, org_id) -> PurchaseRequisition:
    req = (await db.execute(
        select(PurchaseRequisition).where(
            PurchaseRequisition.id == req_id, PurchaseRequisition.organization_id == org_id
        )
    )).scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Requisition not found")
    return req


@router.get("/{req_id}")
async def get_requisition(req_id: UUID, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    return _dict(await _load(db, req_id, current_user["org_id"]))


@router.patch("/{req_id}")
async def update_requisition(req_id: UUID, payload: RequisitionUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_write())):
    req = await _load(db, req_id, current_user["org_id"])
    if req.status not in ("draft", "submitted"):
        raise HTTPException(status_code=400, detail=f"Cannot edit a {req.status} requisition")
    data = payload.model_dump(exclude_unset=True)
    if "lines" in data:
        _validate_lines(data["lines"])
    for k, v in data.items():
        setattr(req, k, v)
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "update", "purchase_requisition", req_id)
    return _dict(req)


@router.post("/{req_id}/submit")
async def submit_requisition(req_id: UUID, db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_write())):
    req = await _load(db, req_id, current_user["org_id"])
    if req.status != "draft":
        raise HTTPException(status_code=400, detail=f"Only draft requisitions can be submitted (currently {req.status})")
    req.status = "submitted"
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "submit", "purchase_requisition", req_id)
    return _dict(req)


@router.post("/{req_id}/approve")
async def approve_requisition(req_id: UUID, db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_admin())):
    req = await _load(db, req_id, current_user["org_id"])
    if req.status != "submitted":
        raise HTTPException(status_code=400, detail=f"Only submitted requisitions can be approved (currently {req.status})")
    req.status = "approved"
    req.approved_by = current_user["sub"]
    req.approved_at = datetime.now(timezone.utc)
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "approve", "purchase_requisition", req_id)
    return _dict(req)


@router.post("/{req_id}/reject")
async def reject_requisition(
    req_id: UUID,
    reason: str = Body("", embed=True),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_admin()),
):
    req = await _load(db, req_id, current_user["org_id"])
    if req.status != "submitted":
        raise HTTPException(status_code=400, detail=f"Only submitted requisitions can be rejected (currently {req.status})")
    req.status = "rejected"
    req.rejection_reason = (reason or "")[:500] or None
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "reject", "purchase_requisition", req_id)
    return _dict(req)


class ConvertRequest(BaseModel):
    contact_id: UUID  # the chosen vendor


@router.post("/{req_id}/convert")
async def convert_to_po(req_id: UUID, payload: ConvertRequest, db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_write())):
    """Approved requisition → draft Purchase Order for the chosen vendor."""
    org_id = current_user["org_id"]
    req = await _load(db, req_id, org_id)
    if req.status != "approved":
        raise HTTPException(status_code=400, detail=f"Only approved requisitions can be converted (currently {req.status})")

    subtotal = round(sum(float(l.get("quantity") or 0) * float(l.get("est_unit_price") or 0) for l in (req.lines or [])), 2)
    po = PurchaseOrder(
        organization_id=org_id, contact_id=payload.contact_id,
        po_number=await next_sequence_number(db, PurchaseOrder, PurchaseOrder.po_number, org_id, "PO"),
        issue_date=datetime.now(timezone.utc), expected_date=req.needed_by,
        subtotal=subtotal, total=subtotal,
        notes=f"From requisition {req.requisition_number}" + (f" — {req.notes}" if req.notes else ""),
    )
    db.add(po)
    await db.flush()
    for i, l in enumerate(req.lines or []):
        db.add(PurchaseOrderLineItem(
            purchase_order_id=po.id, description=l.get("description") or "",
            quantity=float(l.get("quantity") or 0), unit_price=float(l.get("est_unit_price") or 0),
            amount=round(float(l.get("quantity") or 0) * float(l.get("est_unit_price") or 0), 2),
        ))
    req.status = "converted"
    req.purchase_order_id = po.id
    await db.commit()
    await log_audit(db, org_id, current_user["sub"], "convert", "purchase_requisition", req_id, {"purchase_order_id": str(po.id)})
    return {"requisition_id": str(req_id), "purchase_order_id": str(po.id), "po_number": po.po_number}
