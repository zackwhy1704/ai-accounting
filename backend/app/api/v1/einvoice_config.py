"""
MyInvois configuration + submission listing + TIN validation endpoints.

Split from einvoice.py (300-line router rule).
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_audit
from app.core.database import get_db
from app.core.permissions import require_admin
from app.core.security import get_current_user
from app.models.models import EInvoiceSubmission, Invoice, Organization
from app.services import einvoice_service as svc

from .einvoice import _org

router = APIRouter(prefix="/einvoice", tags=["e-invoice"])


class TinValidateRequest(BaseModel):
    tin: str
    id_type: str  # NRIC | BRN | PASSPORT | ARMY
    id_value: str


@router.post("/validate-tin")
async def validate_tin(payload: TinValidateRequest, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    org = await _org(db, current_user["org_id"])
    if payload.id_type.upper() not in ("NRIC", "BRN", "PASSPORT", "ARMY"):
        raise HTTPException(status_code=400, detail="id_type must be NRIC, BRN, PASSPORT or ARMY")
    return await svc.validate_tin(org, payload.tin.strip(), payload.id_type.upper(), payload.id_value.strip())


@router.get("/submissions")
async def list_submissions(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Invoices with their latest submission state, plus consolidated submissions."""
    org_id = current_user["org_id"]
    now = datetime.now(timezone.utc)
    invoices = (await db.execute(
        select(Invoice).where(Invoice.organization_id == org_id).order_by(Invoice.issue_date.desc())
    )).scalars().all()
    subs = (await db.execute(
        select(EInvoiceSubmission).where(EInvoiceSubmission.organization_id == org_id)
        .order_by(EInvoiceSubmission.created_at.desc())
    )).scalars().all()
    latest_by_source: dict = {}
    for s in subs:
        key = (s.source_type, s.source_id)
        latest_by_source.setdefault(key, s)

    def row(inv: Invoice | None, s: EInvoiceSubmission | None):
        return {
            "id": str(inv.id) if inv else (str(s.id) if s else None),
            "invoice_no": inv.invoice_number if inv else (s.doc_number if s else None),
            "invoice_date": (inv.issue_date.isoformat() if inv and inv.issue_date else
                             (s.submitted_at.isoformat() if s and s.submitted_at else None)),
            "amount": float(inv.total or 0) if inv else (float(s.total or 0) if s else 0),
            "currency": inv.currency if inv else (s.currency if s else "MYR"),
            "source_type": s.source_type if s else "invoice",
            "submission_id": str(s.id) if s else None,
            "submission_status": s.status if s else "pending",
            "uuid": s.document_uuid if s else None,
            "long_id": s.long_id if s else None,
            "validation_link": s.validation_link if s else None,
            "submission_date": s.submitted_at.isoformat() if s and s.submitted_at else None,
            "validation_status": s.status if s and s.status in ("valid", "invalid") else None,
            "rejection_reason": s.status_reason if s else None,
            "can_cancel": s.can_cancel(now) if s else False,
        }

    out = [row(inv, latest_by_source.get(("invoice", inv.id))) for inv in invoices]
    out += [row(None, s) for (st, _), s in latest_by_source.items() if st == "consolidated"]
    return out


@router.get("/config")
async def get_config(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    org = (await db.execute(select(Organization).where(Organization.id == current_user["org_id"]))).scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Org not found")
    return {
        "einvoice_enabled": org.einvoice_enabled, "einvoice_supplier_tin": org.einvoice_supplier_tin,
        "einvoice_sandbox": org.einvoice_sandbox, "tax_regime": org.tax_regime, "country": org.country,
        "brn": org.brn, "msic_code": org.msic_code, "msic_description": org.msic_description,
        "einvoice_phone": org.einvoice_phone, "einvoice_email": org.einvoice_email,
        "einvoice_address_line1": org.einvoice_address_line1, "einvoice_city": org.einvoice_city,
        "einvoice_postcode": org.einvoice_postcode, "einvoice_state_code": org.einvoice_state_code,
    }


class ConfigUpdate(BaseModel):
    einvoice_enabled: bool | None = None
    einvoice_supplier_tin: str | None = None
    einvoice_sandbox: bool | None = None
    brn: str | None = None
    msic_code: str | None = None
    msic_description: str | None = None
    einvoice_phone: str | None = None
    einvoice_email: str | None = None
    einvoice_address_line1: str | None = None
    einvoice_city: str | None = None
    einvoice_postcode: str | None = None
    einvoice_state_code: str | None = None


@router.put("/config")
async def update_config(payload: ConfigUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_admin())):
    org = (await db.execute(select(Organization).where(Organization.id == current_user["org_id"]))).scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Org not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(org, field, value)
    await db.commit()
    await log_audit(db, org.id, current_user["sub"], "update", "organization", org.id, {"section": "einvoice_config"})
    return await get_config(db, current_user)
