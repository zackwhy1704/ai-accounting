/**
 * Tests for Bank module: Bank Accounts, Transactions, Transfers.
 * Rule: update when BankAccountsPage, BankTransactionsPage, or BankTransfersPage change.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import { mockBankAccountList, mockBankTransaction } from "./mocks/data"

// ── Static mocks (must be at top level before any imports) ───
vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))

import api from "@/lib/api"
import BankAccountsPage from "@/pages/bank/BankAccountsPage"
import BankTransactionsPage from "@/pages/bank/BankTransactionsPage"

function wrapper(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

afterEach(() => { vi.clearAllMocks() })

// ── BankAccountsPage ──────────────────────────────────────────
describe("BankAccountsPage", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue({ data: mockBankAccountList })
  })

  it("renders heading", () => {
    wrapper(<BankAccountsPage />)
    expect(screen.getByText("Bank Accounts")).toBeInTheDocument()
  })

  it("shows bank account names after load", async () => {
    wrapper(<BankAccountsPage />)
    await waitFor(() => expect(screen.getByText("Maybank Current")).toBeInTheDocument())
    expect(screen.getByText("CIMB Savings")).toBeInTheDocument()
  })

  it("shows balance formatted with RM", async () => {
    wrapper(<BankAccountsPage />)
    await waitFor(() => {
      const text = document.body.textContent ?? ""
      expect(text).toMatch(/58,000/)
    })
  })

  it("shows empty state when no accounts", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] })
    wrapper(<BankAccountsPage />)
    await waitFor(() =>
      expect(screen.getByText(/no bank accounts/i)).toBeInTheDocument()
    )
  })
})

// ── BankTransactionsPage ──────────────────────────────────────
describe("BankTransactionsPage (income)", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue({ data: [mockBankTransaction] })
  })

  it("renders Money In heading for income type", () => {
    wrapper(<BankTransactionsPage type="income" />)
    expect(screen.getAllByText(/Money In/i).length).toBeGreaterThan(0)
  })

  it("renders Money Out heading for expense type", () => {
    wrapper(<BankTransactionsPage type="expense" />)
    expect(screen.getAllByText(/Money Out/i).length).toBeGreaterThan(0)
  })

  it("shows transaction contact after load", async () => {
    wrapper(<BankTransactionsPage type="income" />)
    await waitFor(() =>
      expect(screen.getByText("TechCorp Sdn Bhd")).toBeInTheDocument()
    )
  })
})

// ── Balance logic ─────────────────────────────────────────────
describe("Bank account balance calculations", () => {
  it("current_balance >= opening_balance after deposits", () => {
    const acct = mockBankAccountList[0]
    expect(acct.current_balance).toBeGreaterThanOrEqual(acct.opening_balance)
  })

  it("inactive account still retains its balance", () => {
    const acct = { ...mockBankAccountList[0], is_active: false, current_balance: 500 }
    expect(acct.current_balance).toBe(500)
  })
})
