from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import Invoice, Bill, Document, JournalEntry, Account
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
