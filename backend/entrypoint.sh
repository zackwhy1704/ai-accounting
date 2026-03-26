#!/bin/sh
set -e

echo "Running database migrations..."
# Use direct connection for migrations (remove -pooler from hostname if present)
MIGRATION_URL=$(echo "$DATABASE_URL" | sed 's/-pooler\./\./')
DATABASE_URL="$MIGRATION_URL" alembic upgrade head

echo "Starting server on port ${PORT:-8000}..."
exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
