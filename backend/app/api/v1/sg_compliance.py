"""
Singapore IRAS GST compliance.

GST F5 (quarterly return) computed from the GENERAL LEDGER over a period:
  - Box 1: total value of standard-rated supplies (net sales, ex-GST)
  - Box 5: total value of taxable purchases (net purchases, ex-GST)
  - Box 6: output tax due (GST collected on sales)
  - Box 7: input tax claimed (GST paid on purchases)
  - Box 8: net GST payable / (refundable) = Box 6 - Box 7

Tax is read from posted JournalEntry against the org's configured output/input
tax accounts (falls back to standard codes 2100 / 1200). Net supply/purchase
values are read from revenue / expense account movements over the period.
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.org_defaults import get_default_accounts
from app.models.models import Account, JournalEntry, Transaction

router = APIRouter(prefix="/sg-compliance", tags=["sg-compliance"])


async def _account_net(db, org_id, account_id, start, end):
    """Return (sum_debit, sum_credit) for an account over a posted period."""
    if account_id is None:
        return 0.0, 0.0
    row = (await db.execute(
        select(
            func.coalesce(func.sum(JournalEntry.debit), 0),
            func.coalesce(func.sum(JournalEntry.credit), 0),
        )
        .join(Transaction, JournalEntry.transaction_id == Transaction.id)
        .where(
            JournalEntry.account_id == account_id,
            Transaction.organization_id == org_id,
            Transaction.date >= start, Transaction.date <= end,
            Transaction.is_posted == True,
        )
    )).one()
    return float(row[0]), float(row[1])


async def _type_net(db, org_id, types, start, end):
    """Sum (credit - debit) for all accounts of the given types over the period."""
    rows = (await db.execute(
        select(
            func.coalesce(func.sum(JournalEntry.credit), 0),
            func.coalesce(func.sum(JournalEntry.debit), 0),
        )
        .join(Account, Account.id == JournalEntry.account_id)
        .join(Transaction, JournalEntry.transaction_id == Transaction.id)
        .where(
            Account.organization_id == org_id,
            Account.type.in_(types),
            Transaction.organization_id == org_id,
            Transaction.date >= start, Transaction.date <= end,
            Transaction.is_posted == True,
        )
    )).one()
    return float(rows[0]), float(rows[1])


async def _resolve_account_id(db, org_id, configured_id, fallback_code):
    if configured_id:
        return configured_id
    acct = (await db.execute(
        select(Account).where(Account.organization_id == org_id, Account.code == fallback_code)
    )).scalar_one_or_none()
    return acct.id if acct else None


@router.get("/gst-f5")
async def gst_f5_return(
    quarter_start: str = Query(..., description="YYYY-MM-DD"),
    quarter_end: str = Query(..., description="YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Singapore GST F5 return, computed from the general ledger."""
    org_id = current_user["org_id"]
    start = datetime.fromisoformat(quarter_start).replace(tzinfo=timezone.utc)
    end = datetime.fromisoformat(quarter_end).replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)

    defaults = await get_default_accounts(db, org_id)
    output_tax_id = await _resolve_account_id(db, org_id, defaults.get("output_tax"), "2100")
    input_tax_id = await _resolve_account_id(db, org_id, defaults.get("input_tax"), "1200")

    # Output tax: credit balance on the output-tax account
    ot_dr, ot_cr = await _account_net(db, org_id, output_tax_id, start, end)
    box6_output_tax = round(ot_cr - ot_dr, 2)

    # Input tax: debit balance on the input-tax account
    it_dr, it_cr = await _account_net(db, org_id, input_tax_id, start, end)
    box7_input_tax = round(it_dr - it_cr, 2)

    # Box 1: standard-rated supplies (net revenue)
    rev_cr, rev_dr = await _type_net(db, org_id, ["revenue", "income"], start, end)
    box1_supplies = round(rev_cr - rev_dr, 2)

    # Box 5: taxable purchases (net expense)
    exp_cr, exp_dr = await _type_net(db, org_id, ["expense", "cogs", "cost_of_sales"], start, end)
    box5_purchases = round(exp_dr - exp_cr, 2)

    box8_net = round(box6_output_tax - box7_input_tax, 2)

    return {
        "report_type": "gst_f5",
        "country": "SG",
        "period_start": quarter_start,
        "period_end": quarter_end,
        "currency": "SGD",
        "boxes": {
            "box1_standard_rated_supplies": box1_supplies,
            "box5_taxable_purchases": box5_purchases,
            "box6_output_tax": box6_output_tax,
            "box7_input_tax": box7_input_tax,
            "box8_net_gst_payable": box8_net,
        },
        "net_payable": box8_net if box8_net >= 0 else 0.0,
        "net_refundable": -box8_net if box8_net < 0 else 0.0,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
