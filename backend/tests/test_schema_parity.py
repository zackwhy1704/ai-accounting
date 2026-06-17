"""Schema parity guard: every model table must be created by a migration.

This is the regression guard for the entire "model exists, table doesn't, the
endpoint 500s in prod" class of bug — exactly how bank_statement_lines and
reconciliation_rules slipped through (model added, migration forgotten,
UndefinedTable in production).

It builds a BRAND-NEW temporary database, runs `alembic upgrade head` against
it (NOT the shared dev DB, which may have been hand-migrated), then asserts every
table registered on Base.metadata exists in that freshly-migrated schema.

If a model is added without a migration, this fails — before deploy.
"""
import os
import pytest
import sqlalchemy as sa
from sqlalchemy import text

from app.core.database import Base, _db_url
import app.models.models  # noqa: F401 — register every mapped table on Base.metadata

# A sync URL (alembic + admin DDL use psycopg2, not asyncpg).
_SYNC_URL = _db_url.replace("+asyncpg", "")
_PARITY_DB = "ai_account_parity_test"


def _admin_engine():
    """Engine bound to the default 'postgres' db so we can CREATE/DROP the temp db."""
    base = sa.engine.make_url(_SYNC_URL).set(database="postgres")
    return sa.create_engine(base, isolation_level="AUTOCOMMIT")


def _db_reachable() -> bool:
    try:
        eng = _admin_engine()
        with eng.connect() as c:
            c.execute(text("SELECT 1"))
        eng.dispose()
        return True
    except Exception:
        return False


@pytest.mark.skipif(not _db_reachable(), reason="Postgres not reachable")
def test_every_model_has_a_table_on_a_freshly_migrated_db():
    admin = _admin_engine()
    with admin.connect() as c:
        c.execute(text(f'DROP DATABASE IF EXISTS {_PARITY_DB} WITH (FORCE)'))
        c.execute(text(f'CREATE DATABASE {_PARITY_DB}'))
    admin.dispose()

    parity_url = sa.engine.make_url(_SYNC_URL).set(database=_PARITY_DB)
    try:
        # env.py honours an explicit sqlalchemy.url (falling back to settings only
        # for the placeholder), so point alembic straight at the throwaway DB.
        from alembic.config import Config
        from alembic import command

        backend_dir = os.path.join(os.path.dirname(__file__), "..")
        cfg = Config(os.path.join(backend_dir, "alembic.ini"))
        cfg.set_main_option("script_location", os.path.join(backend_dir, "alembic"))
        cfg.set_main_option("sqlalchemy.url", parity_url.render_as_string(hide_password=False))
        command.upgrade(cfg, "head")

        # Inspect the freshly-migrated schema.
        eng = sa.create_engine(parity_url)
        existing = set(sa.inspect(eng).get_table_names())
        eng.dispose()

        expected = set(Base.metadata.tables.keys())
        missing = expected - existing
        assert not missing, (
            f"{len(missing)} model table(s) have no migration and don't exist on a "
            f"freshly-migrated DB: {sorted(missing)}. Add a migration that creates them."
        )
    finally:
        admin = _admin_engine()
        with admin.connect() as c:
            c.execute(text(f'DROP DATABASE IF EXISTS {_PARITY_DB} WITH (FORCE)'))
        admin.dispose()
