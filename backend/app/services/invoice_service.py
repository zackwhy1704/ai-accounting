"""Invoice business logic. No FastAPI imports. No HTTP concerns."""
from __future__ import annotations

from uuid import UUID
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.sales import Invoice, InvoiceLineItem
from app.schemas.sales import InvoiceCreate, InvoiceUpdate
from app.core.line_items import calculate_line_items
from app.core.sequences import next_sequence_number
from app.core.audit import log_audit


class InvoiceService:
    def __init__(self, db: AsyncSession, org_id: str | UUID, user_id: str | UUID):
        self.db = db
        self.org_id = str(org_id)
        self.user_id = str(user_id)

    async def create(self, data: InvoiceCreate) -> Invoice:
        number = data.invoice_number or await next_sequence_number(
            self.db, Invoice, Invoice.invoice_number, self.org_id, "INV"
        )
        items = [li.model_dump() for li in data.line_items]
        subtotal, tax_amount, discount_amount, total = calculate_line_items(items)

        invoice = Invoice(
            organization_id=self.org_id,
            invoice_number=number,
            contact_id=data.contact_id,
            issue_date=data.issue_date,
            due_date=data.due_date,
            currency=data.currency or "MYR",
            notes=data.notes,
            terms=data.terms,
            billing_address_line1=data.billing_address_line1,
            billing_address_line2=data.billing_address_line2,
            billing_city=data.billing_city,
            billing_state=data.billing_state,
            billing_postcode=data.billing_postcode,
            billing_country=data.billing_country,
            shipping_address_line1=data.shipping_address_line1,
            shipping_address_line2=data.shipping_address_line2,
            shipping_city=data.shipping_city,
            shipping_state=data.shipping_state,
            shipping_postcode=data.shipping_postcode,
            shipping_country=data.shipping_country,
            subtotal=subtotal,
            tax_amount=tax_amount,
            total=total,
            status="draft",
        )
        self.db.add(invoice)
        await self.db.flush()

        for idx, item in enumerate(items):
            self.db.add(InvoiceLineItem(invoice_id=invoice.id, sort_order=idx, **item))

        await log_audit(self.db, self.org_id, self.user_id, "create", "invoice", invoice.id)
        await self.db.commit()
        result = await self.db.execute(
            select(Invoice)
            .options(selectinload(Invoice.line_items))
            .where(Invoice.id == invoice.id)
        )
        return result.scalar_one()

    async def get(self, invoice_id: UUID) -> Invoice:
        result = await self.db.execute(
            select(Invoice)
            .options(selectinload(Invoice.line_items))
            .where(Invoice.id == invoice_id, Invoice.organization_id == self.org_id)
        )
        invoice = result.scalar_one_or_none()
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")
        return invoice

    async def update(self, invoice_id: UUID, data: InvoiceUpdate) -> Invoice:
        invoice = await self.get(invoice_id)
        if not invoice.can_edit():
            raise HTTPException(
                status_code=400,
                detail=f"Cannot edit invoice with status '{invoice.status}'"
            )

        update_data = data.model_dump(exclude_unset=True)

        if "line_items" in update_data:
            items_data = update_data.pop("line_items")
            items = [li.model_dump() if hasattr(li, "model_dump") else li for li in items_data]
            subtotal, tax_amount, _, total = calculate_line_items(items)
            invoice.subtotal = subtotal
            invoice.tax_amount = tax_amount
            invoice.total = total
            # Replace line items
            await self.db.execute(
                __import__("sqlalchemy", fromlist=["delete"]).delete(InvoiceLineItem)
                .where(InvoiceLineItem.invoice_id == invoice.id)
            )
            for idx, item in enumerate(items):
                self.db.add(InvoiceLineItem(invoice_id=invoice.id, sort_order=idx, **item))

        for key, value in update_data.items():
            setattr(invoice, key, value)

        await log_audit(self.db, self.org_id, self.user_id, "update", "invoice", invoice_id)
        await self.db.commit()
        result = await self.db.execute(
            select(Invoice)
            .options(selectinload(Invoice.line_items))
            .where(Invoice.id == invoice_id)
        )
        return result.scalar_one()

    async def delete(self, invoice_id: UUID) -> None:
        invoice = await self.get(invoice_id)
        if not invoice.can_delete():
            raise HTTPException(
                status_code=400,
                detail=f"Cannot delete invoice with status '{invoice.status}'"
            )
        await log_audit(self.db, self.org_id, self.user_id, "delete", "invoice", invoice_id)
        await self.db.delete(invoice)
        await self.db.commit()
