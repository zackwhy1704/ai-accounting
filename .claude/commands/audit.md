---
description: Run comprehensive CRUD + conversion API audit across all 20+ modules, then fix failures
---

Run a full end-to-end API audit of every module and fix any bugs found.

## Pre-flight checks

1. Verify backend is running on `http://localhost:8000`:
   ```
   curl -s http://localhost:8000/api/v1/invoices
   ```
   If connection refused, start it: `cd backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000`

2. Verify postgres container is up: `docker ps | grep ai-accounting-db`
   If missing: `docker-compose up -d db`

3. Get a valid auth token (write it to `/tmp/token.txt`):
   ```bash
   for pw in demo123 password test123 Password123!; do
     resp=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
       -H "Content-Type: application/json" \
       -d "{\"email\":\"demo@aiaccount.com\",\"password\":\"$pw\"}")
     if echo "$resp" | grep -q access_token; then
       echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])" > /tmp/token.txt
       break
     fi
   done
   ```
   If no password works, query the DB for users and ask the user for credentials.

## Execute the audit

Run the audit script at `/tmp/audit_all.sh`. If it doesn't exist, create it using this structure — POSTing to each endpoint with a minimal valid payload, then asserting the response:

**Sales side** (test each):
- `POST /quotations` — include `discount: 10` on a line, assert total reflects 10% off
- `POST /quotations/{id}/convert` with `{"targets":["invoice","delivery_order"]}` — assert both IDs returned AND the resulting invoice preserves `total`, `terms`, and line `discount`
- `POST /invoices` with discount + terms — assert total and terms persisted
- `PATCH /invoices/{id}` — assert terms round-trips
- `PATCH /invoices/{id}/status?status=sent` — assert 200
- `DELETE /invoices/{id}` on a draft — assert 200/204
- `POST /delivery-orders`
- `POST /credit-notes` with `credit_applications` referencing an invoice
- `POST /debit-notes` (standalone, no invoice_id)
- `POST /sales-payments` with `allocations` to an invoice — assert invoice `amount_paid` increases
- `POST /sales-refunds`
- `POST /recurring-invoices`
- `POST /sale-receipts`

**Purchase side**:
- `POST /purchase-orders`
- `POST /goods-received-notes` — note the schema uses `received_date` and `quantity_received` (not `receipt_date`/`quantity`)
- `POST /bills` with discount + terms — assert after-discount total and terms persist
- `POST /vendor-credits` — line items require explicit `amount` field
- `POST /purchase-payments` with allocations
- `POST /purchase-refunds`

**Supporting**:
- `POST /contacts` then `PUT /contacts/{id}` with billing address — assert persists on re-read
- `POST /bank-accounts`
- `POST /products` (endpoint is `/products`, not `/items`)
- `POST /stock-adjustments`
- `POST /stock-transfers`

Each test records PASS or FAIL with a one-line reason.

## Fix + re-audit loop

For every failure:

1. **Read the backend log at `/tmp/backend.log`** (`tail -40` for the tail of the stack trace) to get the real error, not just the HTTP status.
2. Identify the root cause — common categories:
   - Schema/model mismatch (field required in one but not the other)
   - Missing `await db.commit()` after `setattr`
   - Field in model but column missing in DB (run `alembic upgrade head`)
   - Field in DB but NOT NULL when the feature needs optional
   - Undefined variable / missing import
   - Response shape mismatch with frontend expectation
3. Apply a minimal fix — do NOT change unrelated code.
4. Restart backend (`lsof -ti:8000 | xargs kill -9 && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000` backgrounded) and re-run the audit.
5. Repeat until PASS count stops improving.

## Report

Produce a markdown table grouped by Sales / Purchases / Supporting with one row per module showing Create / Update / Discount / Convert / Status / Delete columns (✅ / ✗ / —).

List every bug you fixed with a one-sentence root-cause summary. Distinguish real bugs from test-logic false-positives (e.g., amount_paid=600 when a prior credit note in the same test run already added 100 — the test assumption was wrong, not the code).

## Commit + push

When all real failures are fixed and the audit is green, commit with a message summarizing the audit findings and push to master. Skip if nothing changed.
