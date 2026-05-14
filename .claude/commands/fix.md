---
description: Diagnose and fix a bug — find root cause, fix minimally, verify, commit
---

You are the **Debugger**. Your job is to find the root cause and apply the smallest correct fix. Do not touch unrelated code.

## Step 1 — Reproduce

Gather evidence before touching any file:

```bash
# Backend logs (last 50 lines of errors)
tail -50 /tmp/backend.log 2>/dev/null || journalctl -u uvicorn --no-pager -n 50 2>/dev/null

# Check what the API actually returns
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@aiaccount.com","password":"demo123"}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))")
curl -v -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/RELEVANT_ENDPOINT 2>&1 | tail -30

# Check DB state directly
python3 -c "
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy import text
async def q():
    engine = create_async_engine('postgresql+asyncpg://postgres:postgres@localhost:5433/ai_account')
    async with AsyncSession(engine) as db:
        r = await db.execute(text('SELECT <relevant columns> FROM <table> LIMIT 10'))
        [print(row) for row in r.fetchall()]
asyncio.run(q())
"
```

## Step 2 — Classify

Identify which category the bug falls into:

| Category | Symptoms | Where to look |
|---|---|---|
| Schema/model mismatch | 422 Unprocessable Entity | `schemas.py` vs `models.py` field names |
| Missing commit | Data doesn't persist | Missing `await db.commit()` in endpoint |
| FK violation | 500 on delete | Need to null FK refs first — see `invoices.py` pattern |
| Wrong status value | Status goes to wrong state | Check AGENTS.md "Known Pitfalls" #2 |
| Type mismatch | Button always disabled / wrong value | API field name vs frontend type field name |
| Decimal not floated | Arithmetic errors | `float()` wrap all `Numeric` column reads |
| Missing migration | Column not found | `alembic upgrade head` |
| Stale query cache | UI doesn't update | Missing `queryClient.invalidateQueries` |

## Step 3 — Fix

Apply the minimum change. Common fixes:

**FK violation on delete:**
```python
from sqlalchemy import update
await db.execute(update(RelatedModel).where(RelatedModel.fk_col == id).values(fk_col=None))
```

**Invoice status recalculation (never hardcode "sent"):**
```python
inv_total = float(inv.total or 0)
if float(inv.amount_paid) >= inv_total:
    inv.status = "paid"
elif float(inv.amount_paid) > 0:
    inv.status = "partially paid"
else:
    inv.status = "outstanding"
```

**Frontend disabled condition — check both field AND array:**
```tsx
disabled: (row.credit_applied ?? 0) <= 0 && (row.credit_applications?.length ?? 0) <= 0
```

**Missing toast on action:**
```tsx
api.patch(url).then(() => { queryClient.invalidateQueries({...}); toast("Done", "success") })
         .catch((e: any) => toast(e?.response?.data?.detail ?? "Failed", "warning"))
```

## Step 4 — Verify

```bash
# TypeScript (frontend changes)
cd frontend && node_modules/.bin/tsc --noEmit

# Backend import (backend changes)
cd backend && python -c "from app.main import app; print('OK')"

# Migration (DB changes)
cd backend && python -m alembic upgrade head
```

## Step 5 — Commit

```bash
git add <specific files>
git commit -m "fix: <module> — <one-line root cause description>"
git push
```
