# Recurring-invoice cron on Railway

A dedicated Railway **cron service** runs `python -m app.scripts.run_recurring`
once a day. The script sweeps every org's due recurring templates, generates the
invoices, then **exits cleanly**. Railway requires the process to terminate —
if it stays alive, the next scheduled run is skipped.

This is the whole mechanism. There is **no Celery beat, no apscheduler, no extra
broker** for recurring invoices. (Celery, if present, is only for document OCR.)

---

## What the script does (already implemented & tested)

- Reuses `app.tasks.recurring_tasks._fire_all_due` — the same code path as
  `POST /recurring-invoices/run-due`, so there is one implementation, not two.
- Idempotent: advances each template's `next_run_date` in the same transaction
  as the invoice insert, so a double-fire or a manual same-day run cannot
  double-generate. (Covered by `tests/test_run_recurring_script.py`.)
- Per-template error isolation: one failing template is logged and skipped; the
  sweep continues.
- Bounded catch-up: `MAX_CATCHUP = 24` per template, so a stale `next_run_date`
  far in the past can't generate hundreds of invoices.
- Clean shutdown: `await engine.dispose()` then `sys.exit(0/1)`.

Run locally:  `python -m app.scripts.run_recurring`

---

## Railway setup

### 1. Create the cron service (CLI)

From the repo root, with the Railway CLI logged in (`railway login`) and linked to
the project (`railway link`):

```bash
# Create a new service in the SAME project as the backend + Postgres
railway add --service accruly-recurring-cron

# Point it at this repo's backend directory and the cron config file.
# (In the Railway dashboard this is Service → Settings → Config-as-code path.)
#   Root Directory:        backend
#   Railway config file:   railway.cron.json
```

`railway.cron.json` (in `backend/`) already sets:
- `startCommand: python -m app.scripts.run_recurring`
- `restartPolicyType: NEVER`  (one-shot — do not restart on exit)

### 2. Share the database (CLI)

The cron service needs the same `DATABASE_URL` as the backend. Use a Railway
reference variable to the shared Postgres:

```bash
# Reference the Postgres plugin's connection string into the cron service.
railway variables --service accruly-recurring-cron \
  --set 'DATABASE_URL=${{Postgres.DATABASE_URL}}'
```

Also copy any other env the app needs to boot (same as the backend service), e.g.
`SECRET_KEY`. Mirror whatever the backend service has:

```bash
railway variables --service accruly-recurring-cron \
  --set 'SECRET_KEY=${{accruly-backend.SECRET_KEY}}'
```

### 3. Set the cron schedule (ONE manual dashboard step)

Railway's cron schedule is **not settable via CLI/config today** — it is one field
in the dashboard:

> Cron service → **Settings → Cron Schedule** → enter:  `0 17 * * *`

- Railway evaluates cron in **UTC**. `0 17 * * *` = 17:00 UTC = **01:00
  Asia/Singapore** the next day.
- Railway constraints: minimum frequency is 5 minutes; fire times can drift a few
  minutes (fine for a daily sweep); and **the service must exit** or the next run
  is skipped (this script does).

That schedule field is the only step that cannot be scripted. Everything else
above is CLI/config.

---

## Verifying

- Trigger a manual run from the dashboard (or `railway run python -m app.scripts.run_recurring`).
- Check the logs for: `Recurring sweep complete: generated N invoice(s) across M org(s), K failed`.
- Confirm the process exited (no hanging deploy).
