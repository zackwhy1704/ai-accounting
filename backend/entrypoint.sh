#!/bin/sh
set -e

echo "=== Accruly Backend Starting ==="
echo "PORT=${PORT:-8000}"
echo "DATABASE_URL is set: $(test -n "$DATABASE_URL" && echo yes || echo no)"
echo "Python version: $(python --version 2>&1)"

echo "Running database migrations..."
alembic upgrade head 2>&1
echo "Migrations complete."

echo "Testing app import..."
python -c "from app.main import app; print('App imported successfully')" 2>&1

echo "Starting uvicorn on port ${PORT:-8000}..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --log-level info
