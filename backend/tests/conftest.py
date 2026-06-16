"""
Shared pytest fixtures for ROUTER-LEVEL integration tests.

These run against the configured Postgres (the same engine the app uses). Each
test seeds an isolated organization with a fresh UUID + full standard chart of
accounts + wired default posting accounts, then drives real FastAPI routers via
httpx.AsyncClient with the auth dependency overridden to that org's user.

This is the layer the P0 invoice/bill GL imbalance lived in — the prior
"integration" tests only exercised helpers, never the router path, so the bug
shipped green. These fixtures make that path testable.

If the database is unreachable, the integration tests are skipped (not failed)
so unit-only environments stay green.
"""
import uuid
import pytest
import pytest_asyncio
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import NullPool

from app.core.database import _db_url


# Dedicated test engine with NullPool: pytest-asyncio gives each test its own
# event loop, and a pooled asyncpg connection bound to a prior loop breaks when
# reused. NullPool opens a fresh connection per use, avoiding cross-loop errors.
_test_engine = create_async_engine(_db_url, poolclass=NullPool)
async_session = async_sessionmaker(_test_engine, class_=AsyncSession, expire_on_commit=False)
from app.core.security import get_current_user
from app.models.auth import Organization, User
from app.models.accounting import Account


# Standard chart subset needed for posting (mirrors auth.DEFAULT_ACCOUNTS codes used by GL)
_SEED_ACCOUNTS = [
    ("1000", "Cash at Bank", "asset", "bank"),
    ("1100", "Accounts Receivable", "asset", "current"),
    ("1200", "Input Tax / ITC", "asset", "current"),
    ("2000", "Accounts Payable", "liability", "current"),
    ("2100", "Output Tax Payable", "liability", "current"),
    ("4000", "Sales Revenue", "revenue", "operating"),
    ("5000", "Cost of Goods Sold", "expense", "cogs"),
]


@pytest_asyncio.fixture
async def db_session():
    async with async_session() as s:
        yield s


@pytest_asyncio.fixture
async def org_with_defaults():
    """Seed an isolated org with full COA + wired default posting accounts.

    Returns a dict with org_id, user_id, and the account-id map. Rows persist in
    the test DB (unique per run) — harmless and isolated by org_id filtering.

    If the database is unreachable, the test is skipped (not failed) so
    unit-only environments stay green.
    """
    try:
        async with async_session() as s:
            org = Organization(name=f"IntegTest {uuid.uuid4().hex[:8]}")
            s.add(org)
            await s.flush()

            acct_ids: dict[str, uuid.UUID] = {}
            for code, name, atype, subtype in _SEED_ACCOUNTS:
                a = Account(
                    organization_id=org.id, code=code, name=name,
                    type=atype, subtype=subtype, is_system=True, account_role="account",
                )
                s.add(a)
                await s.flush()
                acct_ids[code] = a.id

            org.default_ar_account_id = acct_ids["1100"]
            org.default_ap_account_id = acct_ids["2000"]
            org.default_bank_account_id = acct_ids["1000"]
            org.default_revenue_account_id = acct_ids["4000"]
            org.default_expense_account_id = acct_ids["5000"]
            org.default_tax_account_id = acct_ids["2100"]
            org.default_input_tax_account_id = acct_ids["1200"]

            user = User(
                organization_id=org.id,
                email=f"integ_{uuid.uuid4().hex[:8]}@test.local",
                hashed_password="x",
                full_name="Integ Test",
                role="admin",
            )
            s.add(user)
            await s.commit()

            return {
                "org_id": org.id,
                "user_id": user.id,
                "accounts": acct_ids,
            }
    except Exception as e:
        # Connection/DB errors -> skip (unit-only env). Real assertion failures
        # inside tests are unaffected (this only wraps the seed step).
        import sqlalchemy.exc as sa_exc
        if isinstance(e, (sa_exc.OperationalError, sa_exc.InterfaceError, ConnectionError, OSError)):
            pytest.skip(f"Database not reachable — skipping router integration test ({type(e).__name__})")
        raise


@pytest_asyncio.fixture
async def client(org_with_defaults):
    """httpx AsyncClient against the app with auth + DB overridden to the seeded org.

    get_db is overridden to use the NullPool test session so the routers under
    test and the test helpers share the same cross-loop-safe engine.
    """
    from httpx import ASGITransport, AsyncClient
    from app.main import app
    from app.core.database import get_db

    async def _fake_user():
        return {
            "sub": str(org_with_defaults["user_id"]),
            "org_id": org_with_defaults["org_id"],
            "role": "admin",
        }

    async def _override_db():
        async with async_session() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_current_user] = _fake_user
    app.dependency_overrides[get_db] = _override_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test/api/v1") as ac:
        yield ac
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_db, None)
