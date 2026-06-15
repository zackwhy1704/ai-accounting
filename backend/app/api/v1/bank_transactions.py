import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)
from sqlalchemy import select, func, or_
from uuid import UUID
from datetime import datetime
from typing import Optional
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import require_write
from app.core.pagination import PaginationParams, paginated_result, apply_sort
from app.models.models import BankTransaction, Contact, BankAccount
from app.api.v1.gl_helpers import post_gl_by_id, revert_gl
from app.core.audit import log_audit
from sqlalchemy import select as _select

router = APIRouter(prefix="/bank-transactions", tags=["bank-transactions"])


class BankTransactionCreate(BaseModel):
    transaction_type: str
    transaction_date: datetime
    description: str
    amount: float
    currency: str = "MYR"
    bank_account_id: Optional[UUID] = None
    contact_id: Optional[UUID] = None
    reference_no: Optional[str] = None
    payment_method: str = "bank_transfer"
    category: Optional[str] = None
    category_account_id: Optional[UUID] = None
    notes: Optional[str] = None


class BankTransactionUpdate(BaseModel):
    transaction_type: Optional[str] = None
    transaction_date: Optional[datetime] = None
    description: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    bank_account_id: Optional[UUID] = None
    contact_id: Optional[UUID] = None
    reference_no: Optional[str] = None
    payment_method: Optional[str] = None
    category: Optional[str] = None
    category_account_id: Optional[UUID] = None
    notes: Optional[str] = None


class BankTransactionResponse(BaseModel):
    id: UUID
    organization_id: UUID
    bank_account_id: Optional[UUID]
    contact_id: Optional[UUID]
    transaction_type: str
    transaction_date: datetime
    reference_no: Optional[str]
    description: str
    amount: float
    currency: str
    payment_method: str
    category: Optional[str]
    category_account_id: Optional[UUID]
    notes: Optional[str]
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("")
async def list_bank_transactions(
    transaction_type: Optional[str] = Query(None),
    from_date: Optional[datetime] = Query(None),
    to_date: Optional[datetime] = Query(None),
    contact_id: UUID | None = None,
    p: PaginationParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    org_id = current_user["org_id"]
    base = select(BankTransaction).where(
        BankTransaction.organization_id == org_id,
        BankTransaction.status != "void",
    )
    if transaction_type:
        base = base.where(BankTransaction.transaction_type == transaction_type)
    if from_date:
        base = base.where(BankTransaction.transaction_date >= from_date)
    if to_date:
        base = base.where(BankTransaction.transaction_date <= to_date)
    if contact_id:
        base = base.where(BankTransaction.contact_id == contact_id)
    if p.search:
        like = f"%{p.search}%"
        contact_match = select(Contact.id).where(
            Contact.organization_id == org_id, Contact.name.ilike(like)
        )
        base = base.where(or_(
            BankTransaction.description.ilike(like),
            BankTransaction.reference_no.ilike(like),
            BankTransaction.contact_id.in_(contact_match),
        ))
    if p.date_from:
        base = base.where(BankTransaction.transaction_date >= p.date_from)
    if p.date_to:
        base = base.where(BankTransaction.transaction_date <= p.date_to)

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    query = apply_sort(base, BankTransaction, p, "transaction_date").offset(p.offset).limit(p.limit)
    items = (await db.execute(query)).scalars().all()
    items = [BankTransactionResponse.model_validate(i) for i in items]
    return paginated_result(items, total, p)


@router.post("", response_model=BankTransactionResponse, status_code=201)
async def create_bank_transaction(
    payload: BankTransactionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    org_id = current_user["org_id"]
    txn = BankTransaction(
        organization_id=org_id,
        **payload.model_dump(),
    )
    db.add(txn)
    await db.flush()

    # Post GL if bank account has a linked GL account
    if payload.bank_account_id:
        ba_result = await db.execute(
            _select(BankAccount).where(BankAccount.id == payload.bank_account_id)
        )
        bank_account = ba_result.scalar_one_or_none()
        if bank_account and bank_account.gl_account_id:
            amount = float(payload.amount or 0)
            is_income = payload.transaction_type in ("income", "deposit", "credit")
            if payload.category_account_id:
                if is_income:
                    # DR Bank / CR Income category
                    entries_by_id = [
                        (bank_account.gl_account_id, amount, 0.0),
                        (payload.category_account_id, 0.0, amount),
                    ]
                else:
                    # DR Expense category / CR Bank
                    entries_by_id = [
                        (payload.category_account_id, amount, 0.0),
                        (bank_account.gl_account_id, 0.0, amount),
                    ]
            else:
                # No category selected — skip GL to avoid unbalanced entry
                entries_by_id = None
            if entries_by_id:
                try:
                    await post_gl_by_id(
                        db, org_id, txn.transaction_date,
                        txn.description,
                        txn.reference_no or str(txn.id),
                        "bank_transaction",
                        txn.id,
                        entries_by_id,
                    )
                except HTTPException:
                    raise
                except Exception as e:
                    logger.error(f"GL posting failed for bank_transaction {txn.id}: {e}", exc_info=True)

    await db.commit()
    await log_audit(db, org_id, current_user["sub"], "create", "bank_transaction", txn.id)
    await db.refresh(txn)
    return txn


@router.get("/{txn_id}", response_model=BankTransactionResponse)
async def get_bank_transaction(
    txn_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(BankTransaction).where(
            BankTransaction.id == txn_id,
            BankTransaction.organization_id == current_user["org_id"],
        )
    )
    txn = result.scalar_one_or_none()
    if not txn:
        raise HTTPException(status_code=404, detail="Bank transaction not found")
    return txn


@router.patch("/{txn_id}", response_model=BankTransactionResponse)
async def update_bank_transaction(
    txn_id: UUID,
    payload: BankTransactionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    result = await db.execute(
        select(BankTransaction).where(
            BankTransaction.id == txn_id,
            BankTransaction.organization_id == current_user["org_id"],
        )
    )
    txn = result.scalar_one_or_none()
    if not txn:
        raise HTTPException(status_code=404, detail="Bank transaction not found")
    for key, val in payload.model_dump(exclude_unset=True).items():
        setattr(txn, key, val)
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "update", "bank_transaction", txn_id)
    await db.refresh(txn)
    return txn


@router.delete("/{txn_id}", status_code=204)
async def void_bank_transaction(
    txn_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    result = await db.execute(
        select(BankTransaction).where(
            BankTransaction.id == txn_id,
            BankTransaction.organization_id == current_user["org_id"],
        )
    )
    txn = result.scalar_one_or_none()
    if not txn:
        raise HTTPException(status_code=404, detail="Bank transaction not found")
    txn.status = "void"
    # Reverse any GL entries posted for this transaction
    try:
        await revert_gl(
            db, current_user["org_id"], txn_id, "bank_transaction",
            txn.transaction_date,
            f"Reversal: Bank transaction {txn.reference_no or txn_id} voided",
            txn.reference_no or str(txn_id),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"GL revert failed for bank_transaction {txn_id}: {e}", exc_info=True)
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "void", "bank_transaction", txn_id)
