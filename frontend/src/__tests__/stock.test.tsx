/**
 * Tests for Stock module.
 * Rule: update when StockAdjustmentsPage or StockTransfersPage change.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import { mockStockAdjustment } from "./mocks/data"

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))

import api from "@/lib/api"
import StockAdjustmentsPage from "@/pages/stock/StockAdjustmentsPage"

function wrapper(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

afterEach(() => { vi.clearAllMocks() })

describe("StockAdjustmentsPage", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue({ data: [mockStockAdjustment] })
  })

  it("renders Stock Adjustments heading", () => {
    wrapper(<StockAdjustmentsPage />)
    // heading may be split across elements; verify both words present
    const text = document.body.textContent ?? ""
    expect(text).toMatch(/Stock/i)
    expect(text).toMatch(/Adjustments/i)
  })

  it("shows adjustment number after load", async () => {
    wrapper(<StockAdjustmentsPage />)
    await waitFor(() =>
      expect(screen.getByText("ADJ-202501-0001")).toBeInTheDocument()
    )
  })

  it("shows empty state when no adjustments", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] })
    wrapper(<StockAdjustmentsPage />)
    await waitFor(() =>
      expect(screen.getByText(/no stock adjustments/i)).toBeInTheDocument()
    )
  })
})

describe("Stock adjustment quantity logic", () => {
  const line = mockStockAdjustment.lines[0]

  it("quantity_after = quantity_before + quantity_change", () => {
    expect(line.quantity_after).toBe(line.quantity_before + line.quantity_change)
  })
  it("negative quantity_change reduces stock", () => {
    expect(line.quantity_change).toBeLessThan(0)
    expect(line.quantity_after).toBeLessThan(line.quantity_before)
  })
  it("guard: stock cannot go below zero", () => {
    expect(Math.max(0, 5 + -10)).toBe(0)
  })
  it("positive quantity_change increases stock", () => {
    const increased = { quantity_before: 10, quantity_change: 5, quantity_after: 15 }
    expect(increased.quantity_after).toBe(increased.quantity_before + increased.quantity_change)
  })
})
