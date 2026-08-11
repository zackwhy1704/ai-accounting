import traceback
import uuid as _uuid
import time
import logging
from fastapi import FastAPI, Depends, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from sqlalchemy.exc import IntegrityError
from app.core.config import get_settings
from app.core.permissions import require_role
from app.api.v1 import (
    auth, invoices, bills, documents, contacts, accounts, dashboard, billing, firm,
    quotations, delivery_orders, credit_notes, debit_notes, sales_payments, sales_refunds,
    products, tax_rates, exchange_rates, manual_journals, sale_receipts, recurring_invoices, einvoice, einvoice_batch, einvoice_config, payment_links, reports, custom_fields, invoice_templates, ai_assist,
    bank_accounts, bank_transactions, bank_transfers_router, stock, fixed_assets, purchase_payments, purchase_refunds, contact_groups, settings_data, bank_reconciliation,
)
from app.api.v1.adjustments import router as adjustments_router
from app.api.v1.purchase_orders import router as purchase_orders_router
from app.api.v1.goods_received_notes import router as goods_received_notes_router
from app.api.v1.sharing import router as sharing_router
from app.api.v1.invitations import router as invitations_router
from app.api.v1.purchase_debit_notes import router as purchase_debit_notes_router
from app.api.v1.purchase_credit_notes import router as purchase_credit_notes_router
from app.api.v1.vendor_credits import router as vendor_credits_router
from app.api.v1.accounting_period import router as accounting_period_router
from app.api.v1.year_end import router as year_end_router
from app.api.v1.sg_compliance import router as sg_compliance_router

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

logger = logging.getLogger("accruly")


# Preserve normal HTTPException behavior (404/400/401 with detail) so the broad
# Exception handler below does not swallow them into 500s.
@app.exception_handler(StarletteHTTPException)
async def http_exception_passthrough(request: Request, exc: StarletteHTTPException):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    errors = [{"field": ".".join(str(l) for l in e["loc"]), "message": e["msg"]} for e in exc.errors()]
    return JSONResponse(status_code=422, content={"error": "Validation error", "details": errors})


@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError):
    """Turn DB constraint violations into clean 4xx with a human message instead
    of leaking a raw asyncpg/SQLAlchemy 500 to the user's toast. The full error
    is still logged server-side with an id for debugging."""
    error_id = str(_uuid.uuid4())[:8]
    logger.error(f"[{error_id}] IntegrityError on {request.method} {request.url.path}: {exc.orig if hasattr(exc, 'orig') else exc}")
    msg = str(getattr(exc, "orig", exc)).lower()
    if "foreign key" in msg or "violates foreign key" in msg:
        detail = "A referenced record does not exist or belongs to another organization."
        status = 400
    elif "unique" in msg or "duplicate key" in msg:
        detail = "A record with these details already exists."
        status = 409
    elif "not null" in msg or "null value" in msg:
        detail = "A required field is missing."
        status = 400
    else:
        detail = "The request could not be completed due to a data constraint."
        status = 400
    return JSONResponse(status_code=status, content={"detail": detail, "error_id": error_id})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    error_id = str(_uuid.uuid4())[:8]
    traceback.print_exc()
    logger.error(f"[{error_id}] Unhandled exception on {request.method} {request.url.path}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "error_id": error_id, "detail": str(exc) if settings.DEBUG else None},
    )


@app.middleware("http")
async def request_logging(request: Request, call_next):
    request_id = str(_uuid.uuid4())[:8]
    start = time.monotonic()
    response = await call_next(request)
    duration = round((time.monotonic() - start) * 1000, 1)
    logger.info(f"[{request_id}] {request.method} {request.url.path} -> {response.status_code} ({duration}ms)")
    response.headers["X-Request-ID"] = request_id
    return response


_WRITE_METHODS = {"POST", "PATCH", "PUT", "DELETE"}
_RATE_LIMIT_EXEMPT_PREFIXES = (f"{settings.API_V1_PREFIX}/auth", f"{settings.API_V1_PREFIX}/invitations")


@app.middleware("http")
async def org_write_rate_limit(request: Request, call_next):
    """Per-org write rate limiting: 200 mutations/min/org. Protects against a
    compromised token hammering POST /invoices etc. Auth endpoints are exempt
    (they have their own IP limiter)."""
    from fastapi.responses import JSONResponse
    from app.core.rate_limit import org_write_rate_limiter

    path = request.url.path
    if request.method in _WRITE_METHODS and path.startswith(settings.API_V1_PREFIX) \
            and not any(path.startswith(p) for p in _RATE_LIMIT_EXEMPT_PREFIXES):
        auth = request.headers.get("authorization", "")
        if auth.lower().startswith("bearer "):
            org_id = org_write_rate_limiter.org_from_token(auth[7:])
            if org_id and not org_write_rate_limiter.allow(org_id):
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Too many write requests for this organization. Please slow down."},
                    headers={"Retry-After": "60"},
                )
    return await call_next(request)


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
app.include_router(quotations.router, prefix=settings.API_V1_PREFIX)
app.include_router(delivery_orders.router, prefix=settings.API_V1_PREFIX)
app.include_router(credit_notes.router, prefix=settings.API_V1_PREFIX)
app.include_router(debit_notes.router, prefix=settings.API_V1_PREFIX)
app.include_router(sales_payments.router, prefix=settings.API_V1_PREFIX)
app.include_router(sales_refunds.router, prefix=settings.API_V1_PREFIX)
app.include_router(products.router, prefix=settings.API_V1_PREFIX)
app.include_router(tax_rates.router, prefix=settings.API_V1_PREFIX)
app.include_router(exchange_rates.router, prefix=settings.API_V1_PREFIX)
app.include_router(manual_journals.router, prefix=settings.API_V1_PREFIX)
app.include_router(sale_receipts.router, prefix=settings.API_V1_PREFIX)
app.include_router(purchase_debit_notes_router, prefix=settings.API_V1_PREFIX)


@app.get("/health")
async def liveness():
    """Public load-balancer liveness probe — no DB, no counts, no internals."""
    return {"status": "ok"}


@app.get("/api/health")
async def health():
    return {"status": "healthy", "app": settings.APP_NAME, "version": "0.1.0"}


@app.post("/api/health/email")
async def test_email(to: str, current_user: dict = Depends(require_role("owner", "admin"))):
    """Admin-only: send a test email. Usage: POST /api/health/email?to=you@example.com"""
    if not settings.RESEND_API_KEY:
        return {"status": "error", "detail": "RESEND_API_KEY is not set in .env"}
    try:
        import resend
        resend.api_key = settings.RESEND_API_KEY
        result = resend.Emails.send({
            "from": settings.EMAIL_FROM,
            "to": [to],
            "subject": "Accruly — email test",
            "html": "<p>This is a test email from your Accruly backend. If you're seeing this, email sending works! 🎉</p>",
        })
        return {"status": "sent", "resend_id": result.get("id"), "to": to, "from": settings.EMAIL_FROM}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


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


@app.get("/api/health/integrity")
async def health_integrity(request: Request):
    """Accounting integrity indicators for observability/alerting (INTERNAL):
      - unbalanced_transactions: should ALWAYS be 0 (every txn must balance)
      - orgs_missing_gl_defaults: orgs where a GL default account is unset

    Cross-org aggregates — gated behind the X-Internal-Token header matching
    INTERNAL_OPS_TOKEN. Closed (503) when the token isn't configured.
    """
    from fastapi.responses import JSONResponse
    expected = settings.INTERNAL_OPS_TOKEN
    if not expected:
        return JSONResponse(status_code=503, content={"status": "unavailable", "detail": "Integrity endpoint not configured"})
    if request.headers.get("x-internal-token") != expected:
        return JSONResponse(status_code=401, content={"status": "unauthorized"})

    from app.core.database import engine
    from sqlalchemy import text
    try:
        async with engine.connect() as conn:
            unbalanced = (await conn.execute(text(
                """
                SELECT COUNT(*) FROM (
                    SELECT je.transaction_id
                    FROM journal_entries je
                    GROUP BY je.transaction_id
                    HAVING ABS(COALESCE(SUM(je.debit), 0) - COALESCE(SUM(je.credit), 0)) > 0.01
                ) t
                """
            ))).scalar() or 0
            missing_defaults = (await conn.execute(text(
                """
                SELECT COUNT(*) FROM organizations
                WHERE default_ar_account_id IS NULL
                   OR default_ap_account_id IS NULL
                   OR default_revenue_account_id IS NULL
                   OR default_expense_account_id IS NULL
                """
            ))).scalar() or 0
        return {
            "status": "healthy" if unbalanced == 0 else "degraded",
            "unbalanced_transactions": int(unbalanced),
            "orgs_missing_gl_defaults": int(missing_defaults),
        }
    except Exception as e:
        logger.error(f"health/integrity check failed: {e}", exc_info=True)
        return {"status": "unhealthy"}
app.include_router(recurring_invoices.router, prefix=settings.API_V1_PREFIX)
app.include_router(einvoice.router, prefix=settings.API_V1_PREFIX)
app.include_router(einvoice_batch.router, prefix=settings.API_V1_PREFIX)
app.include_router(einvoice_config.router, prefix=settings.API_V1_PREFIX)
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
app.include_router(invitations_router, prefix=settings.API_V1_PREFIX)
app.include_router(purchase_orders_router, prefix=settings.API_V1_PREFIX)
app.include_router(adjustments_router, prefix=settings.API_V1_PREFIX)
app.include_router(goods_received_notes_router, prefix=settings.API_V1_PREFIX)
app.include_router(bank_reconciliation.router, prefix=settings.API_V1_PREFIX)
app.include_router(purchase_credit_notes_router, prefix=settings.API_V1_PREFIX)
app.include_router(vendor_credits_router, prefix=settings.API_V1_PREFIX)
app.include_router(accounting_period_router, prefix=settings.API_V1_PREFIX)
app.include_router(year_end_router, prefix=settings.API_V1_PREFIX)
app.include_router(sg_compliance_router, prefix=settings.API_V1_PREFIX)
