# AGENTS.md — AI Accounting Project
> Read this at the start of every session. Update it when you discover something new.

## Project Architecture

| Layer | Stack | Entry point |
|---|---|---|
| Frontend | React + TypeScript + TanStack Query v5 + Vite + Tailwind | `frontend/src/App.tsx` |
| Backend | FastAPI + SQLAlchemy async + PostgreSQL | `backend/app/main.py` |
| DB migrations | Alembic (revision chain: `a001` → `a014` is current head) | `backend/alembic/versions/` |

**Backend runs** on port 8000 with `--reload`. DB on port 5433.  
**Frontend dev server** on port 5173.

---

## Module Map

### Sales (`/sales/*` routes, `backend/app/api/v1/sales.py`)
Quotations → Invoices → DeliveryOrders → CreditNotes → DebitNotes → Payments → Refunds → SaleReceipts → RecurringInvoices

### Purchases (`/purchases/*`, split across multiple files)
PurchaseOrders → GoodsReceivedNotes → Bills → PurchaseCreditNotes(vendor_credits) → PurchaseDebitNotes → PurchasePayments → PurchaseRefunds

### Supporting
Contacts · Products · BankAccounts · BankTransactions · BankTransfers · StockAdjustments · StockTransfers · ManualJournals · ChartOfAccounts

---

## Codebase Conventions

### Frontend patterns
- **List pages**: Standard 3-column filter layout: `[Date Range | Search | Contact Dropdown]` + status Tabs above. `useMemo` for all filtering. See `PurchaseOrdersPage.tsx` as the reference.
- **Hooks**: All API calls go through `frontend/src/lib/hooks.ts`. Query keys are lowercase plural: `['invoices']`, `['credit-notes']`.
- **Toasts**: `const { toast } = useToast()` → `toast("message", "success"|"warning")`. Always wire success AND error toasts.
- **Error surfacing**: `e?.response?.data?.detail ?? "Fallback message"` — never use generic fallbacks alone.
- **Status colours**: Defined per-page as `statusColors: Record<string, string>`. Draft=slate, active=blue, complete=emerald, void/declined=rose.
- **TypeScript**: Run `node_modules/.bin/tsc --noEmit` after every change. Zero errors before commit.
- **Routes**: All defined in `frontend/src/App.tsx`. New pages need both a route AND an import.
- **Nav**: Items defined in `frontend/src/components/layout/nav-data.ts`.

### Backend patterns
- **DB session**: Always `async with` or `Depends(get_db)`. Never forget `await db.commit()`.
- **FK deletes**: Null out FK references before deleting a parent row (see `invoices.py` delete endpoint for the pattern).
- **Status fields**: Invoices use `outstanding/partially paid/paid` (NOT `sent`). CreditNotes use `draft/issued/applied/void`. PurchaseOrders use `draft/sent/received/billed/declined/cancelled`.
- **Numeric fields**: SQLAlchemy `Numeric(15,2)` columns come back as `Decimal`. Always `float()` wrap when doing arithmetic comparisons.
- **Migrations**: New column = new migration file. Never edit existing migration files. Current head: `a014`.

---

## Known Pitfalls

1. **`credit_applied` vs `credit_applications`**: The API returns `credit_applications: []` (array of objects with `id, invoice_id, amount`). The frontend type historically used `applied_to_invoices` — this was a mismatch. Use `credit_applications`.
2. **Invoice status after payment revert**: Always recalculate to `outstanding/partially paid/paid` based on `amount_paid` vs `total`. Never hardcode `"sent"`.
3. **`debit_notes.invoice_id`**: Nullable in model and DB (fixed in migration `a014`). Standalone debit notes don't need an invoice.
4. **FK violation on invoice delete**: Null out `credit_notes.invoice_id`, `debit_notes.invoice_id`, `delivery_orders.invoice_id`, `documents.linked_invoice_id` before deleting an invoice.
5. **VendorCreditsPage deleted**: Replaced by `PurchaseCreditNotesPage`. Route is `/purchases/credit-notes`. New/Edit forms navigate to `/purchases/credit-notes`.
6. **`PurchaseCreditNotesPage` uses `useVendorCredits` hook** (hits `/vendor-credits` API endpoint — same backend table, different route name).
7. **`cn` naming conflict**: In PurchaseCreditNotesPage the CSS utility `cn` from utils is aliased as `cx` to avoid conflict with loop variable `cn`.

---

## File Ownership (agent boundaries)

| Domain | Files |
|---|---|
| Sales list pages | `frontend/src/pages/sales/*/` |
| Purchase list pages | `frontend/src/pages/purchases/` |
| Bank/Stock list pages | `frontend/src/pages/bank/`, `frontend/src/pages/stock/` |
| Sales API | `backend/app/api/v1/sales.py` |
| Purchase APIs | `backend/app/api/v1/bills.py`, `vendor_credits.py`, `purchase_orders.py`, `purchase_payments.py`, `purchase_refunds.py`, `goods_received_notes.py`, `purchase_debit_notes.py` |
| Shared types | `frontend/src/types/index.ts` |
| Hooks | `frontend/src/lib/hooks.ts` |
| Routing | `frontend/src/App.tsx` |
| Nav | `frontend/src/components/layout/nav-data.ts` |
| Migrations | `backend/alembic/versions/` |
