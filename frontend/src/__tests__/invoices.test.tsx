/**
 * Tests for Invoices module.
 * Rule: update when InvoicesPage, NewInvoicePage, or invoice API changes.
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import {
  mockInvoiceList, mockInvoice, mockPaidInvoice,
  mockOverdueInvoice, mockDraftInvoice, mockCustomer,
} from "./mocks/data"

vi.mock("@/lib/hooks", () => ({
  useInvoices: vi.fn(),
  useContacts: vi.fn(),
}))
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
const tFn = (k: string) => {
  const map: Record<string, string> = {
    "invoices.title": "Invoices", "invoices.noInvoices": "No invoices found",
    "invoices.outstanding": "Outstanding", "invoices.paid": "Paid",
    "invoices.overdue": "Overdue", "invoices.draft": "Draft",
    "common.all": "All", "common.export": "Export",
  }
  return map[k] ?? k
}
vi.mock("@/lib/theme", () => ({ useTheme: () => ({ theme: "light", lang: "en", t: tFn }) }))

import { useInvoices, useContacts } from "@/lib/hooks"
import InvoicesPage from "@/pages/invoices/InvoicesPage"

function wrapper(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

afterEach(() => { vi.clearAllMocks() })

describe("InvoicesPage", () => {
  it("renders page heading", () => {
    vi.mocked(useInvoices).mockReturnValue({ data: [], isLoading: false, error: null } as any)
    vi.mocked(useContacts).mockReturnValue({ data: [], isLoading: false, error: null } as any)
    wrapper(<InvoicesPage />)
    expect(screen.getByText("Invoices")).toBeInTheDocument()
  })

  it("shows invoice number after load", async () => {
    vi.mocked(useInvoices).mockReturnValue({ data: mockInvoiceList, isLoading: false, error: null } as any)
    vi.mocked(useContacts).mockReturnValue({ data: [], isLoading: false, error: null } as any)
    wrapper(<InvoicesPage />)
    await waitFor(() =>
      expect(screen.getByText("INV-2025-001")).toBeInTheDocument()
    )
  })

  it("shows customer name in rows", async () => {
    vi.mocked(useInvoices).mockReturnValue({ data: mockInvoiceList, isLoading: false, error: null } as any)
    vi.mocked(useContacts).mockReturnValue({ data: [mockCustomer], isLoading: false, error: null } as any)
    wrapper(<InvoicesPage />)
    await waitFor(() =>
      expect(screen.getAllByText("TechCorp Sdn Bhd").length).toBeGreaterThan(0)
    )
  })

  it("shows status text in list", async () => {
    vi.mocked(useInvoices).mockReturnValue({ data: mockInvoiceList, isLoading: false, error: null } as any)
    vi.mocked(useContacts).mockReturnValue({ data: [], isLoading: false, error: null } as any)
    wrapper(<InvoicesPage />)
    await waitFor(() => {
      const text = document.body.textContent ?? ""
      expect(text).toMatch(/outstanding|paid|overdue|draft/i)
    })
  })

  it("shows empty state when no invoices", async () => {
    vi.mocked(useInvoices).mockReturnValue({ data: [], isLoading: false, error: null } as any)
    vi.mocked(useContacts).mockReturnValue({ data: [], isLoading: false, error: null } as any)
    wrapper(<InvoicesPage />)
    await waitFor(() =>
      expect(screen.getByText(/no invoices/i)).toBeInTheDocument()
    )
  })
})

// ── Invoice business logic (pure, no rendering) ───────────────
describe("Invoice status classification", () => {
  it("outstanding invoice has non-zero balance due", () => {
    expect(mockInvoice.total - mockInvoice.amount_paid).toBe(5300)
  })
  it("paid invoice has zero balance due", () => {
    expect(mockPaidInvoice.total - mockPaidInvoice.amount_paid).toBe(0)
  })
  it("overdue invoice has past due date", () => {
    expect(new Date(mockOverdueInvoice.due_date) < new Date()).toBe(true)
  })
  it("draft invoice has zero total", () => {
    expect(mockDraftInvoice.total).toBe(0)
  })
  it("line items sum to subtotal", () => {
    const sum = mockInvoice.line_items.reduce((s: any, l: any) => s + l.amount, 0)
    expect(sum).toBe(mockInvoice.subtotal)
  })
  it("total = subtotal + tax_amount", () => {
    expect(mockInvoice.total).toBe(mockInvoice.subtotal + mockInvoice.tax_amount)
  })
})
