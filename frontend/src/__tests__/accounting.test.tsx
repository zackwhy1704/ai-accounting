/**
 * Tests for Accounting module: Chart of Accounts, Manual Journals.
 * Rule: update when ChartOfAccountsPage, ManualJournalsPage change.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import { mockAccounts, mockJournal, mockDraftJournal } from "./mocks/data"

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))

import api from "@/lib/api"
import ChartOfAccountsPage from "@/pages/accounting/ChartOfAccountsPage"
import ManualJournalsPage from "@/pages/accounting/ManualJournalsPage"

function wrapper(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

afterEach(() => { vi.clearAllMocks() })

// ── Chart of Accounts ─────────────────────────────────────────
describe("ChartOfAccountsPage", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue({ data: mockAccounts })
  })

  it("renders page heading", () => {
    wrapper(<ChartOfAccountsPage />)
    expect(screen.getByText("Chart of Accounts")).toBeInTheDocument()
  })

  it("shows accounts after load", async () => {
    wrapper(<ChartOfAccountsPage />)
    await waitFor(() => {
      expect(screen.getByText("Cash at Bank")).toBeInTheDocument()
      expect(screen.getByText("Sales Revenue")).toBeInTheDocument()
    })
  })

  it("shows RM 0.00 for undefined balance (no crash)", async () => {
    wrapper(<ChartOfAccountsPage />)
    await waitFor(() => {
      expect(screen.getByText("Payroll Expense")).toBeInTheDocument()
    })
    const zeros = screen.getAllByText(/RM 0\.00/)
    expect(zeros.length).toBeGreaterThan(0)
  })

  it("handles null account_type without crashing", async () => {
    wrapper(<ChartOfAccountsPage />)
    await waitFor(() => {
      expect(screen.getByText("Suspense Account")).toBeInTheDocument()
    })
  })

  it("groups accounts into type sections", async () => {
    wrapper(<ChartOfAccountsPage />)
    await waitFor(() => {
      expect(screen.getAllByText("Assets").length).toBeGreaterThan(0)
      expect(screen.getAllByText("Revenue").length).toBeGreaterThan(0)
      expect(screen.getAllByText("Expenses").length).toBeGreaterThan(0)
    })
  })

  it("shows empty state when no accounts", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] })
    wrapper(<ChartOfAccountsPage />)
    await waitFor(() =>
      expect(screen.getByText("No accounts found")).toBeInTheDocument()
    )
  })
})

// ── Manual Journals ───────────────────────────────────────────
describe("ManualJournalsPage", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue({ data: [mockJournal, mockDraftJournal] })
  })

  it("renders page heading", () => {
    wrapper(<ManualJournalsPage />)
    expect(screen.getByText("Manual Journals")).toBeInTheDocument()
  })

  it("shows journal numbers after load", async () => {
    wrapper(<ManualJournalsPage />)
    await waitFor(() => {
      expect(screen.getByText("JNL-2025-001")).toBeInTheDocument()
      expect(screen.getByText("JNL-2025-002")).toBeInTheDocument()
    })
  })

  it("shows capitalised Posted status", async () => {
    wrapper(<ManualJournalsPage />)
    await waitFor(() =>
      expect(screen.getByText("Posted")).toBeInTheDocument()
    )
  })

  it("shows capitalised Draft status", async () => {
    wrapper(<ManualJournalsPage />)
    await waitFor(() =>
      expect(screen.getByText("Draft")).toBeInTheDocument()
    )
  })

  it("handles null status without crashing", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [{ ...mockJournal, status: null }],
    })
    expect(() => wrapper(<ManualJournalsPage />)).not.toThrow()
    await waitFor(() =>
      expect(screen.getByText("—")).toBeInTheDocument()
    )
  })
})
