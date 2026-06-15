"""Income-related reports: P&L, invoice summary, bill summary, payment summary, SST reports."""
import calendar
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import (
    Invoice, Bill, Contact,
    InvoiceLineItem, BillLineItem,
)

router = APIRouter()


@router.get("/profit-loss")
async def profit_loss_report(
    start_date: str = Query(..., description="YYYY-MM-DD"),
    end_date: str = Query(..., description="YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Profit & Loss statement for a date range."""
    org_id = current_user["org_id"]
    start = datetime.fromisoformat(start_date).replace(tzinfo=timezone.utc)
    end = datetime.fromisoformat(end_date).replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)

    # Revenue: paid/partial invoices in period
    inv_result = await db.execute(
        select(func.sum(Invoice.total), func.count(Invoice.id))
        .where(
            Invoice.organization_id == org_id,
            Invoice.issue_date >= start,
            Invoice.issue_date <= end,
            Invoice.status.in_(["outstanding", "partially_paid", "paid"]),
        )
    )
    inv_row = inv_result.one()
    total_revenue = float(inv_row[0] or 0)
    invoice_count = int(inv_row[1] or 0)

    # Expenses: bills in period
    bill_result = await db.execute(
        select(func.sum(Bill.total), func.count(Bill.id))
        .where(
            Bill.organization_id == org_id,
            Bill.bill_date >= start,
            Bill.bill_date <= end,
            Bill.status.in_(["outstanding", "partially_paid", "paid"]),
        )
    )
    bill_row = bill_result.one()
    total_expenses = float(bill_row[0] or 0)
    bill_count = int(bill_row[1] or 0)

    net_income = total_revenue - total_expenses

    return {
        "report_type": "profit_loss",
        "start_date": start_date,
        "end_date": end_date,
        "currency": "MYR",
        "sections": {
            "revenue": {
                "total": total_revenue,
                "invoice_count": invoice_count,
            },
            "expenses": {
                "total": total_expenses,
                "bill_count": bill_count,
            },
        },
        "net_income": net_income,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/invoice-summary")
async def invoice_summary_report(
    start_date: str = Query(...),
    end_date: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Invoice Summary — aggregated invoices by status and customer."""
    org_id = current_user["org_id"]
    start = datetime.fromisoformat(start_date).replace(tzinfo=timezone.utc)
    end = datetime.fromisoformat(end_date).replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)

    result = await db.execute(
        select(
            Contact.name,
            Invoice.status,
            func.count(Invoice.id).label("count"),
            func.sum(Invoice.total).label("total"),
            func.sum(Invoice.amount_paid).label("paid"),
        )
        .join(Contact, Invoice.contact_id == Contact.id, isouter=True)
        .where(
            Invoice.organization_id == org_id,
            Invoice.issue_date >= start,
            Invoice.issue_date <= end,
        )
        .group_by(Contact.name, Invoice.status)
        .order_by(Contact.name)
    )
    rows = result.all()

    items = []
    for row in rows:
        items.append({
            "customer_name": row.name or "Unknown",
            "status": row.status,
            "count": int(row.count),
            "total": float(row.total or 0),
            "amount_paid": float(row.paid or 0),
            "balance": float(row.total or 0) - float(row.paid or 0),
        })

    return {
        "report_type": "invoice_summary",
        "start_date": start_date,
        "end_date": end_date,
        "items": items,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/bill-summary")
async def bill_summary_report(
    start_date: str = Query(...),
    end_date: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Bill Summary — aggregated bills by status and vendor."""
    org_id = current_user["org_id"]
    start = datetime.fromisoformat(start_date).replace(tzinfo=timezone.utc)
    end = datetime.fromisoformat(end_date).replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)

    result = await db.execute(
        select(
            Contact.name,
            Bill.status,
            func.count(Bill.id).label("count"),
            func.sum(Bill.total).label("total"),
            func.sum(Bill.amount_paid).label("paid"),
        )
        .join(Contact, Bill.contact_id == Contact.id, isouter=True)
        .where(
            Bill.organization_id == org_id,
            Bill.bill_date >= start,
            Bill.bill_date <= end,
        )
        .group_by(Contact.name, Bill.status)
        .order_by(Contact.name)
    )
    rows = result.all()

    items = []
    for row in rows:
        items.append({
            "vendor_name": row.name or "Unknown",
            "status": row.status,
            "count": int(row.count),
            "total": float(row.total or 0),
            "amount_paid": float(row.paid or 0),
            "balance": float(row.total or 0) - float(row.paid or 0),
        })

    return {
        "report_type": "bill_summary",
        "start_date": start_date,
        "end_date": end_date,
        "items": items,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/payment-summary")
async def payment_summary_report(
    start_date: str = Query(...),
    end_date: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Payment Summary — sales payments received in period."""
    org_id = current_user["org_id"]
    start = datetime.fromisoformat(start_date).replace(tzinfo=timezone.utc)
    end = datetime.fromisoformat(end_date).replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)

    # Payments are invoices that have been paid
    result = await db.execute(
        select(
            Contact.name,
            func.count(Invoice.id).label("count"),
            func.sum(Invoice.amount_paid).label("total_paid"),
        )
        .join(Contact, Invoice.contact_id == Contact.id, isouter=True)
        .where(
            Invoice.organization_id == org_id,
            Invoice.issue_date >= start,
            Invoice.issue_date <= end,
            Invoice.amount_paid > 0,
        )
        .group_by(Contact.name)
        .order_by(Contact.name)
    )
    rows = result.all()

    items = []
    for row in rows:
        items.append({
            "customer_name": row.name or "Unknown",
            "invoice_count": int(row.count),
            "total_paid": float(row.total_paid or 0),
        })

    return {
        "report_type": "payment_summary",
        "start_date": start_date,
        "end_date": end_date,
        "items": items,
        "total": sum(i["total_paid"] for i in items),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/sst-02")
async def sst02_report(
    from_date: str = Query(..., description="YYYY-MM-DD"),
    to_date: str = Query(..., description="YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """SST-02 Malaysia Sales & Service Tax return summary."""
    org_id = current_user["org_id"]
    start = datetime.fromisoformat(from_date).replace(tzinfo=timezone.utc)
    end = datetime.fromisoformat(to_date).replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)

    # Output tax from invoices (SST on sales)
    inv_result = await db.execute(
        select(
            func.coalesce(func.sum(Invoice.total), 0).label("taxable"),
            func.coalesce(func.sum(Invoice.tax_amount), 0).label("tax"),
        )
        .where(
            Invoice.organization_id == org_id,
            Invoice.issue_date >= start,
            Invoice.issue_date <= end,
            Invoice.status.in_(["outstanding", "partially_paid", "paid"]),
        )
    )
    inv_row = inv_result.one()
    sales_taxable = float(inv_row.taxable)
    sales_tax = float(inv_row.tax)

    # Input tax from bills (SST on purchases)
    bill_result = await db.execute(
        select(
            func.coalesce(func.sum(Bill.total), 0).label("taxable"),
            func.coalesce(func.sum(Bill.tax_amount), 0).label("tax"),
        )
        .where(
            Bill.organization_id == org_id,
            Bill.bill_date >= start,
            Bill.bill_date <= end,
            Bill.status.in_(["outstanding", "partially_paid", "paid"]),
        )
    )
    bill_row = bill_result.one()
    purchase_tax = float(bill_row.tax)

    # Build taxable items — SST 6% and Service Tax 6%
    taxable_items = []
    if sales_taxable > 0 or sales_tax > 0:
        taxable_items.append({
            "rate": "6%",
            "description": "Sales Tax / Service Tax",
            "taxable_amount": sales_taxable,
            "tax_amount": sales_tax,
        })

    net_tax = sales_tax - purchase_tax

    # Due date: last day of month following the quarter end
    end_dt = datetime.fromisoformat(to_date)
    due_month = end_dt.month + 1
    due_year = end_dt.year
    if due_month > 12:
        due_month = 1
        due_year += 1
    due_day = calendar.monthrange(due_year, due_month)[1]
    due_date = f"{due_year}-{due_month:02d}-{due_day:02d}"

    return {
        "report_type": "sst_02",
        "registration_no": None,
        "period_from": from_date,
        "period_to": to_date,
        "due_date": due_date,
        "type_of_return": "Service Tax",
        "taxable_items": taxable_items,
        "total_taxable_amount": sales_taxable,
        "total_tax_payable": sales_tax,
        "total_input_tax": purchase_tax,
        "net_tax_payable": net_tax,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/sst-sales-detail")
async def sst_sales_detail_report(
    start_date: str = Query(..., description="YYYY-MM-DD"),
    end_date: str = Query(..., description="YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """SST Sales Detail — taxable invoice line items."""
    org_id = current_user["org_id"]
    start = datetime.fromisoformat(start_date).replace(tzinfo=timezone.utc)
    end = datetime.fromisoformat(end_date).replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)

    result = await db.execute(
        select(InvoiceLineItem, Invoice, Contact)
        .join(Invoice, InvoiceLineItem.invoice_id == Invoice.id)
        .join(Contact, Invoice.contact_id == Contact.id, isouter=True)
        .where(
            Invoice.organization_id == org_id,
            Invoice.issue_date >= start,
            Invoice.issue_date <= end,
            InvoiceLineItem.tax_rate > 0,
        )
        .order_by(Invoice.issue_date)
    )
    rows = result.all()

    total_taxable = 0.0
    total_tax = 0.0
    items = []

    for line, inv, contact in rows:
        qty = float(line.quantity or 0)
        price = float(line.unit_price or 0)
        taxable_amount = float(line.amount or 0)
        tax_rate = float(line.tax_rate or 0)
        tax_amount = taxable_amount * tax_rate / 100
        total_taxable += taxable_amount
        total_tax += tax_amount
        items.append({
            "invoice_number": inv.invoice_number,
            "date": inv.issue_date.strftime("%Y-%m-%d") if inv.issue_date else None,
            "customer_name": contact.name if contact else "Unknown",
            "description": line.description or "",
            "quantity": qty,
            "unit_price": price,
            "taxable_amount": taxable_amount,
            "tax_rate": tax_rate,
            "tax_amount": tax_amount,
        })

    return {
        "start_date": start_date,
        "end_date": end_date,
        "items": items,
        "total_taxable": total_taxable,
        "total_tax": total_tax,
    }


@router.get("/sst-purchase-detail")
async def sst_purchase_detail_report(
    start_date: str = Query(..., description="YYYY-MM-DD"),
    end_date: str = Query(..., description="YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """SST Purchase Detail — taxable bill line items."""
    org_id = current_user["org_id"]
    start = datetime.fromisoformat(start_date).replace(tzinfo=timezone.utc)
    end = datetime.fromisoformat(end_date).replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)

    result = await db.execute(
        select(BillLineItem, Bill, Contact)
        .join(Bill, BillLineItem.bill_id == Bill.id)
        .join(Contact, Bill.contact_id == Contact.id, isouter=True)
        .where(
            Bill.organization_id == org_id,
            Bill.bill_date >= start,
            Bill.bill_date <= end,
            BillLineItem.tax_rate > 0,
        )
        .order_by(Bill.bill_date)
    )
    rows = result.all()

    total_taxable = 0.0
    total_tax = 0.0
    items = []

    for line, bill, contact in rows:
        qty = float(line.quantity or 0)
        price = float(line.unit_price or 0)
        taxable_amount = float(line.amount or 0)
        tax_rate = float(line.tax_rate or 0)
        tax_amount = taxable_amount * tax_rate / 100
        total_taxable += taxable_amount
        total_tax += tax_amount
        items.append({
            "bill_number": bill.bill_number,
            "date": bill.bill_date.strftime("%Y-%m-%d") if bill.bill_date else None,
            "vendor_name": contact.name if contact else "Unknown",
            "description": line.description or "",
            "quantity": qty,
            "unit_price": price,
            "taxable_amount": taxable_amount,
            "tax_rate": tax_rate,
            "tax_amount": tax_amount,
        })

    return {
        "start_date": start_date,
        "end_date": end_date,
        "items": items,
        "total_taxable": total_taxable,
        "total_tax": total_tax,
    }
