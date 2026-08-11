"""Balance sheet and trial balance reports."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.core.security import get_current_user
from ._util import parse_date
from app.models.models import Account, JournalEntry, Transaction

router = APIRouter()


async def _bs_sections(db: AsyncSession, org_id, as_of: datetime) -> dict:
    """Assets / liabilities / equity totals as of a date (P&L folds into equity)."""
    result = await db.execute(
        select(
            Account.type,
            func.sum(JournalEntry.debit).label("total_debit"),
            func.sum(JournalEntry.credit).label("total_credit"),
        )
        .join(JournalEntry, JournalEntry.account_id == Account.id)
        .join(Transaction, JournalEntry.transaction_id == Transaction.id)
        .where(
            Account.organization_id == org_id,
            Transaction.date <= as_of,
            Transaction.is_posted == True,
        )
        .group_by(Account.type)
    )
    sections: dict = {}
    for row in result.all():
        dr = float(row.total_debit or 0)
        cr = float(row.total_credit or 0)
        t = row.type.lower() if row.type else "other"
        if t in ("asset", "assets"):
            sections["assets"] = sections.get("assets", 0) + dr - cr
        elif t in ("liability", "liabilities"):
            sections["liabilities"] = sections.get("liabilities", 0) + cr - dr
        elif t in ("equity",):
            sections["equity"] = sections.get("equity", 0) + cr - dr
        elif t in ("revenue", "income"):
            sections["equity"] = sections.get("equity", 0) + cr - dr  # Retained earnings
        elif t in ("expense", "expenses"):
            sections["equity"] = sections.get("equity", 0) - (dr - cr)  # Reduces retained earnings
    return sections


@router.get("/balance-sheet")
async def balance_sheet_report(
    as_of_date: str = Query(None, description="YYYY-MM-DD"),
    compare: str | None = Query(None, description="previous_year | previous_month — adds a comparative column"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Balance Sheet as of a given date, optionally with a comparative date."""
    org_id = current_user["org_id"]
    as_of = parse_date(as_of_date, "as_of_date", end_of_day=True) if as_of_date else datetime.now(timezone.utc)

    sections = await _bs_sections(db, org_id, as_of)
    total_assets = sections.get("assets", 0)
    total_liabilities = sections.get("liabilities", 0)
    total_equity = sections.get("equity", 0)

    comparative = None
    if compare in ("previous_year", "previous_month"):
        from dateutil.relativedelta import relativedelta
        comp_as_of = as_of - relativedelta(years=1) if compare == "previous_year" else as_of - relativedelta(months=1)
        comp = await _bs_sections(db, org_id, comp_as_of)
        comparative = {
            "as_of_date": comp_as_of.strftime("%Y-%m-%d"),
            "assets": comp.get("assets", 0),
            "liabilities": comp.get("liabilities", 0),
            "equity": comp.get("equity", 0),
            "liabilities_and_equity": comp.get("liabilities", 0) + comp.get("equity", 0),
        }

    return {
        "report_type": "balance_sheet",
        "as_of_date": as_of.strftime("%Y-%m-%d"),
        "currency": "MYR",
        "assets": total_assets,
        "liabilities": total_liabilities,
        "equity": total_equity,
        "liabilities_and_equity": total_liabilities + total_equity,
        "is_balanced": abs(total_assets - (total_liabilities + total_equity)) < 0.01,
        **({"comparative": comparative} if comparative else {}),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/trial-balance")
async def trial_balance_report(
    as_of_date: str = Query(None, description="YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Trial balance as of a given date — sum of journal entry debits/credits by account."""
    org_id = current_user["org_id"]
    as_of = parse_date(as_of_date, "as_of_date", end_of_day=True) if as_of_date else datetime.now(timezone.utc)

    result = await db.execute(
        select(
            Account.code,
            Account.name,
            Account.type,
            func.sum(JournalEntry.debit).label("total_debit"),
            func.sum(JournalEntry.credit).label("total_credit"),
        )
        .join(JournalEntry, JournalEntry.account_id == Account.id)
        .join(Transaction, JournalEntry.transaction_id == Transaction.id)
        .where(
            Account.organization_id == org_id,
            Transaction.date <= as_of,
            Transaction.is_posted == True,
        )
        .group_by(Account.id, Account.code, Account.name, Account.type)
        .order_by(Account.code)
    )
    rows = result.all()

    lines = []
    total_dr = 0.0
    total_cr = 0.0
    for row in rows:
        dr = float(row.total_debit or 0)
        cr = float(row.total_credit or 0)
        total_dr += dr
        total_cr += cr
        lines.append({
            "code": row.code,
            "name": row.name,
            "type": row.type,
            "debit": dr,
            "credit": cr,
            "balance": dr - cr,
        })

    return {
        "report_type": "trial_balance",
        "as_of_date": as_of.strftime("%Y-%m-%d"),
        "as_at": as_of.strftime("%Y-%m-%d"),
        "currency": "MYR",
        "lines": lines,
        "totals": {"debit": total_dr, "credit": total_cr},
        "is_balanced": abs(total_dr - total_cr) < 0.01,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/cash-flow")
async def cash_flow_report(
    start_date: str = Query(..., description="YYYY-MM-DD"),
    end_date: str = Query(..., description="YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Cash Flow Statement summary."""
    org_id = current_user["org_id"]
    start = parse_date(start_date, "start_date")
    end = parse_date(end_date, "end_date", end_of_day=True)

    # Cash/bank accounts — movements during period
    cash_accounts = await db.execute(
        select(Account.id).where(
            Account.organization_id == org_id,
            Account.type.in_(["bank", "cash", "asset"]),
            Account.name.ilike("%cash%") | Account.name.ilike("%bank%"),
        )
    )
    cash_ids = [row[0] for row in cash_accounts.all()]

    if cash_ids:
        # Opening cash
        open_q = await db.execute(
            select(
                func.coalesce(func.sum(JournalEntry.debit), 0),
                func.coalesce(func.sum(JournalEntry.credit), 0),
            )
            .join(Transaction, JournalEntry.transaction_id == Transaction.id)
            .where(
                JournalEntry.account_id.in_(cash_ids),
                Transaction.date < start,
                Transaction.is_posted == True,
            )
        )
        orow = open_q.one()
        opening_cash = float(orow[0]) - float(orow[1])

        # Period movements
        period_q = await db.execute(
            select(
                func.coalesce(func.sum(JournalEntry.debit), 0),
                func.coalesce(func.sum(JournalEntry.credit), 0),
            )
            .join(Transaction, JournalEntry.transaction_id == Transaction.id)
            .where(
                JournalEntry.account_id.in_(cash_ids),
                Transaction.date >= start,
                Transaction.date <= end,
                Transaction.is_posted == True,
            )
        )
        prow = period_q.one()
        cash_in = float(prow[0])
        cash_out = float(prow[1])
    else:
        opening_cash = 0
        cash_in = 0
        cash_out = 0

    net_change = cash_in - cash_out
    closing_cash = opening_cash + net_change

    return {
        "report_type": "cash_flow",
        "start_date": start_date,
        "end_date": end_date,
        "currency": "MYR",
        "opening_cash": opening_cash,
        "cash_inflows": cash_in,
        "cash_outflows": cash_out,
        "net_change": net_change,
        "closing_cash": closing_cash,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
