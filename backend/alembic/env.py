from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context
from app.core.config import get_settings
from app.core.database import Base
from app.models.models import *  # noqa: Import all models for autogenerate

config = context.config
settings = get_settings()

# Set sqlalchemy.url from settings (use sync driver for migrations)
# Handle both postgresql+asyncpg:// and plain postgresql:// (Railway)
# Allow an explicit override (used by tests that migrate a throwaway DB); fall
# back to settings.DATABASE_URL for normal CLI / deploy runs.
_raw_url = config.get_main_option("sqlalchemy.url")
if not _raw_url or _raw_url.startswith("driver://"):
    _raw_url = settings.DATABASE_URL
sync_url = _raw_url.replace("+asyncpg", "")
if sync_url.startswith("postgres://"):
    sync_url = sync_url.replace("postgres://", "postgresql://", 1)
config.set_main_option("sqlalchemy.url", sync_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
