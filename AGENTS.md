# AGENTS.md — AI Accounting Project
> Read this at the start of every session. Update it when you discover something new.

## Project Architecture

| Layer | Stack | Entry point |
|---|---|---|
| Frontend | React + TypeScript + TanStack Query v5 + Vite + Tailwind | `frontend/src/App.tsx` |
| Backend | FastAPI + SQLAlchemy async + PostgreSQL | `backend/app/main.py` |
| DB migrations | Alembic — single linear chain (merged at `a002`). Current head: **`a024`** | `backend/alembic/versions/` |

**Backend runs** on port 8000 with `--reload`. DB on port 5433.  
**Frontend dev server** on port 5173.

---

## Module Map

### Sales (`/sales/*` routes, `backend/app/api/v1/sales.py`)
Quotations → Invoices → DeliveryOrders → CreditNotes → DebitNotes → Payments → Refunds → SaleReceipts → RecurringInvoices

### Purchases (`/purchases/*`, split across multiple files)
PurchaseOrders → GoodsReceivedNotes → Bills → PurchaseCreditNotes → PurchaseDebitNotes → PurchasePayments → PurchaseRefunds

- **Purchase credit notes** router: `purchase_credit_notes.py`, prefix `/purchase-credit-notes` (NOT `vendor_credits.py` — that file was deleted in migration `a018`)
- **Hook**: `usePurchaseCreditNotes` hits `/purchase-credit-notes`

### Supporting
Contacts · Products · BankAccounts · BankTransactions · BankTransfers · StockAdjustments · StockTransfers · ManualJournals · ChartOfAccounts

---

## Enforced Rules

These are non-negotiable — verify before every commit:

1. **Every new page needs both a route AND an import in `App.tsx`.** Unknown routes now render a `NotFoundPage` (no longer silently redirect to dashboard), so a missing route is immediately visible.

2. **Financial documents are void-only, never hard-deleted.** Delete endpoints for invoices, bills, credit/debit notes, payments, refunds, and receipts all guard that `status in ("draft", "void")` before allowing delete. Follow the pattern in `invoices.py`. Never remove this guard.

3. **List pages with a data table must have a search input.** Minimum: a `useMemo` keyword filter over visible text columns (description, reference, name). See `BankTransactionsPage.tsx` and `TransactionListPage.tsx` for the pattern.

4. **TypeScript: run `node_modules/.bin/tsc --noEmit` after every TS/TSX change. Zero errors before commit.**

5. **Always `await db.commit()` after every mutation.** Missing commit = data silently not persisted.

---

## Codebase Conventions

### Frontend patterns
- **List pages**: Standard 3-column filter layout: `[Date Range | Search | Contact Dropdown]` + status Tabs above. `useMemo` for all filtering. See `PurchaseOrdersPage.tsx` as the reference.
- **Hooks**: All API calls go through `frontend/src/lib/hooks.ts`. Query keys are lowercase plural: `['invoices']`, `['credit-notes']`.
- **Toasts**: `const { toast } = useToast()` → `toast("message", "success"|"warning")`. Always wire success AND error toasts.
- **Error surfacing**: `e?.response?.data?.detail ?? "Fallback message"` — never use generic fallbacks alone.
- **Status colours**: Defined per-page as `statusColors: Record<string, string>`. Draft=slate, active=blue, complete=emerald, void/declined=rose.
- **Routes**: All defined in `frontend/src/App.tsx`. The catch-all renders `NotFoundPage` — mismatches are visible immediately.
- **Nav**: Items defined in `frontend/src/components/layout/nav-data.ts`.

### Backend patterns
- **DB session**: Always `async with` or `Depends(get_db)`. Never forget `await db.commit()`.
- **FK deletes**: Null out FK references before deleting a parent row (see `invoices.py` delete endpoint for the pattern).
- **Status fields**: Invoices use `outstanding/partially paid/paid` (NOT `sent`). CreditNotes use `draft/issued/applied/void`. PurchaseOrders use `draft/sent/received/billed/declined/cancelled`.
- **Numeric fields**: SQLAlchemy `Numeric(15,2)` columns come back as `Decimal`. Always `float()` wrap when doing arithmetic comparisons.
- **Migrations**: New column = new migration file. Never edit existing migration files. Current head: **`a024`**.
- **Bank account delete**: Blocked if the account has any `BankTransaction` rows (application-level guard in `bank_accounts.py` delete endpoint).

---

## Known Pitfalls

1. **`credit_applied` vs `credit_applications`**: The API returns `credit_applications: []` (array of objects with `id, invoice_id, amount`). Use `credit_applications`, not `applied_to_invoices`.
2. **Invoice status after payment revert**: Always recalculate to `outstanding/partially paid/paid` based on `amount_paid` vs `total`. Never hardcode `"sent"`.
3. **`debit_notes.invoice_id`**: Nullable in model and DB. Standalone debit notes don't need an invoice.
4. **FK violation on invoice delete**: Null out `credit_notes.invoice_id`, `debit_notes.invoice_id`, `delivery_orders.invoice_id`, `documents.linked_invoice_id` before deleting an invoice. See `invoices.py`.
5. **`cn` naming conflict**: In PurchaseCreditNotesPage the CSS utility `cn` from utils is aliased as `cx` to avoid conflict with loop variable `cn`.
6. **PO → Bill conversion silent disabled save**: If a PO line has no `account_id`, the converted bill line inherits an empty account. Validation now happens in `handleSave` with a specific toast (not a disabled button), pointing to the line number missing an account.
7. **ManualJournals has no update endpoint** — only create/post/void. The edit page (`EditManualJournalPage`) only allows editing draft journals before posting.

---

## Service layer (Phase 4 — in progress)

Business math is being moved out of the routers into `backend/app/services/`:

- **`pricing.py`** — pure discount/total/tax math (`line_total`, `line_discount_amount`, `line_after_discount`, `line_tax`, `compute_totals`). No DB/ORM. `invoices.py` and `bills.py` already use it. **Migrating a router off its inline `_disc_amount`: route every line-amount calc through `pricing.py` and keep totals byte-identical.** Covered by `tests/test_pricing_service.py`.
- **Still inline (TODO):** `sales.py`, `purchase_orders.py`, `purchase_debit_notes.py`, `purchase_credit_notes.py` each still have their own discount math. Migrate them onto `pricing.py` in future passes (one router per PR, verify totals don't shift).

## Pydantic schema location (convention)

Two homes for request/response models currently coexist: the central `app/schemas/schemas.py` **and** per-router inline `BaseModel` classes (28 of 42 routers). **Rule going forward: a contract shared by more than one router goes in `schemas.py`; a contract used by exactly one router may stay inline in that router.** Do not mass-move existing inline models in a single pass — relocate opportunistically when you're already editing a router. New shared contracts must go in `schemas.py`.

## Frontend shared line-items editor (Phase 4 — in progress)

`frontend/src/components/line-items/` holds the shared `LineItemsEditor` + `useLineItems` hook (discount mode, tax code, product search, totals). **Bill + Invoice New/Edit pages are migrated as the reference.** The other ~23 line-item pages still hand-roll their editor — migrate them onto the shared component in future passes. When adding a new document-with-lines page, use the shared component, not a hand-rolled copy.

---

## File Ownership (agent boundaries)

| Domain | Files |
|---|---|
| Sales list pages | `frontend/src/pages/sales/*/` |
| Purchase list pages | `frontend/src/pages/purchases/` |
| Bank/Stock list pages | `frontend/src/pages/bank/`, `frontend/src/pages/stock/` |
| Sales API | `backend/app/api/v1/sales.py` |
| Purchase APIs | `backend/app/api/v1/bills.py`, `purchase_credit_notes.py`, `purchase_orders.py`, `purchase_payments.py`, `purchase_refunds.py`, `goods_received_notes.py`, `purchase_debit_notes.py` |
| Shared types | `frontend/src/types/index.ts` |
| Hooks | `frontend/src/lib/hooks.ts` |
| Routing | `frontend/src/App.tsx` |
| Nav | `frontend/src/components/layout/nav-data.ts` |
| Migrations | `backend/alembic/versions/` |
