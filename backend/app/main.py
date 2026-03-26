from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import get_settings
from app.api.v1 import auth, invoices, bills, documents, contacts, accounts, dashboard, billing

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
