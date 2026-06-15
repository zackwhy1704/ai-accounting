"""
/vendor-credits — alias for /purchase-credit-notes.
Imports the same handler functions so both paths work identically.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import require_write
from app.core.pagination import PaginationParams
from app.api.v1.purchase_credit_notes import (
    list_purchase_credit_notes,
    create_purchase_credit_note,
    get_purchase_credit_note,
    update_purchase_credit_note,
    update_purchase_credit_note_status,
    delete_purchase_credit_note,
    PurchaseCreditNoteCreate,
    PurchaseCreditNoteUpdate,
)
from app.schemas.schemas import PurchaseCreditNoteResponse

router = APIRouter(prefix="/vendor-credits", tags=["vendor-credits"])


@router.get("")
async def list_vendor_credits(
    status: str | None = None,
    contact_id: UUID | None = None,
    p: PaginationParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    return await list_purchase_credit_notes(status=status, contact_id=contact_id, p=p, db=db, current_user=current_user)


@router.post("", response_model=PurchaseCreditNoteResponse, status_code=201)
async def create_vendor_credit(
    payload: PurchaseCreditNoteCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    return await create_purchase_credit_note(payload=payload, db=db, current_user=current_user)


@router.get("/{pcn_id}", response_model=PurchaseCreditNoteResponse)
async def get_vendor_credit(
    pcn_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    return await get_purchase_credit_note(pcn_id=pcn_id, db=db, current_user=current_user)


@router.patch("/{pcn_id}", response_model=PurchaseCreditNoteResponse)
async def update_vendor_credit(
    pcn_id: UUID,
    payload: PurchaseCreditNoteUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    return await update_purchase_credit_note(pcn_id=pcn_id, payload=payload, db=db, current_user=current_user)


@router.patch("/{pcn_id}/status", response_model=PurchaseCreditNoteResponse)
async def update_vendor_credit_status(
    pcn_id: UUID,
    status: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    return await update_purchase_credit_note_status(pcn_id=pcn_id, status=status, db=db, current_user=current_user)


@router.delete("/{pcn_id}", status_code=204)
async def delete_vendor_credit(
    pcn_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    return await delete_purchase_credit_note(pcn_id=pcn_id, db=db, current_user=current_user)
