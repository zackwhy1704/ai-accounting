from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import get_settings
from app.api.v1 import (
    auth, invoices, bills, documents, contacts, accounts, dashboard, billing, firm, sales,
    products, tax_rates, exchange_rates, manual_journals, bank_rules, vendor_credits, sale_receipts, recurring_invoices, einvoice, payment_links, reports, custom_fields, invoice_templates, ai_assist,
    bank_accounts, bank_transactions, bank_transfers_router, stock, fixed_assets, purchase_payments, purchase_refunds, contact_groups, settings_data,
)
from app.api.v1.sharing import router as sharing_router

settings = get_settings()

app = FastAPI(
    title=settings.APP_NAME,
    description="AI-powered cloud accounting software with double-entry bookkeeping",
    version="0.1.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routes
app.include_router(auth.router, prefix=settings.API_V1_PREFIX)
app.include_router(dashboard.router, prefix=settings.API_V1_PREFIX)
app.include_router(invoices.router, prefix=settings.API_V1_PREFIX)
app.include_router(bills.router, prefix=settings.API_V1_PREFIX)
app.include_router(contacts.router, prefix=settings.API_V1_PREFIX)
app.include_router(accounts.router, prefix=settings.API_V1_PREFIX)
app.include_router(documents.router, prefix=settings.API_V1_PREFIX)
app.include_router(billing.router, prefix=settings.API_V1_PREFIX)
app.include_router(firm.router, prefix=settings.API_V1_PREFIX)
app.include_router(sales.router, prefix=settings.API_V1_PREFIX)
app.include_router(products.router, prefix=settings.API_V1_PREFIX)
app.include_router(tax_rates.router, prefix=settings.API_V1_PREFIX)
app.include_router(exchange_rates.router, prefix=settings.API_V1_PREFIX)
app.include_router(manual_journals.router, prefix=settings.API_V1_PREFIX)
app.include_router(bank_rules.router, prefix=settings.API_V1_PREFIX)
app.include_router(vendor_credits.router, prefix=settings.API_V1_PREFIX)
app.include_router(sale_receipts.router, prefix=settings.API_V1_PREFIX)


@app.get("/api/health")
async def health():
    return {"status": "healthy", "app": settings.APP_NAME, "version": "0.1.0"}


@app.get("/api/health/db")
async def health_db():
    """Health check that tests actual DB connectivity."""
    from app.core.database import engine
    from sqlalchemy import text
    try:
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT 1"))
            return {"status": "healthy", "db": "connected", "result": result.scalar()}
    except Exception as e:
        return {"status": "unhealthy", "db": "failed", "error": str(e)}
app.include_router(recurring_invoices.router, prefix=settings.API_V1_PREFIX)
app.include_router(einvoice.router, prefix=settings.API_V1_PREFIX)
app.include_router(payment_links.router, prefix=settings.API_V1_PREFIX)
app.include_router(reports.router, prefix=settings.API_V1_PREFIX)
app.include_router(custom_fields.router, prefix=settings.API_V1_PREFIX)
app.include_router(invoice_templates.router, prefix=settings.API_V1_PREFIX)
app.include_router(ai_assist.router, prefix=settings.API_V1_PREFIX)
app.include_router(bank_accounts.router, prefix=settings.API_V1_PREFIX)
app.include_router(bank_transactions.router, prefix=settings.API_V1_PREFIX)
app.include_router(bank_transfers_router.router, prefix=settings.API_V1_PREFIX)
app.include_router(stock.adjustments_router, prefix=settings.API_V1_PREFIX)
app.include_router(stock.transfers_router, prefix=settings.API_V1_PREFIX)
app.include_router(fixed_assets.router, prefix=settings.API_V1_PREFIX)
app.include_router(purchase_payments.router, prefix=settings.API_V1_PREFIX)
app.include_router(purchase_refunds.router, prefix=settings.API_V1_PREFIX)
app.include_router(contact_groups.router, prefix=settings.API_V1_PREFIX)
app.include_router(settings_data.router, prefix=settings.API_V1_PREFIX)
app.include_router(sharing_router, prefix=settings.API_V1_PREFIX)
