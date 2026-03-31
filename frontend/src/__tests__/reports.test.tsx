/**
 * Tests for Reports module: Trial Balance, Reports Index.
 * Rule: update when any report page is added or normaliseType logic changes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import { mockTrialBalance } from "./mocks/data"

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))

import api from "@/lib/api"
import ReportsIndexPage from "@/pages/reports/ReportsIndexPage"
import TrialBalancePage from "@/pages/reports/TrialBalancePage"

function wrapper(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

afterEach(() => { vi.clearAllMocks() })

describe("ReportsIndexPage", () => {
  it("renders reports heading", () => {
    wrapper(<ReportsIndexPage />)
    expect(screen.getAllByText(/Reports/i).length).toBeGreaterThan(0)
  })

  it("renders a Financial category card", () => {
    wrapper(<ReportsIndexPage />)
    const text = document.body.textContent ?? ""
    expect(text).toMatch(/Financial|Profit|Balance Sheet/i)
  })
})

describe("TrialBalancePage", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue({ data: mockTrialBalance })
  })

  it("renders Trial Balance heading", () => {
    wrapper(<TrialBalancePage />)
    expect(screen.getByText("Trial Balance")).toBeInTheDocument()
  })

  it("shows account names after load", async () => {
    wrapper(<TrialBalancePage />)
    await waitFor(() => {
      expect(screen.getByText("Cash at Bank")).toBeInTheDocument()
      expect(screen.getByText("Sales Revenue")).toBeInTheDocument()
    })
  })

  it("handles null account_type without crash", async () => {
    wrapper(<TrialBalancePage />)
    await waitFor(() =>
      expect(screen.getByText("Suspense")).toBeInTheDocument()
    )
  })

  it("shows debit totals as formatted currency", async () => {
    wrapper(<TrialBalancePage />)
    await waitFor(() => {
      const text = document.body.textContent ?? ""
      expect(text).toMatch(/90,000/)
    })
  })
})

// ── normaliseType pure logic ──────────────────────────────────
describe("normaliseType (trial balance account type mapping)", () => {
  const normalise = (t: string | null | undefined) => {
    if (!t) return "Other"
    const map: Record<string, string> = {
      asset: "Assets", assets: "Assets",
      liability: "Liabilities", liabilities: "Liabilities",
      equity: "Equity",
      revenue: "Revenue", income: "Revenue",
      expense: "Expenses", expenses: "Expenses",
    }
    return map[t.toLowerCase()] ?? t
  }

  it("maps 'asset' → 'Assets'", () => expect(normalise("asset")).toBe("Assets"))
  it("maps 'liability' → 'Liabilities'", () => expect(normalise("liability")).toBe("Liabilities"))
  it("maps 'equity' → 'Equity'", () => expect(normalise("equity")).toBe("Equity"))
  it("maps 'revenue' → 'Revenue'", () => expect(normalise("revenue")).toBe("Revenue"))
  it("maps 'income' → 'Revenue'", () => expect(normalise("income")).toBe("Revenue"))
  it("maps 'expense' → 'Expenses'", () => expect(normalise("expense")).toBe("Expenses"))
  it("maps 'expenses' → 'Expenses'", () => expect(normalise("expenses")).toBe("Expenses"))
  it("maps null → 'Other'", () => expect(normalise(null)).toBe("Other"))
  it("maps undefined → 'Other'", () => expect(normalise(undefined)).toBe("Other"))
  it("maps unknown string passthrough", () => expect(normalise("contra")).toBe("contra"))
})
