"""
Budgets — per-account monthly amounts for a fiscal year, powering the
budget-vs-actual columns on the P&L report (?include_budget=true).
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.audit import log_audit
from app.core.database import get_db
from app.core.permissions import require_write
from app.core.security import get_current_user
from app.models.models import Account, BudgetLine

router = APIRouter(prefix="/budgets", tags=["budgets"])


def budget_amount_for_period(amounts: list, start_month: int, end_month: int) -> float:
    """Sum of monthly buckets for calendar months start..end inclusive (1-12)."""
    amounts = list(amounts or [])
    total = 0.0
    for m in range(start_month, end_month + 1):
        if 1 <= m <= len(amounts):
            total += float(amounts[m - 1] or 0)
    return round(total, 2)


class BudgetLineIn(BaseModel):
    account_id: UUID
    amounts: list[float]
    notes: str | None = None

    @field_validator("amounts")
    @classmethod
    def _twelve(cls, v):
        if len(v) != 12:
            raise ValueError("amounts must contain exactly 12 monthly values (Jan..Dec)")
        return [round(float(a or 0), 2) for a in v]


class BudgetUpsert(BaseModel):
    lines: list[BudgetLineIn]


@router.get("/{fiscal_year}")
async def get_budget(fiscal_year: int, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    org_id = current_user["org_id"]
    rows = (await db.execute(
        select(BudgetLine).options(selectinload(BudgetLine.account))
        .where(BudgetLine.organization_id == org_id, BudgetLine.fiscal_year == fiscal_year)
    )).scalars().all()
    return {
        "fiscal_year": fiscal_year,
        "lines": [{
            "id": str(b.id), "account_id": str(b.account_id),
            "account_code": b.account.code if b.account else None,
            "account_name": b.account.name if b.account else None,
            "account_type": b.account.type if b.account else None,
            "amounts": b.amounts, "annual_total": b.annual_total, "notes": b.notes,
        } for b in sorted(rows, key=lambda r: (r.account.code if r.account else ""))],
    }


@router.put("/{fiscal_year}")
async def upsert_budget(
    fiscal_year: int,
    payload: BudgetUpsert,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    """Replace-or-create the budget lines given; lines not mentioned are kept.
    Accounts must belong to the org and be postable (not header/subheader)."""
    org_id = current_user["org_id"]
    if not payload.lines:
        raise HTTPException(status_code=422, detail="At least one budget line is required")

    acct_ids = {l.account_id for l in payload.lines}
    accounts = {a.id: a for a in (await db.execute(
        select(Account).where(Account.organization_id == org_id, Account.id.in_(acct_ids))
    )).scalars().all()}
    missing = acct_ids - set(accounts)
    if missing:
        raise HTTPException(status_code=400, detail=f"Unknown account(s): {', '.join(str(m) for m in missing)}")
    for a in accounts.values():
        if getattr(a, "account_role", "account") in ("header", "subheader"):
            raise HTTPException(status_code=400, detail=f"Cannot budget on header/subheader account {a.code}")

    existing = {b.account_id: b for b in (await db.execute(
        select(BudgetLine).where(
            BudgetLine.organization_id == org_id, BudgetLine.fiscal_year == fiscal_year,
            BudgetLine.account_id.in_(acct_ids),
        )
    )).scalars().all()}

    for line in payload.lines:
        row = existing.get(line.account_id)
        if row:
            row.amounts = line.amounts
            row.notes = line.notes
        else:
            db.add(BudgetLine(
                organization_id=org_id, fiscal_year=fiscal_year,
                account_id=line.account_id, amounts=line.amounts, notes=line.notes,
            ))
    await db.commit()
    await log_audit(db, org_id, current_user["sub"], "update", "budget", None,
                    {"fiscal_year": fiscal_year, "lines": len(payload.lines)})
    return await get_budget(fiscal_year, db, current_user)


@router.delete("/{fiscal_year}/{account_id}", status_code=204)
async def delete_budget_line(
    fiscal_year: int,
    account_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    org_id = current_user["org_id"]
    row = (await db.execute(
        select(BudgetLine).where(
            BudgetLine.organization_id == org_id, BudgetLine.fiscal_year == fiscal_year,
            BudgetLine.account_id == account_id,
        )
    )).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Budget line not found")
    await db.delete(row)
    await db.commit()
    await log_audit(db, org_id, current_user["sub"], "delete", "budget", row.id,
                    {"fiscal_year": fiscal_year})
