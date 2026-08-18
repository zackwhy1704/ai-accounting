"""Balance sheet and trial balance reports."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.core.security import get_current_user
from ._util import parse_date, account_nature, PL_NATURES, NATURE_ASSET, NATURE_LIABILITY, NATURE_EQUITY, NATURE_REVENUE, NATURE_OTHER_INCOME
from app.models.models import Account, JournalEntry, Transaction

router = APIRouter()


async def _bs_sections(db: AsyncSession, org_id, as_of: datetime) -> dict:
    """Assets / liabilities / equity as of a date, with per-account detail
    lines (the accountants' requirement: Bank 1000 + Cash 500 + Debtors 200 =
    Total Assets 1700, not just the total). P&L accounts fold into equity as a
    single "Current Year Earnings" line so the statement still balances."""
    result = await db.execute(
        select(
            Account.id, Account.code, Account.name, Account.type,
            func.coalesce(func.sum(JournalEntry.debit), 0).label("total_debit"),
            func.coalesce(func.sum(JournalEntry.credit), 0).label("total_credit"),
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
    sections: dict = {
        "assets": 0.0, "liabilities": 0.0, "equity": 0.0,
        "asset_lines": [], "liability_lines": [], "equity_lines": [],
    }
    earnings = 0.0
    for row in result.all():
        dr = float(row.total_debit or 0)
        cr = float(row.total_credit or 0)
        nature = account_nature(row.type, row.code)
        if nature == NATURE_ASSET:
            bal = dr - cr
            if abs(bal) >= 0.005:
                sections["asset_lines"].append({"code": row.code, "name": row.name, "amount": round(bal, 2)})
            sections["assets"] += bal
        elif nature == NATURE_LIABILITY:
            bal = cr - dr
            if abs(bal) >= 0.005:
                sections["liability_lines"].append({"code": row.code, "name": row.name, "amount": round(bal, 2)})
            sections["liabilities"] += bal
        elif nature == NATURE_EQUITY:
            bal = cr - dr
            if abs(bal) >= 0.005:
                sections["equity_lines"].append({"code": row.code, "name": row.name, "amount": round(bal, 2)})
            sections["equity"] += bal
        elif nature in PL_NATURES:
            signed = (cr - dr) if nature in (NATURE_REVENUE, NATURE_OTHER_INCOME) else -(dr - cr)
            earnings += signed
    if abs(earnings) >= 0.005:
        sections["equity_lines"].append({"code": None, "name": "Current Year Earnings", "amount": round(earnings, 2)})
    sections["equity"] += earnings
    for k in ("assets", "liabilities", "equity"):
        sections[k] = round(sections[k], 2)
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
        "liabilities_and_equity": round(total_liabilities + total_equity, 2),
        "is_balanced": abs(total_assets - (total_liabilities + total_equity)) < 0.01,
        "sections": {
            "assets": {"total": total_assets, "lines": sections.get("asset_lines", [])},
            "liabilities": {"total": total_liabilities, "lines": sections.get("liability_lines", [])},
            "equity": {"total": total_equity, "lines": sections.get("equity_lines", [])},
        },
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
