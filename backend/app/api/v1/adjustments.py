"""
Inline GL adjustments attached to a parent transaction (invoice, bill, etc.).

Lets users post a balanced, free-form journal entry against a specific
invoice/bill so it shows up in that document's activity timeline and the
ledger, without requiring a separate Manual Journal.

Source convention: source = "{entity}_adjustment", source_id = parent doc id.
That way the existing invoice-activity endpoint picks them up automatically
via Transaction.source_id == invoice.id.
"""
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import Invoice, Bill, Transaction, JournalEntry, Account
from .gl_helpers import post_gl_by_id, revert_gl

router = APIRouter(tags=["Adjustments"])


class AdjustmentLine(BaseModel):
    account_id: UUID
    debit: float = 0
    credit: float = 0


class AdjustmentCreate(BaseModel):
    date: datetime
    description: str
    reference: str | None = None
    lines: list[AdjustmentLine]


SUPPORTED_ENTITIES = {"invoices": Invoice, "bills": Bill}


async def _ensure_parent(db: AsyncSession, entity: str, parent_id: UUID, org_id: str):
    Model = SUPPORTED_ENTITIES.get(entity)
    if Model is None:
        raise HTTPException(status_code=400, detail=f"Adjustments not supported for {entity}")
    result = await db.execute(
        select(Model).where(Model.id == parent_id, Model.organization_id == org_id)
    )
    parent = result.scalar_one_or_none()
    if not parent:
        raise HTTPException(status_code=404, detail=f"{entity[:-1]} not found")
    return parent


@router.post("/{entity}/{parent_id}/adjustments", status_code=201)
async def create_adjustment(
    entity: str,
    parent_id: UUID,
    payload: AdjustmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    org_id = current_user["org_id"]
    await _ensure_parent(db, entity, parent_id, org_id)

    if not payload.lines:
        raise HTTPException(status_code=400, detail="At least one line required")
    total_dr = round(sum(l.debit for l in payload.lines), 2)
    total_cr = round(sum(l.credit for l in payload.lines), 2)
    if total_dr != total_cr or total_dr == 0:
        raise HTTPException(status_code=400, detail=f"Lines must balance and be non-zero (Dr {total_dr} vs Cr {total_cr})")
    for l in payload.lines:
        if l.debit < 0 or l.credit < 0:
            raise HTTPException(status_code=400, detail="Debit/credit must be non-negative")
        if l.debit > 0 and l.credit > 0:
            raise HTTPException(status_code=400, detail="A line cannot have both debit and credit")

    source = f"{entity[:-1]}_adjustment"
    ref = payload.reference or f"ADJ-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"

    txn = await post_gl_by_id(
        db, org_id, payload.date, payload.description, ref, source, parent_id,
        [(l.account_id, float(l.debit), float(l.credit)) for l in payload.lines],
    )
    if txn is None:
        raise HTTPException(status_code=400, detail="Could not post — verify accounts exist")
    await db.commit()
    await db.refresh(txn)
    return {"id": str(txn.id), "reference": ref, "source": source}


@router.get("/{entity}/{parent_id}/adjustments")
async def list_adjustments(
    entity: str,
    parent_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    org_id = current_user["org_id"]
    await _ensure_parent(db, entity, parent_id, org_id)
    source = f"{entity[:-1]}_adjustment"
    result = await db.execute(
        select(Transaction).where(
            Transaction.organization_id == org_id,
            Transaction.source_id == parent_id,
            Transaction.source == source,
        ).order_by(Transaction.date)
    )
    out = []
    for txn in result.scalars().all():
        je_result = await db.execute(
            select(JournalEntry, Account)
            .join(Account, Account.id == JournalEntry.account_id)
            .where(JournalEntry.transaction_id == txn.id)
        )
        out.append({
            "id": str(txn.id),
            "date": txn.date.isoformat() if txn.date else None,
            "description": txn.description,
            "reference": txn.reference,
            "lines": [
                {
                    "account_code": acct.code,
                    "account_name": acct.name,
                    "debit": float(je.debit or 0),
                    "credit": float(je.credit or 0),
                }
                for je, acct in je_result.all()
            ],
        })
    return out


@router.delete("/adjustments/{txn_id}", status_code=204)
async def delete_adjustment(
    txn_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Reverse and delete an adjustment. Posts a counter-entry then removes the originals."""
    org_id = current_user["org_id"]
    result = await db.execute(
        select(Transaction).where(Transaction.id == txn_id, Transaction.organization_id == org_id)
    )
    txn = result.scalar_one_or_none()
    if not txn:
        raise HTTPException(status_code=404, detail="Adjustment not found")
    if not txn.source.endswith("_adjustment"):
        raise HTTPException(status_code=400, detail="Only adjustments can be deleted via this endpoint")

    await revert_gl(db, org_id, txn.source_id, txn.source, datetime.utcnow(),
                    f"Reversal of adjustment {txn.reference or txn.id}", txn.reference or "")
    await db.commit()
