# CLAUDE.md — Accruly Engineering Standards
> Read this at the start of every session. Update it when you discover something new.

## Project Architecture

| Layer | Stack | Entry point |
|---|---|---|
| Frontend | React 19 + TypeScript + TanStack Query v5 + Vite + Tailwind | `frontend/src/App.tsx` |
| Backend | FastAPI + SQLAlchemy async + PostgreSQL (Neon) | `backend/app/main.py` |
| DB migrations | Alembic — single linear chain. Current head: **`a036`** | `backend/alembic/versions/` |

**Backend** on port 8000 with `--reload`. DB on port 5433. **Frontend dev** on port 5173.

---

## Module Map

### Sales
Quotations → Invoices → DeliveryOrders → CreditNotes → DebitNotes → Payments → Refunds → SaleReceipts → RecurringInvoices

### Purchases
PurchaseOrders → GoodsReceivedNotes → Bills → PurchaseCreditNotes → PurchaseDebitNotes → PurchasePayments → PurchaseRefunds

### Supporting
Contacts · Products · BankAccounts · BankTransactions · BankTransfers · StockAdjustments · StockTransfers · ManualJournals · ChartOfAccounts · TaxRates · FixedAssets · ExchangeRates

---

## Non-Negotiable Rules

1. **Every new page needs a route AND an import in `App.tsx`.** Missing route → renders `NotFoundPage` immediately.

2. **Financial documents are void-only, never hard-deleted.** Delete endpoints guard `status in ("draft", "void")`. Never remove this guard.

3. **TypeScript: run `npx tsc --noEmit` after every TS/TSX change. Zero errors before commit.**

4. **Always `await db.commit()` after every mutation.** Missing commit = data silently not persisted.

5. **Routers contain zero business logic.** All arithmetic and status transitions live in services or `app/core/`.

6. **No god files. Max 300 lines per router/service.** Split by domain when exceeded.

7. **All mutation endpoints require `Depends(require_write())` or `Depends(require_admin())`.** GET endpoints use `Depends(get_current_user)`.

8. **All mutation endpoints call `log_audit()` after `await db.commit()`.** Pattern:
   ```python
   await db.commit()
   await log_audit(db, org_id, current_user["sub"], "create", "entity_type", obj.id)
   ```
   **ALWAYS reference the exact variable name — never guess.** Wrong variable = NameError that crashes the endpoint silently.

9. **List endpoints return the paginated envelope** `{items, total, page, limit, pages}` using `PaginationParams` + `paginated_result()` from `app.core.pagination`.

10. **Always commit and push after fixes.** Don't wait to be asked.

11. **Discount is always raw value + mode, NEVER pre-computed.** Payload must send `discount: li.discount, discount_mode: li.discount_mode` — never `discount: lineDiscountAmount(li)`. Backend computes the RM amount from the raw value.

12. **Payment amount = sum of allocations.** When allocations exist, `amount = sum(allocation.amount)`. Never let user-entered amount override allocation sum.

13. **Block `post_gl()` from posting to header/subheader accounts.** Accounts with `account_role in ("header", "subheader")` are structural — they cannot receive journal entries.

14. **`calc_totals()` returns after-discount subtotal.** The signature is `(subtotal_after_disc, discount_total, tax_amount)`. Use `total = subtotal + tax_amount` — NOT `subtotal - discount_total + tax_amount` (that double-deducts). Applies to quotations, credit notes, debit notes, purchase debit notes.

---

## Canonical Utilities — Use These, Never Roll Your Own

| Utility | Location | Purpose |
|---|---|---|
| `calculate_line_items(items_dicts)` | `app.core.line_items` | Returns `(net_subtotal, tax, discount_total, total)`. `net_subtotal` is already after-discount. `total = net_subtotal + tax`. |
| `next_sequence_number(db, Model, col, org_id, prefix)` | `app.core.sequences` | Auto-generates INV-00001 style numbers |
| `log_audit(db, org_id, user_id, action, entity_type, entity_id, changes)` | `app.core.audit` | Audit trail — never raises |
| `require_write()` / `require_admin()` | `app.core.permissions` | RBAC FastAPI dependencies |
| `PaginationParams` / `paginated_result()` / `apply_sort()` | `app.core.pagination` | Pagination infra |
| `InvoiceService` / `BillService` | `app.services.*` | Business logic, no FastAPI imports |
| `post_gl(db, org_id, date, desc, ref, source, source_id, entries)` | `app.api.v1.gl_helpers` | Code-based GL posting (account codes). Guards against non-postable accounts. |
| `post_gl_by_id(db, org_id, ...)` | `app.api.v1.gl_helpers` | UUID-based GL posting. Same guard applies. |

---

## Domain Methods on Models

Use these instead of inline logic:

| Model | Methods |
|---|---|
| `Invoice`, `Bill` | `.mark_paid()` · `.balance_due` · `.can_edit()` · `.can_delete()` |
| `CreditNote`, `PurchaseCreditNote` | `.remaining_credit` · `.can_edit()` · `.can_delete()` |
| `ManualJournal` | `.can_edit()` · `.can_delete()` · `.can_post()` · `.can_void()` |
| `TaxRate` | `.rate_decimal` · `.apply_to(amount)` |
| `Organization` | `.is_gst_registered()` · `.is_sst_registered()` · `.effective_tax_regime` |
| `Account` | `.is_header` · `.is_subheader` · `.is_postable` (based on `account_role`) |

---

## Pydantic Validators (enforced on every request)

- `InvoiceCreate` / `BillCreate`: requires `len(line_items) >= 1`; `due_date >= issue_date`
- `LineItemCreate`: `quantity >= 0`; `discount >= 0`; `discount_mode` must be `"percent"` or `"amount"`; percent discount ≤ 100
- `UserRegister`: email lowercased; password ≥ 8 chars with at least one digit
- `ManualJournalCreate`: requires `len(lines) >= 2`; debits must equal credits (balanced)
- `ContactCreate`: name stripped of whitespace; email lowercased

---

## Account Role System

`accounts.account_role` — introduced in migration `a026`:

| Role | Meaning | Postable? |
|---|---|---|
| `"account"` (default) | Leaf account that receives journal entries | Yes |
| `"header"` | Section header (e.g. "Non-Current Assets") | No |
| `"subheader"` | Sub-section header under a header | No |

`post_gl()` and `post_gl_by_id()` both raise HTTP 400 if a target account has `account_role in ("header", "subheader")`.

ChartOfAccountsPage renders headers in bold uppercase, subheaders in italic semibold, leaf accounts in normal weight — all visually distinct.

---

## Frontend Shared Components

| Component | Location | Use for |
|---|---|---|
| `ListPageFilters` | `components/ui/list-page-filters.tsx` | Status tabs + search + date range + contact filter |
| `DocumentFormHeader` | `components/ui/document-form-header.tsx` | Contact + date + number + currency on create/edit forms |
| `PaginationControls` | `components/ui/pagination-controls.tsx` | Page prev/next with total count |
| `LineItemsEditor` | `components/line-items/` | Shared line-items editor with tax/discount |

---

## Frontend Patterns

- **Hooks**: all in `frontend/src/lib/hooks/`. `makeListHook` creates `.useList()` (backward-compat array) and `.usePage()` (envelope with pagination).
- **Paginated pages**: use `useXxxPage(params)` hooks + `PaginationControls` component.
- **Query invalidation**: always call `queryClient.invalidateQueries({queryKey: ['entity']})` in mutation `onSuccess`.
- **Toast**: `const { toast } = useToast()` → `toast("msg", "success"|"warning")`. Wire both success and error.
- **Error messages**: `e?.response?.data?.detail ?? "Fallback"`.
- **Status colours**: draft=slate, active=sky, outstanding=white, overdue=rose, paid=emerald, void=slate-muted.
- **Routes**: all in `App.tsx`. Nav items in `components/layout/nav-data.ts`.
- **Mutations**: use `await mutateAsync()` in try/catch with explicit navigation — never `.mutate(data, { onSuccess: () => navigate() })` which silently drops navigation on error.
- **Discount payload**: always `discount: li.discount, discount_mode: li.discount_mode`. Never send a pre-computed RM amount.
- **Separate journal-entries from activity**: activity endpoints have `include_journals: bool = Query(False)`. Use the separate `GET /{id}/journal-entries` endpoint to load GL entries independently.

---

## Backend Patterns

- **Status values** — Invoice: `draft/outstanding/partially_paid/paid/void`. Bill: same. CreditNote: `draft/issued/applied/void`. PO: `draft/sent/received/billed/declined/cancelled`. Never use `"sent"` for invoice status.
- **Numeric**: SQLAlchemy `Numeric(15,2)` → `Decimal`. Always `float()` wrap in arithmetic.
- **FK deletes**: null out FK references first. Pattern from `invoices.py` delete endpoint.
- **Migrations**: new column = new migration. Never edit existing. Head: **`a036`**.
- **Year-end close** (`year_end.py`, `/accounting/year-end-close`): zeroes revenue/expense accounts at FY end, plugs net income to Retained Earnings 3100 via `build_close_entries()`, optionally advances the period lock. Cumulative-through-date balances net out prior closes, so re-running for the next FY only sweeps new activity. GET = preview, POST = close (admin), POST /undo deletes the latest close.
- **MyInvois e-Invoice (`a036`)**: routers `einvoice.py` (submit invoice/CN/DN/refund, status, cancel), `einvoice_batch.py` (batch + consolidated), `einvoice_config.py` (config, TIN validation, submissions list). UBL builder is PURE (`services/einvoice_ubl.py`, doc types 01-04); LHDN HTTP + row lifecycle in `services/einvoice_service.py`; tracking rows in `EInvoiceSubmission` (pending→submitted→valid/invalid/cancelled, 72h cancel window via `.can_cancel(now)`). Needs `LHDN_CLIENT_ID`/`LHDN_CLIENT_SECRET` env to reach LHDN — without them network calls 503 cleanly and nothing persists.
- **Multi-currency (FX-1, `a035`)**: every posting document snapshots `exchange_rate` (doc-date rate to org base) at create; `gl_posting` converts all legs to base via `convert_doc_amounts()` (tax leg absorbs rounding so the txn always balances); payments pass `cleared_base` (Σ allocation × booked doc rate) and the realised difference posts to **5900 Foreign Exchange Gain/Loss**. Once a doc is posted its rate is frozen — only drafts re-snapshot. Helpers in `app.services.fx`: `document_rate()`, `to_base()`, `convert_doc_amounts()`.
- **Account filter in reports**: use `JournalEntry` subquery — `select(JournalEntry.transaction_id).where(JournalEntry.account_id == account_id).scalar_subquery()`.

---

## Error Handling

`app/main.py` has three handlers:
1. `StarletteHTTPException` → pass-through with original status code
2. `RequestValidationError` → 422 with `{error, details: [{field, message}]}`
3. `Exception` → 500 with `{error, error_id, detail}` + traceback log

Never swallow exceptions silently in router code — let the handlers surface them.

---

## Known Pitfalls

1. **Invoice status after payment**: always use `inv.mark_paid()` — never hardcode `"sent"`.
2. **`credit_applied` vs `credit_applications`**: API returns `credit_applications: []` (array of `{id, invoice_id, amount}`).
3. **`debit_notes.invoice_id`**: nullable. Standalone debit notes have no invoice.
4. **FK on invoice delete**: null `credit_notes.invoice_id`, `debit_notes.invoice_id`, `delivery_orders.invoice_id`, `documents.linked_invoice_id`.
5. **`cn` naming conflict**: in PurchaseCreditNotesPage, CSS util `cn` is aliased as `cx` to avoid conflict with loop variable.
6. **ManualJournals has no update endpoint** — only create/post/void. Edit page only allows drafts.
7. **SA model methods in tests**: SQLAlchemy descriptors can't be constructed without a session. Use proxy dataclasses in unit tests — see `tests/test_model_methods.py`.
8. **log_audit variable names**: always read the endpoint code and use the exact variable name (`obj.id`, `account.id`, `qid`). Never guess — NameError crashes the create endpoint silently.
9. **DO/SaleReceipt discount payload**: the frontend must send `discount: li.discount, discount_mode: li.discount_mode`, NOT the pre-computed RM value. Backend `calculate_line_items` does the RM math.
10. **Double-discount bug**: `calc_totals()` from `sales.py` already returns `subtotal_after_disc`. Using `total = subtotal - discount_total + tax_amount` double-deducts. Correct: `total = subtotal + tax_amount`.

---

## Test Files

| File | What it covers |
|---|---|
| `tests/test_crud_core.py` | Schema construction, basic CRUD validation |
| `tests/test_model_methods.py` | Domain methods (mark_paid, can_edit, etc.) via proxy classes |
| `tests/test_schema_validators.py` | Pydantic validators (Phase 2B) |
| `tests/test_service_layer.py` | Service classes + `calculate_line_items` utility |
| `tests/test_pagination_and_audit.py` | Pagination envelope, audit log, error handlers |
| `tests/test_bug_fixes.py` | Regression suite: LineItemCreate validators, ManualJournal balance, discount round-trips |

Run: `cd backend && python -m pytest` — must be **430+ passed**.

---

## File Ownership

| Domain | Key files |
|---|---|
| Sales routers | `backend/app/api/v1/invoices.py`, `quotations.py`, `credit_notes.py`, `debit_notes.py`, `delivery_orders.py`, `sales_payments.py`, `sales_refunds.py`, `sale_receipts.py`, `recurring_invoices.py` |
| Purchase routers | `bills.py`, `purchase_orders.py`, `goods_received_notes.py`, `purchase_credit_notes.py`, `purchase_debit_notes.py`, `purchase_payments.py`, `purchase_refunds.py`, `vendor_credits.py` |
| Core utilities | `backend/app/core/` — `line_items.py`, `sequences.py`, `audit.py`, `permissions.py`, `pagination.py` |
| Services | `backend/app/services/` — `invoice_service.py`, `bill_service.py` |
| Shared types | `frontend/src/types/index.ts` |
| Hooks | `frontend/src/lib/hooks/` |
| Routing | `frontend/src/App.tsx` |
| Nav | `frontend/src/components/layout/nav-data.ts` |
| Shared UI | `frontend/src/components/ui/` |
| Migrations | `backend/alembic/versions/` |
| GL helpers | `backend/app/api/v1/gl_helpers.py` |
| Account schemas | `backend/app/schemas/accounting.py` |
