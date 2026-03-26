#!/bin/sh

echo "=== Accruly Backend Starting ==="
echo "PORT=${PORT:-8000}"

echo "Running database migrations..."
alembic upgrade head 2>&1 || echo "WARNING: migrations failed"
echo "Migrations complete."

echo "Testing async DB connection..."
python -c "
import asyncio, os
async def test():
    url = os.environ.get('DATABASE_URL', '')
    if url.startswith('postgresql://'):
        url = url.replace('postgresql://', 'postgresql+asyncpg://', 1)
    print(f'Async URL scheme: {url.split(\"@\")[0].split(\"://\")[0]}')
    from sqlalchemy.ext.asyncio import create_async_engine
    eng = create_async_engine(url, echo=False)
    async with eng.connect() as conn:
        result = await conn.execute(__import__('sqlalchemy').text('SELECT 1'))
        print(f'DB test result: {result.scalar()}')
    await eng.dispose()
    print('Async DB connection OK')
asyncio.run(test())
" 2>&1 || echo "FATAL: async DB connection failed"

echo "Testing app import..."
python -c "from app.main import app; print('OK: app imported')" 2>&1 || echo "FATAL: app import failed"

echo "Starting uvicorn on port ${PORT:-8000}..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --log-level info 2>&1
