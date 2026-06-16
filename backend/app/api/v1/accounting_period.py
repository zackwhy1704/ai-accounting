"""Accounting period locking (fiscal close).

Lock the books through a date so no transaction can be posted into a closed
period. Enforced centrally in gl_helpers._assert_period_open (every GL write) and
in the manual-journal post path.
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from uuid import UUID

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import require_admin, require_write
from app.core.audit import log_audit
from app.models.auth import Organization
from app.models.models import Account, Transaction, JournalEntry

router = APIRouter(prefix="/accounting", tags=["accounting-period"])


class LockPeriodRequest(BaseModel):
    locked_through_date: datetime   # lock all transactions on/before this date


@router.get("/period-lock")
async def get_period_lock(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    org = (await db.execute(
        select(Organization).where(Organization.id == current_user["org_id"])
    )).scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    locked = getattr(org, "locked_through_date", None)
    return {"locked_through_date": locked.isoformat() if locked else None}


@router.post("/lock-period")
async def lock_period(
    payload: LockPeriodRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_admin()),
):
    org = (await db.execute(
        select(Organization).where(Organization.id == current_user["org_id"])
    )).scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    new_lock = payload.locked_through_date
    if new_lock.tzinfo is None:
        new_lock = new_lock.replace(tzinfo=timezone.utc)
    # Don't allow moving the lock backwards past an existing lock (would re-open a
    # closed period) — admins must explicitly unlock first.
    existing = getattr(org, "locked_through_date", None)
    if existing and new_lock < existing:
        raise HTTPException(
            status_code=400,
            detail=f"Period is already locked through {existing.date().isoformat()}. "
                   f"Unlock first to move the lock earlier.",
        )
    org.locked_through_date = new_lock
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "lock_period", "organization", current_user["org_id"], {"locked_through_date": new_lock.isoformat()})
    return {"locked_through_date": new_lock.isoformat()}


@router.post("/unlock-period")
async def unlock_period(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_admin()),
):
    org = (await db.execute(
        select(Organization).where(Organization.id == current_user["org_id"])
    )).scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    org.locked_through_date = None
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "unlock_period", "organization", current_user["org_id"])
    return {"locked_through_date": None}


# ── Opening balances ───────────────────────────────────────────────────────────

class OpeningBalanceLine(BaseModel):
    account_id: UUID
    debit: float = 0.0
    credit: float = 0.0


class OpeningBalancesRequest(BaseModel):
    as_of_date: datetime
    lines: list[OpeningBalanceLine]
    retained_earnings_code: str = "3100"   # plug account for any imbalance


@router.get("/opening-balances")
async def get_opening_balances(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Return the existing opening-balance journal lines, if any."""
    org_id = current_user["org_id"]
    txn = (await db.execute(
        select(Transaction).where(
            Transaction.organization_id == org_id,
            Transaction.source == "opening_balance",
        ).order_by(Transaction.date.desc())
    )).scalars().first()
    if not txn:
        return {"exists": False, "lines": []}
    rows = (await db.execute(
        select(JournalEntry, Account)
        .join(Account, Account.id == JournalEntry.account_id)
        .where(JournalEntry.transaction_id == txn.id)
    )).all()
    return {
        "exists": True,
        "as_of_date": txn.date.isoformat() if txn.date else None,
        "lines": [
            {"account_id": str(je.account_id), "account_code": acct.code,
             "account_name": acct.name, "debit": float(je.debit or 0), "credit": float(je.credit or 0)}
            for je, acct in rows
        ],
    }


@router.post("/opening-balances", status_code=201)
async def set_opening_balances(
    payload: OpeningBalancesRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    """Create the opening-balance journal for a new org migrating from another
    system. Any debit/credit imbalance is absorbed by Retained Earnings so the
    transaction always balances. Replaces any prior opening-balance transaction."""
    org_id = current_user["org_id"]
    if not payload.lines:
        raise HTTPException(status_code=422, detail="At least one opening balance line is required")

    # Validate accounts belong to the org
    acct_ids = {l.account_id for l in payload.lines}
    accts = (await db.execute(
        select(Account).where(Account.organization_id == org_id, Account.id.in_(acct_ids))
    )).scalars().all()
    found = {a.id for a in accts}
    missing = acct_ids - found
    if missing:
        raise HTTPException(status_code=400, detail=f"Unknown account(s): {', '.join(str(m) for m in missing)}")
    for a in accts:
        if getattr(a, "account_role", "account") in ("header", "subheader"):
            raise HTTPException(status_code=400, detail=f"Cannot set an opening balance on header/subheader account {a.code}")

    total_debit = round(sum(l.debit for l in payload.lines), 2)
    total_credit = round(sum(l.credit for l in payload.lines), 2)
    imbalance = round(total_debit - total_credit, 2)

    # Resolve retained earnings plug account
    re_acct = (await db.execute(
        select(Account).where(Account.organization_id == org_id, Account.code == payload.retained_earnings_code)
    )).scalar_one_or_none()
    if imbalance != 0 and not re_acct:
        raise HTTPException(status_code=400, detail=f"Retained earnings account '{payload.retained_earnings_code}' not found to absorb the imbalance")

    as_of = payload.as_of_date if payload.as_of_date.tzinfo else payload.as_of_date.replace(tzinfo=timezone.utc)

    # Replace any prior opening-balance transaction
    prior = (await db.execute(
        select(Transaction).where(
            Transaction.organization_id == org_id, Transaction.source == "opening_balance"
        )
    )).scalars().all()
    for p in prior:
        await db.execute(
            JournalEntry.__table__.delete().where(JournalEntry.transaction_id == p.id)
        )
        await db.delete(p)
    await db.flush()

    txn = Transaction(
        organization_id=org_id, date=as_of,
        description="Opening balances", reference="OPENING",
        source="opening_balance", source_id=None,
    )
    db.add(txn)
    await db.flush()

    for l in payload.lines:
        db.add(JournalEntry(transaction_id=txn.id, account_id=l.account_id,
                            debit=round(l.debit, 2), credit=round(l.credit, 2)))
    # Plug imbalance into retained earnings
    if imbalance > 0:
        db.add(JournalEntry(transaction_id=txn.id, account_id=re_acct.id, debit=0.0, credit=imbalance))
    elif imbalance < 0:
        db.add(JournalEntry(transaction_id=txn.id, account_id=re_acct.id, debit=abs(imbalance), credit=0.0))

    await db.commit()
    await log_audit(db, org_id, current_user["sub"], "set_opening_balances", "transaction", txn.id)
    return {"transaction_id": str(txn.id), "as_of_date": as_of.isoformat(), "imbalance_to_retained_earnings": imbalance}
