#!/bin/sh

echo "=== Accruly Backend Starting ==="
echo "PORT=${PORT:-8000}"

echo "Running database migrations..."
alembic upgrade head 2>&1 || echo "WARNING: migrations failed"
echo "Migrations complete."

echo "Testing app import..."
python -c "from app.main import app; print('OK: app imported')" 2>&1 || echo "FATAL: app import failed"

echo "Starting uvicorn on port ${PORT:-8000}..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --log-level info 2>&1
