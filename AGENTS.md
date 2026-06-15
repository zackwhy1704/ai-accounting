# CLAUDE.md — AI Accounting Project
> Read this at the start of every session. Update it when you discover something new.

## Project Architecture

| Layer | Stack | Entry point |
|---|---|---|
| Frontend | React 19 + TypeScript + TanStack Query v5 + Vite + Tailwind | `frontend/src/App.tsx` |
| Backend | FastAPI + SQLAlchemy async + PostgreSQL (Neon) | `backend/app/main.py` |
| DB migrations | Alembic — single linear chain. Current head: **`a024`** | `backend/alembic/versions/` |

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

9. **List endpoints return the paginated envelope** `{items, total, page, limit, pages}` using `PaginationParams` + `paginated_result()` from `app.core.pagination`.

10. **Always commit and push after fixes.** Don't wait to be asked.

---

## Canonical Utilities — Use These, Never Roll Your Own

| Utility | Location | Purpose |
|---|---|---|
| `calculate_line_items(items_dicts)` | `app.core.line_items` | Subtotal + discount + tax + total. Returns `(subtotal, tax, discount_total, total)`. |
| `next_sequence_number(db, Model, col, org_id, prefix)` | `app.core.sequences` | Auto-generates INV-00001 style numbers |
| `log_audit(db, org_id, user_id, action, entity_type, entity_id, changes)` | `app.core.audit` | Audit trail — never raises |
| `require_write()` / `require_admin()` | `app.core.permissions` | RBAC FastAPI dependencies |
| `PaginationParams` / `paginated_result()` / `apply_sort()` | `app.core.pagination` | Pagination infra |
| `InvoiceService` / `BillService` | `app.services.*` | Business logic, no FastAPI imports |

---

## Domain Methods on Models

Phase 2A added domain methods to SQLAlchemy models — use them instead of inline logic:

| Model | Methods |
|---|---|
| `Invoice`, `Bill` | `.mark_paid()` · `.balance_due` · `.can_edit()` · `.can_delete()` |
| `CreditNote`, `PurchaseCreditNote` | `.remaining_credit` · `.can_edit()` · `.can_delete()` |
| `ManualJournal` | `.can_edit()` · `.can_delete()` · `.can_post()` · `.can_void()` |
| `TaxRate` | `.rate_decimal` · `.apply_to(amount)` |
| `Organization` | `.is_gst_registered()` · `.is_sst_registered()` · `.effective_tax_regime` |

---

## Pydantic Validators

Phase 2B added validators — these are enforced on every request:

- `InvoiceCreate` / `BillCreate`: requires `len(line_items) >= 1`; `due_date >= issue_date`
- `UserRegister`: email lowercased; password ≥ 8 chars with at least one digit
- `ManualJournalCreate`: requires `len(lines) >= 2`
- `ContactCreate`: name stripped of whitespace; email lowercased

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

---

## Backend Patterns

- **Status values** — Invoice: `draft/outstanding/partially_paid/paid/void`. Bill: same. CreditNote: `draft/issued/applied/void`. PO: `draft/sent/received/billed/declined/cancelled`. Never use `"sent"` for invoice status.
- **Numeric**: SQLAlchemy `Numeric(15,2)` → `Decimal`. Always `float()` wrap in arithmetic.
- **FK deletes**: null out FK references first. Pattern from `invoices.py` delete endpoint.
- **Migrations**: new column = new migration. Never edit existing. Head: **`a024`**.

---

## Error Handling (Phase 7)

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

---

## Test Files

| File | What it covers |
|---|---|
| `tests/test_crud_core.py` | Schema construction, basic CRUD validation |
| `tests/test_model_methods.py` | Domain methods (mark_paid, can_edit, etc.) via proxy classes |
| `tests/test_schema_validators.py` | Pydantic validators (Phase 2B) |
| `tests/test_service_layer.py` | Service classes + `calculate_line_items` utility |
| `tests/test_pagination_and_audit.py` | Pagination envelope, audit log, error handlers |

Run: `cd backend && python -m pytest` — must be **414+ passed, 1 skipped**.

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
