"""
Year-end close (fiscal brought-forward).

Zeroes every revenue/expense account as at the fiscal year end and transfers
the net result to Retained Earnings (3100), then (optionally) advances the
period lock to that date. Computing each P&L account's cumulative balance
through the close date automatically nets out earlier closes, so running the
close for FY2026 after FY2025 was closed only sweeps FY2026 activity.

Undo deletes the most recent close transaction (admin-only) and rolls the
period lock back if the close set it.
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_audit
from app.core.database import get_db
from app.core.permissions import require_admin
from app.core.security import get_current_user
from app.models.auth import Organization
from app.models.models import Account, JournalEntry, Transaction
from .gl_helpers import post_gl_by_id

router = APIRouter(prefix="/accounting", tags=["accounting-period"])

RETAINED_EARNINGS_CODE = "3100"
PL_ACCOUNT_TYPES = ("revenue", "income", "expense")


def fiscal_year_end_for(org: Organization, today: datetime) -> datetime:
    """Most recent fiscal year end on/before `today` (23:59:59 UTC)."""
    month = int(org.fiscal_year_end_month or 12)
    day = int(org.fiscal_year_end_day or 31)
    for year in (today.year, today.year - 1):
        try:
            candidate = datetime(year, month, day, 23, 59, 59, tzinfo=timezone.utc)
        except ValueError:  # e.g. Feb 30 configured — clamp to Feb 28
            candidate = datetime(year, month, 28, 23, 59, 59, tzinfo=timezone.utc)
        if candidate.date() <= today.date():
            return candidate
    return datetime(today.year - 1, month, day, 23, 59, 59, tzinfo=timezone.utc)


async def _pl_balances(db: AsyncSession, org_id, through: datetime) -> list[tuple[Account, float]]:
    """(account, net debit-credit) for every P&L account with activity through `through`."""
    rows = (await db.execute(
        select(Account, func.coalesce(func.sum(JournalEntry.debit - JournalEntry.credit), 0))
        .join(JournalEntry, JournalEntry.account_id == Account.id)
        .join(Transaction, Transaction.id == JournalEntry.transaction_id)
        .where(
            Account.organization_id == org_id,
            Account.type.in_(PL_ACCOUNT_TYPES),
            Transaction.date <= through,
        )
        .group_by(Account.id)
    )).all()
    return [(acct, round(float(net), 2)) for acct, net in rows if round(float(net), 2) != 0]


def build_close_entries(balances: list[tuple], re_account_id) -> tuple[list[tuple], float]:
    """Closing entries from [(account_id, net_debit_minus_credit)] + the retained
    earnings plug. Returns (entries, net_income) where positive net_income = profit."""
    entries: list[tuple] = []
    for account_id, net in balances:
        if net > 0:      # debit balance (expenses) → credit to zero
            entries.append((account_id, 0.0, net))
        elif net < 0:    # credit balance (revenue) → debit to zero
            entries.append((account_id, -net, 0.0))
    net_income = -round(sum(n for _, n in balances), 2)
    if net_income > 0:
        entries.append((re_account_id, 0.0, net_income))
    elif net_income < 0:
        entries.append((re_account_id, -net_income, 0.0))
    return entries, net_income


class YearEndCloseRequest(BaseModel):
    fiscal_year_end: datetime | None = None  # default: latest FY end before today
    lock_period: bool = True


@router.get("/year-end-close")
async def year_end_status(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Past closes + a preview of what the next close would post."""
    org_id = current_user["org_id"]
    org = (await db.execute(select(Organization).where(Organization.id == org_id))).scalar_one()
    closes = (await db.execute(
        select(Transaction).where(
            Transaction.organization_id == org_id, Transaction.source == "year_end_close"
        ).order_by(Transaction.date.desc())
    )).scalars().all()

    fye = fiscal_year_end_for(org, datetime.now(timezone.utc))
    balances = await _pl_balances(db, org_id, fye)
    net = round(sum(b for _, b in balances), 2)  # debit-positive: negative = profit
    return {
        "closes": [{"id": str(t.id), "date": t.date.isoformat(), "description": t.description} for t in closes],
        "next_close": {
            "fiscal_year_end": fye.isoformat(),
            "net_income": -net,  # positive = profit to retained earnings
            "accounts_to_close": len(balances),
            "already_closed": any(t.date == fye for t in closes),
        },
    }


@router.post("/year-end-close", status_code=201)
async def run_year_end_close(
    payload: YearEndCloseRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_admin()),
):
    org_id = current_user["org_id"]
    org = (await db.execute(select(Organization).where(Organization.id == org_id))).scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    fye = payload.fiscal_year_end or fiscal_year_end_for(org, datetime.now(timezone.utc))
    if fye.tzinfo is None:
        fye = fye.replace(tzinfo=timezone.utc)
    if fye.date() > datetime.now(timezone.utc).date():
        raise HTTPException(status_code=400, detail="Cannot close a fiscal year that has not ended yet")

    existing = (await db.execute(
        select(Transaction).where(
            Transaction.organization_id == org_id,
            Transaction.source == "year_end_close",
            Transaction.date == fye,
        )
    )).scalars().first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Fiscal year ending {fye.date().isoformat()} is already closed")

    locked = getattr(org, "locked_through_date", None)
    if locked and fye <= locked:
        raise HTTPException(status_code=400, detail="That date falls in a locked period. Unlock first.")

    balances = await _pl_balances(db, org_id, fye)
    if not balances:
        raise HTTPException(status_code=400, detail="No profit-and-loss activity to close for this fiscal year")

    re_acct = (await db.execute(
        select(Account).where(Account.organization_id == org_id, Account.code == RETAINED_EARNINGS_CODE)
    )).scalar_one_or_none()
    if not re_acct:
        raise HTTPException(status_code=400, detail=f"Retained earnings account {RETAINED_EARNINGS_CODE} not found")

    entries, net_income = build_close_entries([(a.id, n) for a, n in balances], re_acct.id)

    fy_label = fye.strftime("%Y")
    txn = await post_gl_by_id(
        db, org_id, fye, f"Year-end close FY{fy_label}", f"YEC-{fy_label}",
        "year_end_close", None, entries,
    )
    if payload.lock_period:
        org.locked_through_date = fye
    await db.commit()
    await log_audit(db, org_id, current_user["sub"], "year_end_close", "transaction",
                    txn.id if txn else None, {"fiscal_year_end": fye.isoformat(), "net_income": net_income})
    return {
        "transaction_id": str(txn.id) if txn else None,
        "fiscal_year_end": fye.isoformat(),
        "net_income_transferred": net_income,
        "accounts_closed": len(balances),
        "period_locked": payload.lock_period,
    }


@router.post("/year-end-close/undo")
async def undo_year_end_close(db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_admin())):
    """Delete the most recent year-end close and roll back the lock it set."""
    org_id = current_user["org_id"]
    org = (await db.execute(select(Organization).where(Organization.id == org_id))).scalar_one_or_none()
    txn = (await db.execute(
        select(Transaction).where(
            Transaction.organization_id == org_id, Transaction.source == "year_end_close"
        ).order_by(Transaction.date.desc())
    )).scalars().first()
    if not txn:
        raise HTTPException(status_code=404, detail="No year-end close to undo")

    if org and org.locked_through_date == txn.date:
        org.locked_through_date = None
    await db.execute(JournalEntry.__table__.delete().where(JournalEntry.transaction_id == txn.id))
    txn_id, txn_date = txn.id, txn.date
    await db.delete(txn)
    await db.commit()
    await log_audit(db, org_id, current_user["sub"], "undo_year_end_close", "transaction", txn_id,
                    {"fiscal_year_end": txn_date.isoformat() if txn_date else None})
    return {"undone_transaction_id": str(txn_id), "lock_cleared": org.locked_through_date is None if org else None}
