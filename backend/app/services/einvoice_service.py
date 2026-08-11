"""
LHDN MyInvois client + submission orchestration.

The router (api/v1/einvoice.py) stays thin: it loads the source document and
calls submit_document() here. This module owns:
  - OAuth token acquisition (client-credentials, cached per org until expiry)
  - the HTTP calls (submit / status / cancel / TIN validation)
  - EInvoiceSubmission row lifecycle (pending → submitted → valid/invalid/cancelled)
  - resolving ORM objects into the plain dicts the UBL builder consumes

Requires LHDN_CLIENT_ID / LHDN_CLIENT_SECRET (MyInvois portal) to reach LHDN;
without them every network call raises a clear 503 and nothing is persisted.
"""
import time
from datetime import datetime, timezone

import httpx
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Contact, EInvoiceSubmission, Organization, TaxRate
from app.services import einvoice_ubl as ubl

SANDBOX_BASE = "https://preprod.api.myinvois.hasil.gov.my"
PROD_BASE = "https://api.myinvois.hasil.gov.my"

# org_id -> (token, expiry_epoch). LHDN tokens last ~60 min; refresh 60s early.
_token_cache: dict[str, tuple[str, float]] = {}


def base_url(org: Organization) -> str:
    return SANDBOX_BASE if org.einvoice_sandbox else PROD_BASE


def require_einvoice_org(org: Organization | None) -> Organization:
    if not org or not org.einvoice_enabled:
        raise HTTPException(status_code=400, detail="e-Invoice not enabled for this organization")
    if org.country != "MY":
        raise HTTPException(status_code=400, detail="MyInvois is only for Malaysian organizations")
    return org


async def get_token(org: Organization) -> str:
    from app.core.config import get_settings
    settings = get_settings()

    if not org.einvoice_supplier_tin:
        raise HTTPException(status_code=400, detail="LHDN Supplier TIN not configured")
    client_id = settings.LHDN_CLIENT_ID or org.einvoice_supplier_tin
    client_secret = settings.LHDN_CLIENT_SECRET
    if not client_secret:
        raise HTTPException(
            status_code=503,
            detail=("MyInvois submission is not yet configured. Set LHDN_CLIENT_ID and "
                    "LHDN_CLIENT_SECRET (from the LHDN MyInvois developer portal) to enable "
                    "e-Invoice submission."),
        )

    cached = _token_cache.get(str(org.id))
    if cached and cached[1] > time.time():
        return cached[0]

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(f"{base_url(org)}/connect/token", data={
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
            "scope": "InvoicingAPI",
        })
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"LHDN auth failed: {resp.text}")
    body = resp.json()
    token = body["access_token"]
    _token_cache[str(org.id)] = (token, time.time() + int(body.get("expires_in", 3600)) - 60)
    return token


async def _lhdn_request(org: Organization, method: str, path: str, **kwargs):
    token = await get_token(org)
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.request(
            method, f"{base_url(org)}{path}",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            **kwargs,
        )
    return resp


# ── ORM → UBL dict resolvers ──────────────────────────────────────────────────

def supplier_dict(org: Organization) -> dict:
    return {
        "name": org.name,
        "tin": org.einvoice_supplier_tin,
        "brn": org.brn or org.uen,
        "sst_no": org.sst_registration_no,
        "msic_code": org.msic_code,
        "msic_description": org.msic_description,
        "phone": org.einvoice_phone,
        "email": org.einvoice_email,
        "address_line1": org.einvoice_address_line1 or org.address,
        "city": org.einvoice_city,
        "postcode": org.einvoice_postcode,
        "state_code": org.einvoice_state_code or "17",
        "country": "MYS",
    }


def buyer_dict(contact: Contact | None) -> dict:
    if contact is None:
        return dict(ubl.CONSOLIDATED_BUYER)
    return {
        "name": contact.name,
        "tin": contact.tin,
        "brn": contact.brn,
        "ic": contact.ic_number,
        "phone": contact.phone,
        "email": contact.email,
        "address_line1": contact.billing_address_line1,
        "city": contact.billing_city,
        "postcode": contact.billing_postcode,
        "state_code": ubl.state_code(contact.billing_state),
        "country": "MYS",
    }


async def resolve_lines(db: AsyncSession, org_id, line_items) -> list[dict]:
    """ORM/JSONB line items → UBL line dicts, resolving SST category per tax code."""
    def g(li, key, default=None):
        return li.get(key, default) if isinstance(li, dict) else getattr(li, key, default)

    code_ids = {g(li, "tax_code_id") for li in line_items if g(li, "tax_code_id")}
    sst_by_id: dict = {}
    if code_ids:
        rows = (await db.execute(
            select(TaxRate.id, TaxRate.sst_category).where(TaxRate.organization_id == org_id, TaxRate.id.in_(code_ids))
        )).all()
        sst_by_id = {r[0]: r[1] for r in rows}

    lines = []
    for li in line_items:
        net = float(g(li, "amount") or 0)
        tax_rate = float(g(li, "tax_rate") or 0)
        lines.append({
            "description": g(li, "description") or "Item",
            "quantity": float(g(li, "quantity") or 1),
            "unit_price": float(g(li, "unit_price") or 0),
            "amount": net,
            "tax_rate": tax_rate,
            "tax_amount": round(net * tax_rate / 100, 2),
            "sst_category": sst_by_id.get(g(li, "tax_code_id")),
        })
    return lines


# ── Submission lifecycle ──────────────────────────────────────────────────────

async def submit_document(
    db: AsyncSession,
    org: Organization,
    *,
    source_type: str,
    source_id,
    doc_type_code: str,
    number: str,
    issue_datetime: datetime,
    currency: str,
    exchange_rate: float,
    buyer: dict,
    lines: list[dict],
    subtotal: float,
    tax_amount: float,
    total: float,
    billing_reference: dict | None = None,
    classification: str = ubl.DEFAULT_ITEM_CLASSIFICATION,
) -> EInvoiceSubmission:
    """Build the UBL doc, create the tracking row, submit to LHDN, record result.

    The tracking row is only added to the session AFTER LHDN answers (accepted or
    rejected), so an auth/network failure raises without leaving orphan rows.
    """
    ubl_doc = ubl.build_document(
        doc_type_code=doc_type_code, number=number, issue_datetime=issue_datetime,
        currency=currency, exchange_rate=exchange_rate,
        supplier=supplier_dict(org), buyer=buyer, lines=lines,
        subtotal=subtotal, tax_amount=tax_amount, total=total,
        billing_reference=billing_reference, classification=classification,
    )
    envelope_entry = ubl.encode_for_submission(ubl_doc, number)

    resp = await _lhdn_request(org, "POST", "/api/v1.0/documentsubmissions", json={"documents": [envelope_entry]})
    if resp.status_code not in (200, 202):
        raise HTTPException(status_code=502, detail=f"LHDN submission failed: {resp.text}")
    result = resp.json()

    now = datetime.now(timezone.utc)
    sub = EInvoiceSubmission(
        organization_id=org.id, source_type=source_type, source_id=source_id,
        doc_type_code=doc_type_code, doc_number=number, total=total, currency=currency,
        document_hash=envelope_entry["documentHash"], sandbox=org.einvoice_sandbox,
        submission_uid=result.get("submissionUid"), submitted_at=now, raw_response=result,
    )
    accepted = result.get("acceptedDocuments") or []
    rejected = result.get("rejectedDocuments") or []
    if accepted:
        sub.status = "submitted"
        sub.document_uuid = accepted[0].get("uuid")
    elif rejected:
        sub.status = "invalid"
        err = rejected[0].get("error") or {}
        sub.status_reason = err.get("errorMS") or err.get("error") or str(err)
    db.add(sub)
    return sub


async def refresh_submission_status(db: AsyncSession, org: Organization, submission_uid: str) -> dict:
    """Poll LHDN for a submission and sync our tracking rows from the answer."""
    resp = await _lhdn_request(org, "GET", f"/api/v1.0/documentsubmissions/{submission_uid}")
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"LHDN status check failed: {resp.text}")
    body = resp.json()

    summaries = body.get("documentSummary") or []
    if summaries:
        rows = (await db.execute(
            select(EInvoiceSubmission).where(
                EInvoiceSubmission.organization_id == org.id,
                EInvoiceSubmission.submission_uid == submission_uid,
            )
        )).scalars().all()
        by_uuid = {r.document_uuid: r for r in rows if r.document_uuid}
        by_number = {r.doc_number: r for r in rows}
        for s in summaries:
            row = by_uuid.get(s.get("uuid")) or by_number.get(s.get("internalId"))
            if row is None:
                continue
            row.document_uuid = s.get("uuid") or row.document_uuid
            row.long_id = s.get("longId") or row.long_id
            lhdn_status = (s.get("status") or "").lower()
            if lhdn_status == "valid":
                row.status = "valid"
                dt = s.get("dateTimeValidated")
                row.validated_at = datetime.fromisoformat(dt.replace("Z", "+00:00")) if dt else datetime.now(timezone.utc)
                if row.long_id:
                    row.validation_link = ubl.validation_link(base_url(org), row.document_uuid, row.long_id)
            elif lhdn_status == "invalid":
                row.status = "invalid"
            elif lhdn_status == "cancelled":
                row.status = "cancelled"
    return body


async def cancel_document(db: AsyncSession, org: Organization, sub: EInvoiceSubmission, reason: str) -> EInvoiceSubmission:
    """Cancel a validated document at LHDN (only within the 72h window)."""
    now = datetime.now(timezone.utc)
    if not sub.can_cancel(now):
        raise HTTPException(
            status_code=400,
            detail="Only documents validated within the last 72 hours can be cancelled.",
        )
    resp = await _lhdn_request(
        org, "PUT", f"/api/v1.0/documents/state/{sub.document_uuid}/state",
        json={"status": "cancelled", "reason": reason[:300]},
    )
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"LHDN cancellation failed: {resp.text}")
    sub.status = "cancelled"
    sub.cancelled_at = now
    sub.cancellation_reason = reason[:300]
    return sub


async def validate_tin(org: Organization, tin: str, id_type: str, id_value: str) -> dict:
    """LHDN Taxpayer Validation API. id_type: NRIC | BRN | PASSPORT | ARMY."""
    resp = await _lhdn_request(
        org, "GET", f"/api/v1.0/taxpayer/validate/{tin}",
        params={"idType": id_type, "idValue": id_value},
    )
    if resp.status_code == 200:
        return {"tin": tin, "id_type": id_type, "id_value": id_value, "valid": True}
    if resp.status_code == 404:
        return {"tin": tin, "id_type": id_type, "id_value": id_value, "valid": False}
    raise HTTPException(status_code=502, detail=f"LHDN TIN validation failed: {resp.text}")
