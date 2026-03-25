from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from uuid import UUID
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import Bill, BillLineItem, Account, Transaction, JournalEntry
from app.schemas.schemas import BillCreate, BillResponse

router = APIRouter(prefix="/bills", tags=["Bills"])


@router.get("", response_model=list[BillResponse])
async def list_bills(
    status: str | None = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = current_user["org_id"]
    query = select(Bill).where(Bill.organization_id == org_id).order_by(Bill.created_at.desc())
    if status:
        query = query.where(Bill.status == status)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=BillResponse, status_code=201)
async def create_bill(
    data: BillCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = current_user["org_id"]

    # Calculate totals
    subtotal = 0
    tax_amount = 0
    for item in data.line_items:
        amount = item.quantity * item.unit_price
        tax = amount * (item.tax_rate / 100)
        subtotal += amount
        tax_amount += tax

    bill = Bill(
        organization_id=org_id,
        contact_id=data.contact_id,
        bill_number=data.bill_number,
        issue_date=data.issue_date,
        due_date=data.due_date,
        subtotal=subtotal,
        tax_amount=tax_amount,
        total=subtotal + tax_amount,
        currency=data.currency,
        notes=data.notes,
    )
    db.add(bill)
    await db.flush()

    for i, item in enumerate(data.line_items):
        amount = item.quantity * item.unit_price
        line = BillLineItem(
            bill_id=bill.id,
            description=item.description,
            quantity=item.quantity,
            unit_price=item.unit_price,
            tax_rate=item.tax_rate,
            amount=amount,
            account_id=item.account_id,
            sort_order=i,
        )
        db.add(line)

    # Double-entry: Debit Expense, Credit Accounts Payable
    ap_account = await db.execute(
        select(Account).where(Account.organization_id == org_id, Account.code == "2000")
    )
    ap = ap_account.scalar_one_or_none()

    expense_account = await db.execute(
        select(Account).where(Account.organization_id == org_id, Account.code == "5000")
    )
    exp = expense_account.scalar_one_or_none()

    if ap and exp:
        txn = Transaction(
            organization_id=org_id,
            date=data.issue_date,
            description=f"Bill {bill.bill_number}",
            reference=bill.bill_number,
            source="bill",
            source_id=bill.id,
        )
        db.add(txn)
        await db.flush()

        db.add(JournalEntry(transaction_id=txn.id, account_id=exp.id, debit=subtotal, credit=0))
        db.add(JournalEntry(transaction_id=txn.id, account_id=ap.id, debit=0, credit=subtotal + tax_amount))
        if tax_amount > 0:
            gst_input = await db.execute(
                select(Account).where(Account.organization_id == org_id, Account.code == "1200")
            )
            gst = gst_input.scalar_one_or_none()
            if gst:
                db.add(JournalEntry(transaction_id=txn.id, account_id=gst.id, debit=tax_amount, credit=0))

    return bill


@router.get("/{bill_id}", response_model=BillResponse)
async def get_bill(
    bill_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Bill).where(Bill.id == bill_id, Bill.organization_id == current_user["org_id"])
    )
    bill = result.scalar_one_or_none()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    return bill


@router.patch("/{bill_id}/status")
async def update_bill_status(
    bill_id: UUID,
    status: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Bill).where(Bill.id == bill_id, Bill.organization_id == current_user["org_id"])
    )
    bill = result.scalar_one_or_none()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")

    valid_statuses = {"draft", "received", "approved", "paid", "overdue", "cancelled"}
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")

    bill.status = status

    if status == "paid" and bill.amount_paid < bill.total:
        bill.amount_paid = bill.total
        org_id = current_user["org_id"]
        cash = (await db.execute(select(Account).where(Account.organization_id == org_id, Account.code == "1000"))).scalar_one_or_none()
        ap = (await db.execute(select(Account).where(Account.organization_id == org_id, Account.code == "2000"))).scalar_one_or_none()

        if cash and ap:
            txn = Transaction(
                organization_id=org_id,
                date=bill.due_date,
                description=f"Payment for {bill.bill_number}",
                reference=bill.bill_number,
                source="bill",
                source_id=bill.id,
            )
            db.add(txn)
            await db.flush()
            db.add(JournalEntry(transaction_id=txn.id, account_id=ap.id, debit=float(bill.total), credit=0))
            db.add(JournalEntry(transaction_id=txn.id, account_id=cash.id, debit=0, credit=float(bill.total)))

    return {"status": bill.status}
