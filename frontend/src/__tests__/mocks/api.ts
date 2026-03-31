/**
 * Mock for lib/api (axios instance).
 * All tests that render components making API calls should import this.
 * Rule: when a new endpoint is added, add a corresponding mock entry below.
 */
import { vi } from "vitest"
import {
  mockAccounts, mockInvoiceList, mockBankAccountList,
  mockBankTransaction, mockJournal, mockDraftJournal,
  mockBill, mockProduct, mockCustomer, mockVendor,
  mockStockAdjustment, mockTrialBalance, mockPortalInfo,
} from "./data"

const api = {
  get: vi.fn((url: string) => {
    if (url === "/accounts") return Promise.resolve({ data: mockAccounts })
    if (url === "/invoices") return Promise.resolve({ data: mockInvoiceList })
    if (url === "/bills") return Promise.resolve({ data: [mockBill] })
    if (url === "/contacts") return Promise.resolve({ data: [mockCustomer, mockVendor] })
    if (url === "/products") return Promise.resolve({ data: [mockProduct] })
    if (url === "/bank-accounts") return Promise.resolve({ data: mockBankAccountList })
    if (url.startsWith("/bank-transactions")) return Promise.resolve({ data: [mockBankTransaction] })
    if (url === "/manual-journals") return Promise.resolve({ data: [mockJournal, mockDraftJournal] })
    if (url.startsWith("/stock-adjustments")) return Promise.resolve({ data: [mockStockAdjustment] })
    if (url.startsWith("/reports?type=trial_balance")) return Promise.resolve({ data: mockTrialBalance })
    if (url.startsWith("/firm/portal/")) return Promise.resolve({ data: mockPortalInfo })
    return Promise.resolve({ data: [] })
  }),
  post: vi.fn(() => Promise.resolve({ data: { id: "new-001" } })),
  patch: vi.fn(() => Promise.resolve({ data: {} })),
  delete: vi.fn(() => Promise.resolve({ data: {} })),
}

export default api
