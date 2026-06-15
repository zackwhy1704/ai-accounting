# UI Smoke Test Checklist — All 37 Submodules

## How to run
1. Start backend: `cd backend && uvicorn app.main:app --reload --port 8000`
2. Start frontend: `cd frontend && npm run dev`
3. Log in as a test org. Navigate to each page and work through each row.

Legend: ✅ pass · ❌ fail · — not applicable

---

## Sales Module

### Invoices (/sales/invoices)
- [ ] List loads with data, not blank or 500 error
- [ ] Search box filters by invoice number or customer name
- [ ] Status tabs (All / Outstanding / Paid / Overdue / Void) filter correctly
- [ ] "New Invoice" opens `/sales/invoices/new`
- [ ] Create: customer + date + 1 line item with 10% discount → Save → total is 90% of subtotal
- [ ] Reopen saved invoice: discount shows 10% (not RM value), total is correct
- [ ] Edit → change notes → Save → notes updated
- [ ] Delete a DRAFT invoice → disappears from list
- [ ] Void a sent/outstanding invoice → status changes to Void
- [ ] Activity tab: shows payment events when a payment is applied
- [ ] Journal Entries tab: shows DR/CR entries (separate from activity)
- [ ] Convert from Quotation: lines and totals match quotation

### Quotations (/sales/quotations)
- [ ] List, search, status filter all work
- [ ] Create with 2+ line items → Save → appears in list
- [ ] Edit draft → change price → Save → total updated
- [ ] Convert to Invoice → invoice created, navigation goes to invoice
- [ ] Delete draft → disappears

### Delivery Orders (/sales/delivery-orders)
- [ ] Create with 10% percent discount → save → reopen → discount is 10% NOT RM amount
- [ ] Create with RM 5 flat discount → save → reopen → discount is 5.00 RM
- [ ] New DO: delivery number field shows "Auto-generated" placeholder (not DO-123456 pre-fill)
- [ ] Edit → Save
- [ ] Delete draft
- [ ] Create from Invoice → lines pre-filled from invoice

### Credit Notes (/sales/credit-notes)
- [ ] Create → Issue → Apply to Invoice → invoice balance reduced
- [ ] Detail page shows list of applications with "Remove" buttons per application
- [ ] Remove ONE application → only that invoice balance restored, CN still applied to others
- [ ] Refund a CN → refund appears in CN Activity timeline
- [ ] Delete draft

### Debit Notes (/sales/debit-notes)
- [ ] Create → Issue
- [ ] Edit → Save
- [ ] Delete draft

### Sales Payments (/sales/payments)
- [ ] Create payment → allocate to invoice(s) → amount field = sum of allocations (auto-synced)
- [ ] Cannot over-allocate beyond invoice balance
- [ ] After save: invoice status updates (partially paid / paid)
- [ ] Void payment → invoice balance restored

### Sales Refunds (/sales/refunds)
- [ ] Create → Save → appears in list
- [ ] Edit → Save
- [ ] Delete draft

### Sale Receipts (/sales/receipts)
- [ ] Create with discount → save → discount round-trips correctly on reopen
- [ ] Edit → Save
- [ ] Delete draft

### Recurring Invoices (/sales/recurring)
- [ ] Create schedule → Save
- [ ] "Run Now" button → generates an invoice → shows generated invoice ID
- [ ] Pause → status changes to Paused
- [ ] Resume → status changes to Active
- [ ] Edit schedule → Save
- [ ] Cancel/delete → disappears

---

## Purchase Module

### Purchase Orders (/purchases/orders)
- [ ] Create → Save → appears in list
- [ ] Edit draft → Save
- [ ] Convert to GRN → GRN created with PO lines
- [ ] Convert to Bill → Bill pre-filled from PO
- [ ] Delete draft → disappears

### Goods Received Notes (/purchases/grn)
- [ ] Create standalone → Save
- [ ] Link to PO → lines pre-filled
- [ ] Confirm → status changes to Confirmed
- [ ] Edit draft → Save
- [ ] Delete draft → disappears

### Bills (/purchases/bills)
- [ ] Convert from PO → opens with PO lines → Save as DRAFT even if lines have no account
- [ ] Edit → add GL account to lines → Issue
- [ ] Apply purchase payment → bill status changes

### Purchase Credit Notes (/purchases/credit-notes)
- [ ] Create → Apply to Bill → bill balance reduced
- [ ] Detail/edit shows per-application Remove buttons
- [ ] Remove ONE application → only that bill balance restored

### Purchase Debit Notes (/purchases/debit-notes)
- [ ] Create → Apply to Bill
- [ ] Edit → Save

### Purchase Payments (/purchases/payments)
- [ ] Create → allocate to bill(s) → amount = allocation sum (auto-synced)
- [ ] After save: bill status updates

### Purchase Refunds (/purchases/refunds)
- [ ] Create → Save
- [ ] Edit → Save

---

## Accounting Module

### Manual Journals (/accounting/journals)
- [ ] Create balanced journal (debit sum = credit sum) → Post → status = Posted
- [ ] Unbalanced journal rejected at save with clear error message
- [ ] Edit DRAFT → Save
- [ ] Delete DRAFT → row disappears (Delete action is visible only for draft status)
- [ ] Void POSTED → creates reversal transaction in GL
- [ ] After posting: navigates to /accounting/journals (not dashboard)

### Chart of Accounts (/accounting/chart-of-accounts)
- [ ] Create a HEADER account → appears bold/uppercase, Role badge shows "Header"
- [ ] Create a SUBHEADER → appears italic/semibold, Role badge shows "Subheader"
- [ ] Create a normal ACCOUNT → Role badge shows "Account"
- [ ] Edit any account → change Role → Save → role badge updates
- [ ] Delete non-system account → disappears

### Tax Codes (/accounting/tax-codes)
- [ ] Create tax code → Save
- [ ] Edit → Save
- [ ] Delete non-system tax code

### Fixed Assets (/accounting/fixed-assets)
- [ ] Create asset → Activate
- [ ] Record Depreciation → GL journal entry posted (DR Depreciation Expense, CR Accumulated Depr)
- [ ] Edit → Save
- [ ] Dispose → asset marked disposed, GL entry posted

---

## Bank Module

### Bank Accounts (/bank/accounts)
- [ ] Create → Save (must succeed, no 500 error)
- [ ] Edit → Save
- [ ] Delete account with no transactions → succeeds

### Bank Transactions (/bank/transactions)
- [ ] Create income transaction → Save → appears in list
- [ ] Create expense transaction → Save
- [ ] Search by description → filters
- [ ] Edit → Save

### Bank Transfers (/bank/transfers)
- [ ] Create transfer between two accounts → Save
- [ ] Source account balance decreases, destination balance increases
- [ ] Edit → Save

---

## Contacts & Products

### Contacts (/contacts)
- [ ] Create customer → Save
- [ ] Create vendor → Save
- [ ] Search by name/email → filters
- [ ] Edit billing address → Save → address persists on reopen
- [ ] Delete non-referenced contact

### Contact Groups (/contacts/groups)
- [ ] Create group → Save
- [ ] Edit → Save
- [ ] Delete

### Products (/products)
- [ ] Create product → Save
- [ ] Search by name → filters
- [ ] Edit → Save
- [ ] Delete

---

## Stock Module

### Stock Adjustments (/stock/adjustments)
- [ ] Create → Save → status = draft
- [ ] Edit draft → Save
- [ ] Confirm → status = confirmed, product qty_on_hand updates
- [ ] DELETE draft (Trash action visible in row menu when status=draft) → disappears
- [ ] Void confirmed → status = void

### Stock Transfers (/stock/transfers)
- [ ] Create → Save → status = draft
- [ ] Edit draft → Save
- [ ] Complete → product qtys updated (source decreases, destination increases)
- [ ] DELETE draft (Trash action visible in row menu when status=draft) → disappears

---

## Settings

### Invoice Templates (/settings/invoice-templates)
- [ ] Create → Save
- [ ] Edit → Save
- [ ] Delete

### Custom Fields (/settings/custom-fields)
- [ ] Create field → Save
- [ ] Delete

### Payment Links (/settings/payment-links)
- [ ] Page loads without error
- [ ] Create link with amount + description → Save → "Link copied to clipboard"
- [ ] Copy URL → paste in browser → payment page loads (or 200 response)
- [ ] Deactivate toggle → status badge changes to Inactive
- [ ] Edit description → Save
- [ ] Delete → disappears

### Exchange Rates (/settings/exchange-rates)
- [ ] Page loads without error
- [ ] "Sync Rates" button → populates USD→MYR and USD→SGD rows from live API
- [ ] Add manual rate (e.g. EUR→MYR, 4.98) → appears with "manual" badge
- [ ] Edit rate inline → Save → rate updated with 6 decimal precision
- [ ] Delete → disappears

---

## Reports

### P&L (/reports/profit-loss)
- [ ] Renders for selected date range
- [ ] Revenue and expense sections populated

### Trial Balance (/reports/trial-balance)
- [ ] Renders with debit/credit columns balancing

### General Ledger (/reports/general-ledger or /reports/ledger)
- [ ] Filter to specific account → shows only that account's entries

### Transaction List (/reports/transaction-list)
- [ ] Filter by account → shows only transactions touching that account
- [ ] Search box filters by description/reference

### AR Ageing (/reports/ar-ageing)
- [ ] Renders with customer rows and ageing buckets

### AP Ageing (/reports/ap-ageing)
- [ ] Renders with vendor rows and ageing buckets

---

## Accounting Integrity Queries
Run these directly against PostgreSQL after a full smoke test session:

```sql
-- 1. All GL transactions must balance
SELECT t.id, t.description,
  SUM(je.debit) total_debit, SUM(je.credit) total_credit,
  ABS(SUM(je.debit) - SUM(je.credit)) imbalance
FROM transactions t
JOIN journal_entries je ON je.transaction_id = t.id
GROUP BY t.id, t.description
HAVING ABS(SUM(je.debit) - SUM(je.credit)) > 0.01;
-- Must return 0 rows

-- 2. Payment allocations match payment total
SELECT sp.id, sp.payment_number, sp.amount,
  COALESCE(SUM(pa.amount), 0) allocated,
  ABS(sp.amount - COALESCE(SUM(pa.amount), 0)) diff
FROM sales_payments sp
LEFT JOIN payment_allocations pa ON pa.payment_id = sp.id
WHERE sp.status != 'void'
GROUP BY sp.id, sp.payment_number, sp.amount
HAVING ABS(sp.amount - COALESCE(SUM(pa.amount), 0)) > 0.01;
-- Must return 0 rows

-- 3. Credit note applied amounts match applications
SELECT cn.id, cn.credit_note_number, cn.credit_applied,
  COALESCE(SUM(ca.amount), 0) actual,
  ABS(cn.credit_applied - COALESCE(SUM(ca.amount), 0)) diff
FROM credit_notes cn
LEFT JOIN credit_applications ca ON ca.credit_note_id = cn.id
WHERE cn.status != 'void'
GROUP BY cn.id, cn.credit_note_number, cn.credit_applied
HAVING ABS(cn.credit_applied - COALESCE(SUM(ca.amount), 0)) > 0.01;
-- Must return 0 rows
```
