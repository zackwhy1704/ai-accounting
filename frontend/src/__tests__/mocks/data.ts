/**
 * Shared mock data for all tests.
 * Rule: when new DB models are added, add corresponding mock factories here.
 */
import { vi } from "vitest"

// ── Organisation / Company ──────────────────────────────────
export const mockOrg = {
  id: "org-001",
  name: "Acme Sdn Bhd",
  uen: "202101234A",
  country: "MY",
  currency: "MYR",
  tax_regime: "MY_SST",
  sst_registration_no: "W10-1234-12345678",
  einvoice_enabled: true,
  fiscal_year_start: "2025-01-01",
  onboarding_completed: true,
  org_type: "sme",
}

export const mockSGOrg = {
  ...mockOrg,
  id: "org-sg-001",
  name: "Acme Pte Ltd",
  country: "SG",
  currency: "SGD",
  tax_regime: "SG_GST",
  sst_registration_no: null,
}

export const mockFirmOrg = {
  ...mockOrg,
  id: "firm-001",
  name: "Best Books Sdn Bhd",
  org_type: "firm",
  slug: "best-books",
  client_portal_enabled: true,
  brand_primary_color: "#4D63FF",
}

// ── Users ───────────────────────────────────────────────────
export const mockUser = {
  id: "user-001",
  email: "admin@acme.com",
  full_name: "Ahmad Zulkifli",
  role: "admin",
  organization_id: "org-001",
}

export const mockClientUser = {
  id: "user-002",
  email: "client@startup.com",
  full_name: "Tan Wei Ming",
  role: "owner",
  organization_id: "org-client-001",
}

// ── Contacts ────────────────────────────────────────────────
export const mockCustomer = {
  id: "contact-001",
  name: "TechCorp Sdn Bhd",
  type: "customer",
  email: "billing@techcorp.com",
  phone: "+60123456789",
  company: "TechCorp Sdn Bhd",
  balance: 5000,
}

export const mockVendor = {
  id: "contact-002",
  name: "Supplies Co",
  type: "vendor",
  email: "ar@supplies.com",
  phone: "+60198765432",
  company: "Supplies Co Sdn Bhd",
  balance: -1200,
}

// ── Accounts (Chart of Accounts) ────────────────────────────
export const mockAccounts = [
  { id: "acc-001", code: "1000", name: "Cash at Bank", type: "asset", account_type: "asset", subtype: "bank", balance: 50000, currency: "MYR", is_active: true },
  { id: "acc-002", code: "1100", name: "Accounts Receivable", type: "asset", account_type: "asset", subtype: "current", balance: 12000, currency: "MYR", is_active: true },
  { id: "acc-003", code: "2000", name: "Accounts Payable", type: "liability", account_type: "liability", subtype: "current", balance: -8000, currency: "MYR", is_active: true },
  { id: "acc-004", code: "3000", name: "Owner's Equity", type: "equity", account_type: "equity", subtype: "owner", balance: 30000, currency: "MYR", is_active: true },
  { id: "acc-005", code: "4000", name: "Sales Revenue", type: "revenue", account_type: "revenue", subtype: "operating", balance: 95000, currency: "MYR", is_active: true },
  { id: "acc-006", code: "5000", name: "COGS", type: "expense", account_type: "expense", subtype: "cogs", balance: 40000, currency: "MYR", is_active: true },
  // Edge case: undefined balance (should render as 0.00)
  { id: "acc-007", code: "5100", name: "Payroll Expense", type: "expense", account_type: "expense", subtype: "operating", balance: undefined, currency: "MYR", is_active: true },
  // Edge case: null account_type
  { id: "acc-008", code: "9999", name: "Suspense Account", type: null, account_type: null, subtype: null, balance: 0, currency: "MYR", is_active: true },
]

// ── Invoices ─────────────────────────────────────────────────
export const mockInvoice = {
  id: "inv-001",
  invoice_number: "INV-2025-001",
  status: "outstanding",
  contact_id: "contact-001",
  contact_name: "TechCorp Sdn Bhd",
  issue_date: "2025-01-01T00:00:00Z",
  due_date: "2025-01-31T00:00:00Z",
  subtotal: 5000,
  tax_amount: 300,
  total: 5300,
  amount_paid: 0,
  currency: "MYR",
  line_items: [
    { id: "li-001", description: "Consulting Jan", quantity: 10, unit_price: 500, account_id: "acc-005", tax_rate: 6, amount: 5000 },
  ],
}

export const mockPaidInvoice = {
  ...mockInvoice,
  id: "inv-002",
  invoice_number: "INV-2025-002",
  status: "paid",
  amount_paid: 5300,
}

export const mockOverdueInvoice = {
  ...mockInvoice,
  id: "inv-003",
  invoice_number: "INV-2025-003",
  status: "overdue",
  due_date: "2024-12-01T00:00:00Z",
}

export const mockDraftInvoice = {
  ...mockInvoice,
  id: "inv-004",
  invoice_number: "INV-2025-004",
  status: "draft",
  total: 0,
  amount_paid: 0,
}

export const mockInvoiceList = [mockInvoice, mockPaidInvoice, mockOverdueInvoice, mockDraftInvoice]

// ── Bills ────────────────────────────────────────────────────
export const mockBill = {
  id: "bill-001",
  bill_number: "BILL-2025-001",
  status: "outstanding",
  contact_id: "contact-002",
  contact_name: "Supplies Co",
  issue_date: "2025-01-05T00:00:00Z",
  due_date: "2025-02-05T00:00:00Z",
  subtotal: 2000,
  tax_amount: 120,
  total: 2120,
  amount_paid: 0,
  currency: "MYR",
}

// ── Bank Accounts ────────────────────────────────────────────
export const mockBankAccount = {
  id: "bank-001",
  name: "Maybank Current",
  account_type: "current",
  bank_name: "Maybank",
  account_number: "5641-2345-6789",
  currency: "MYR",
  opening_balance: 10000,
  current_balance: 58000,
  balance: 58000,
  is_active: true,
}

export const mockBankAccountList = [
  mockBankAccount,
  { ...mockBankAccount, id: "bank-002", name: "CIMB Savings", account_type: "savings", current_balance: 20000 },
]

// ── Bank Transactions ────────────────────────────────────────
export const mockBankTransaction = {
  id: "txn-001",
  transaction_number: "TXN-202501-0001",
  transaction_type: "income",
  transaction_date: "2025-01-10T00:00:00Z",
  description: "Client payment received",
  amount: 5300,
  currency: "MYR",
  bank_account_id: "bank-001",
  contact_id: "contact-001",
  contact_name: "TechCorp Sdn Bhd",
  payment_method: "bank_transfer",
  status: "completed",
}

// ── Manual Journals ──────────────────────────────────────────
export const mockJournal = {
  id: "jnl-001",
  journal_number: "JNL-2025-001",
  date: "2025-01-15T00:00:00Z",
  reference: "ADJ-001",
  description: "Depreciation adjustment",
  status: "posted",
  currency: "MYR",
  lines: [
    { id: "jl-001", account_id: "acc-006", description: "Depreciation", debit: 1000, credit: 0 },
    { id: "jl-002", account_id: "acc-001", description: "Accumulated Dep", debit: 0, credit: 1000 },
  ],
}

export const mockDraftJournal = {
  ...mockJournal,
  id: "jnl-002",
  journal_number: "JNL-2025-002",
  status: "draft",
}

// ── Products ─────────────────────────────────────────────────
export const mockProduct = {
  id: "prod-001",
  name: "Web Development Service",
  sku: "WDS-001",
  type: "service",
  unit_price: 500,
  cost_price: 0,
  currency: "MYR",
  tax_rate: 6,
  is_active: true,
  track_inventory: false,
  stock_quantity: 0,
}

// ── Stock ────────────────────────────────────────────────────
export const mockStockAdjustment = {
  id: "adj-001",
  adjustment_number: "ADJ-202501-0001",
  adjustment_date: "2025-01-20T00:00:00Z",
  reason: "count",
  status: "draft",
  notes: "Monthly stock count",
  lines: [
    { product_id: "prod-001", product_name: "Widget A", quantity_before: 100, quantity_change: -5, quantity_after: 95 },
  ],
}

// ── Reports ──────────────────────────────────────────────────
export const mockTrialBalance = {
  lines: [
    { code: "1000", name: "Cash at Bank", account_type: "asset", debit: 50000, credit: 0 },
    { code: "2000", name: "Accounts Payable", account_type: "liability", debit: 0, credit: 8000 },
    { code: "4000", name: "Sales Revenue", account_type: "revenue", debit: 0, credit: 95000 },
    { code: "5000", name: "COGS", account_type: "expense", debit: 40000, credit: 0 },
    // Edge: null account_type
    { code: "9999", name: "Suspense", account_type: null, debit: 0, credit: 0 },
  ],
  totals: { debit: 90000, credit: 103000 },
  is_balanced: false,
  as_at: "2025-01-31",
}

// ── Firm / White-label ───────────────────────────────────────
export const mockPortalInfo = {
  firm_name: "Best Books Sdn Bhd",
  firm_description: "Trusted bookkeeping for SMEs",
  brand_primary_color: "#4D63FF",
  brand_secondary_color: "#7C9DFF",
  logo_url: null,
  portal_url: "/p/best-books",
  client_portal_enabled: true,
}

// ── API mock helper ──────────────────────────────────────────
export function mockApiGet(data: unknown) {
  return vi.fn().mockResolvedValue({ data })
}

export function mockApiPost(data: unknown) {
  return vi.fn().mockResolvedValue({ data })
}

export function mockApiError(status: number, message: string) {
  return vi.fn().mockRejectedValue({
    response: { status, data: { detail: message } },
  })
}
