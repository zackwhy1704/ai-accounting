---
description: Plan → Code → Verify a new feature end-to-end (backend + frontend + migration + types)
---

You are the **Orchestrator** for a feature build. Run the four phases below in order. Do not skip phases.

## Phase 1 — PLAN (Planner agent role)

Before writing a single line of code:

1. Read `AGENTS.md` for conventions, pitfalls, and file ownership.
2. Identify every file that must change:
   - Backend: model, schema, migration (if new column/table), API endpoint
   - Frontend: hook in `hooks.ts`, type in `types/index.ts`, list page, new/edit form, route in `App.tsx`, nav entry if needed
3. Print a dependency-ordered task list:
   ```
   [ ] 1. Migration — add column X to table Y
   [ ] 2. Model — add field X to SQLAlchemy model
   [ ] 3. Schema — add field X to Pydantic response/create schemas
   [ ] 4. API endpoint — wire field X in create/update/read handlers
   [ ] 5. Frontend type — add X to interface
   [ ] 6. Hook — update query/mutation if endpoint signature changed
   [ ] 7. List page — render X in table, add to filter if filterable
   [ ] 8. Form page — add X to form fields
   [ ] 9. Route — add new page route if new page
   ```
4. Flag any AGENTS.md pitfalls relevant to this feature.
5. **Stop and confirm the plan** — do not proceed to Phase 2 without listing all affected files.

---

## Phase 2 — CODE (Coder agent role)

Execute each task from Phase 1 in dependency order:

**Migration** (if schema change):
- File: `backend/alembic/versions/a0NN_description.py`
- Increment revision from current head (`a014` as of last update — check `alembic heads` first)
- Always set `down_revision` correctly

**Backend changes**:
- Model: `backend/app/models/models.py`
- Schema: `backend/app/schemas/schemas.py`
- API: appropriate file under `backend/app/api/v1/`
- Never forget `await db.commit()` after mutations
- For numeric comparisons always `float()` wrap Decimal columns

**Frontend changes**:
- Types first (`frontend/src/types/index.ts`) — downstream files depend on these
- Hook updates second (`frontend/src/lib/hooks.ts`)
- List page: follow the standard 3-column filter layout from `PurchaseOrdersPage.tsx`
- Form page: match the existing new/edit form pattern

**Constraints**:
- Touch only the files listed in Phase 1
- Do not refactor unrelated code
- Do not add placeholder buttons or stub implementations

---

## Phase 3 — VERIFY (Reviewer + Test agent roles)

Run these checks in order. Fix failures before moving on.

```bash
# 1. TypeScript — zero errors required
cd frontend && node_modules/.bin/tsc --noEmit

# 2. Backend import check
cd backend && python -c "from app.main import app; print('OK')"

# 3. Migration check — confirm new head applies cleanly
cd backend && python -m alembic upgrade head

# 4. Quick smoke test — hit the new endpoint
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@aiaccount.com","password":"demo123"}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))")
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/YOUR_ENDPOINT | python3 -m json.tool | head -30
```

Fix any errors found. Re-run checks after each fix.

---

## Phase 4 — COMMIT

Only commit when all Phase 3 checks pass.

```bash
git add <specific files only — never git add .>
git commit -m "feat: <module> — <one-line summary>

<optional bullet points for non-obvious decisions>"
git push
```
