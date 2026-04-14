from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, cast, Date
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import Invoice, Bill, Document, JournalEntry, Account, Transaction
from app.schemas.schemas import DashboardResponse

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("", response_model=DashboardResponse)
async def get_dashboard(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = current_user["org_id"]

    # Revenue (sum of all revenue account credits)
    revenue_result = await db.execute(
        select(func.coalesce(func.sum(JournalEntry.credit), 0)).join(Account).where(
            Account.organization_id == org_id, Account.type == "revenue"
        )
    )
    total_revenue = float(revenue_result.scalar() or 0)

    # Expenses (sum of all expense account debits)
    expense_result = await db.execute(
        select(func.coalesce(func.sum(JournalEntry.debit), 0)).join(Account).where(
            Account.organization_id == org_id, Account.type == "expense"
        )
    )
    total_expenses = float(expense_result.scalar() or 0)

    # Accounts Receivable
    ar_result = await db.execute(
        select(func.coalesce(func.sum(Invoice.total - Invoice.amount_paid), 0)).where(
            Invoice.organization_id == org_id,
            Invoice.status.in_(["sent", "viewed", "overdue"]),
        )
    )
    accounts_receivable = float(ar_result.scalar() or 0)

    # Accounts Payable
    ap_result = await db.execute(
        select(func.coalesce(func.sum(Bill.total - Bill.amount_paid), 0)).where(
            Bill.organization_id == org_id,
            Bill.status.in_(["received", "approved", "overdue"]),
        )
    )
    accounts_payable = float(ap_result.scalar() or 0)

    # Cash balance (bank account)
    cash_result = await db.execute(
        select(
            func.coalesce(func.sum(JournalEntry.debit), 0) - func.coalesce(func.sum(JournalEntry.credit), 0)
        ).join(Account).where(Account.organization_id == org_id, Account.code == "1000")
    )
    cash_balance = float(cash_result.scalar() or 0)

    # Overdue invoices count
    overdue_result = await db.execute(
        select(func.count(Invoice.id)).where(
            Invoice.organization_id == org_id, Invoice.status == "overdue"
        )
    )
    overdue_invoices = overdue_result.scalar() or 0

    # Pending documents
    pending_docs = await db.execute(
        select(func.count(Document.id)).where(
            Document.organization_id == org_id,
            Document.status.in_(["uploaded", "processing"]),
        )
    )
    pending_documents = pending_docs.scalar() or 0

    return DashboardResponse(
        total_revenue=total_revenue,
        total_expenses=total_expenses,
        net_income=total_revenue - total_expenses,
        accounts_receivable=accounts_receivable,
        accounts_payable=accounts_payable,
        cash_balance=cash_balance,
        overdue_invoices=overdue_invoices,
        pending_documents=pending_documents,
    )


@router.get("/series")
async def get_dashboard_series(
    days: int = 7,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Time-series for dashboard charts: income/expenses/profit_loss/cash by day."""
    org_id = current_user["org_id"]
    days = max(1, min(days, 365))
    today = datetime.now(timezone.utc).date()
    start = today - timedelta(days=days - 1)

    # Build list of dates
    date_list = [start + timedelta(days=i) for i in range(days)]

    date_col = cast(Transaction.date, Date).label("d")

    # Revenue by day (credits to revenue accounts)
    rev_rows = (await db.execute(
        select(date_col, func.coalesce(func.sum(JournalEntry.credit), 0))
        .join(Account, Account.id == JournalEntry.account_id)
        .join(Transaction, Transaction.id == JournalEntry.transaction_id)
        .where(
            Account.organization_id == org_id,
            Account.type == "revenue",
            cast(Transaction.date, Date) >= start,
            cast(Transaction.date, Date) <= today,
        ).group_by(date_col)
    )).all()
    rev_map = {r[0]: float(r[1] or 0) for r in rev_rows}

    # Expenses by day (debits to expense accounts)
    exp_rows = (await db.execute(
        select(date_col, func.coalesce(func.sum(JournalEntry.debit), 0))
        .join(Account, Account.id == JournalEntry.account_id)
        .join(Transaction, Transaction.id == JournalEntry.transaction_id)
        .where(
            Account.organization_id == org_id,
            Account.type == "expense",
            cast(Transaction.date, Date) >= start,
            cast(Transaction.date, Date) <= today,
        ).group_by(date_col)
    )).all()
    exp_map = {r[0]: float(r[1] or 0) for r in exp_rows}

    # Cash flow per day (net change in cash account 1000)
    cash_rows = (await db.execute(
        select(
            date_col,
            func.coalesce(func.sum(JournalEntry.debit), 0) - func.coalesce(func.sum(JournalEntry.credit), 0)
        )
        .join(Account, Account.id == JournalEntry.account_id)
        .join(Transaction, Transaction.id == JournalEntry.transaction_id)
        .where(
            Account.organization_id == org_id,
            Account.code == "1000",
            cast(Transaction.date, Date) >= start,
            cast(Transaction.date, Date) <= today,
        ).group_by(date_col)
    )).all()
    cash_delta_map = {r[0]: float(r[1] or 0) for r in cash_rows}

    # Cash opening balance (before start date)
    opening_result = await db.execute(
        select(
            func.coalesce(func.sum(JournalEntry.debit), 0) - func.coalesce(func.sum(JournalEntry.credit), 0)
        )
        .join(Account, Account.id == JournalEntry.account_id)
        .join(Transaction, Transaction.id == JournalEntry.transaction_id)
        .where(
            Account.organization_id == org_id,
            Account.code == "1000",
            cast(Transaction.date, Date) < start,
        )
    )
    running_cash = float(opening_result.scalar() or 0)

    income_series = []
    expense_series = []
    pl_series = []
    cash_series = []
    for d in date_list:
        inc = rev_map.get(d, 0.0)
        exp = exp_map.get(d, 0.0)
        running_cash += cash_delta_map.get(d, 0.0)
        label = d.strftime("%b %d") if days > 7 else d.strftime("%a")
        income_series.append({"label": label, "value": inc})
        expense_series.append({"label": label, "value": exp})
        pl_series.append({"label": label, "value": inc - exp})
        cash_series.append({"label": label, "value": running_cash})

    return {
        "income": income_series,
        "expenses": expense_series,
        "profit_loss": pl_series,
        "cash": cash_series,
    }
