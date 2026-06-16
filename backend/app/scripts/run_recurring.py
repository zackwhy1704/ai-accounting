"""
One-shot recurring-invoice sweep for Railway's cron service.

Railway runs this daily; it MUST generate due invoices and then EXIT CLEANLY —
if the process stays alive (open DB pool / running loop), Railway skips the next
scheduled run. So we run the sweep in-process, dispose the engine, and exit 0.

Run:  python -m app.scripts.run_recurring

This reuses the EXISTING sweep logic in app.tasks.recurring_tasks._fire_all_due
(the same code path behind POST /recurring-invoices/run-due) — one implementation,
no drift. That sweep already:
  - sweeps ALL orgs' active templates where next_run_date <= now,
  - is idempotent (advances next_run_date in the same per-template transaction,
    so a double-run on the same day can't double-generate),
  - isolates per-template failures (try/except + continue, one bad template can't
    abort the sweep),
  - bounds catch-up at MAX_CATCHUP per template (no runaway back-fill).

Do NOT add Celery beat / apscheduler / a broker for this — the cron service plus
this one-shot script is the whole mechanism.
"""
import asyncio
import logging
import sys

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("run_recurring")


async def main() -> int:
    from app.tasks.recurring_tasks import _fire_all_due
    from app.core.database import engine
    try:
        result = await _fire_all_due()
        logger.info(
            "Recurring sweep complete: generated %s invoice(s) across %s org(s), %s failed",
            result.get("generated", 0), result.get("orgs", 0), result.get("failed", 0),
        )
        return 0
    except Exception:
        logger.exception("Recurring sweep failed")
        return 1
    finally:
        # Critical for Railway cron: release the pool so the process can exit.
        await engine.dispose()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
