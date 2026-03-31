"""
MyInvois (LHDN) e-Invoice integration for Malaysia.

Supports:
- Sandbox: https://preprod.api.myinvois.hasil.gov.my
- Production: https://api.myinvois.hasil.gov.my

Endpoints used:
- POST /connect/token  → get access token
- POST /api/v1.0/documentsubmissions  → submit invoice
- GET  /api/v1.0/documents/{uuid}/details  → get document status
- PUT  /api/v1.0/documents/state/{uuid}/state  → cancel/reject

Reference: https://sdk.myinvois.hasil.gov.my/
"""

import httpx
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import Organization, Invoice

router = APIRouter(prefix="/einvoice", tags=["e-invoice"])

SANDBOX_BASE = "https://preprod.api.myinvois.hasil.gov.my"
PROD_BASE = "https://api.myinvois.hasil.gov.my"


def _base_url(sandbox: bool) -> str:
    return SANDBOX_BASE if sandbox else PROD_BASE


async def _get_lhdn_token(org: Organization) -> str:
    """Get LHDN access token using client credentials."""
    if not org.einvoice_supplier_tin:
        raise HTTPException(status_code=400, detail="LHDN Supplier TIN not configured")

    base = _base_url(org.einvoice_sandbox)
    # LHDN uses client_id = TIN + NRIC/BRN and client_secret = set in org config
    # For now we'll require client_secret to be stored separately — using TIN as client_id
    payload = {
        "grant_type": "client_credentials",
        "client_id": org.einvoice_supplier_tin,
        "client_secret": "",  # Would need a separate stored secret
        "scope": "InvoicingAPI",
    }
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(f"{base}/connect/token", data=payload)
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"LHDN auth failed: {resp.text}")
        return resp.json()["access_token"]


def _build_ubl_invoice(invoice: Invoice, org: Organization) -> dict:
    """Build LHDN UBL 2.1 invoice document."""
    now = datetime.now(timezone.utc)
    return {
        "_D": "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
        "_A": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
        "_B": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
        "Invoice": [{
            "ID": [{"_": invoice.invoice_number}],
            "IssueDate": [{"_": invoice.issue_date.strftime("%Y-%m-%d") if invoice.issue_date else now.strftime("%Y-%m-%d")}],
            "IssueTime": [{"_": now.strftime("%H:%M:%SZ")}],
            "InvoiceTypeCode": [{"_": "01", "listVersionID": "1.0"}],  # 01 = invoice
            "DocumentCurrencyCode": [{"_": invoice.currency or "MYR"}],
            "TaxCurrencyCode": [{"_": invoice.currency or "MYR"}],
            "AccountingSupplierParty": [{
                "Party": [{
                    "IndustryClassificationCode": [{"_": "46510", "name": "Wholesale of computers, peripheral equipment and software"}],
                    "PartyIdentification": [{"ID": [{"_": org.einvoice_supplier_tin, "schemeID": "TIN"}]}],
                    "PostalAddress": [{"CountrySubentityCode": [{"_": "14"}], "Country": [{"IdentificationCode": [{"_": "MYS"}]}]}],
                    "PartyLegalEntity": [{"RegistrationName": [{"_": org.name}]}],
                    "Contact": [{"Telephone": [{"_": ""}], "ElectronicMail": [{"_": ""}]}],
                }]
            }],
            "LegalMonetaryTotal": [{
                "PayableAmount": [{"_": str(invoice.total or 0), "currencyID": invoice.currency or "MYR"}],
                "TaxExclusiveAmount": [{"_": str(invoice.subtotal or 0), "currencyID": invoice.currency or "MYR"}],
                "TaxInclusiveAmount": [{"_": str(invoice.total or 0), "currencyID": invoice.currency or "MYR"}],
            }],
            "TaxTotal": [{
                "TaxAmount": [{"_": str(invoice.tax_amount or 0), "currencyID": invoice.currency or "MYR"}],
            }],
        }]
    }


@router.post("/submit/{invoice_id}")
async def submit_einvoice(
    invoice_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Submit an invoice to LHDN MyInvois."""
    # Load org
    org_result = await db.execute(select(Organization).where(Organization.id == current_user["org_id"]))
    org = org_result.scalar_one_or_none()
    if not org or not org.einvoice_enabled:
        raise HTTPException(status_code=400, detail="e-Invoice not enabled for this organization")
    if org.country != "MY":
        raise HTTPException(status_code=400, detail="MyInvois is only for Malaysian organizations")

    # Load invoice
    inv_result = await db.execute(
        select(Invoice).where(Invoice.id == invoice_id, Invoice.organization_id == current_user["org_id"])
    )
    invoice = inv_result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    token = await _get_lhdn_token(org)
    base = _base_url(org.einvoice_sandbox)
    ubl_doc = _build_ubl_invoice(invoice, org)

    import hashlib, base64, json
    doc_str = json.dumps(ubl_doc)
    doc_hash = base64.b64encode(hashlib.sha256(doc_str.encode()).digest()).decode()

    payload = {
        "documents": [{
            "format": "JSON",
            "documentHash": doc_hash,
            "codeNumber": invoice.invoice_number,
            "document": base64.b64encode(doc_str.encode()).decode(),
        }]
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{base}/api/v1.0/documentsubmissions",
            json=payload,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        )
        if resp.status_code not in (200, 202):
            raise HTTPException(status_code=502, detail=f"LHDN submission failed: {resp.text}")
        result = resp.json()

    return {
        "submission_id": result.get("submissionUid"),
        "accepted_documents": result.get("acceptedDocuments", []),
        "rejected_documents": result.get("rejectedDocuments", []),
        "sandbox": org.einvoice_sandbox,
    }


@router.get("/status/{submission_uid}")
async def check_einvoice_status(
    submission_uid: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Check submission status from LHDN."""
    org_result = await db.execute(select(Organization).where(Organization.id == current_user["org_id"]))
    org = org_result.scalar_one_or_none()
    if not org or not org.einvoice_enabled:
        raise HTTPException(status_code=400, detail="e-Invoice not enabled")

    token = await _get_lhdn_token(org)
    base = _base_url(org.einvoice_sandbox)

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{base}/api/v1.0/documentsubmissions/{submission_uid}",
            headers={"Authorization": f"Bearer {token}"},
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"LHDN status check failed: {resp.text}")
        return resp.json()


@router.get("/config")
async def get_einvoice_config(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get e-invoice config for this org."""
    org_result = await db.execute(select(Organization).where(Organization.id == current_user["org_id"]))
    org = org_result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Org not found")
    return {
        "einvoice_enabled": org.einvoice_enabled,
        "einvoice_supplier_tin": org.einvoice_supplier_tin,
        "einvoice_sandbox": org.einvoice_sandbox,
        "tax_regime": org.tax_regime,
        "country": org.country,
    }
