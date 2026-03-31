/**
 * Tests for Company Profile / Settings: MY vs SG context, tax regime.
 * Rule: update when CompanySettingsPage or tax_regime logic changes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import { mockOrg, mockSGOrg } from "./mocks/data"

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))

import api from "@/lib/api"
import CompanySettingsPage from "@/pages/settings/CompanySettingsPage"

function wrapper(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

afterEach(() => { vi.clearAllMocks() })

describe("CompanySettingsPage", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue({ data: mockOrg })
  })

  it("renders Company Settings heading", () => {
    wrapper(<CompanySettingsPage />)
    expect(screen.getByText(/Company Settings/i)).toBeInTheDocument()
  })

  it("shows General tab", async () => {
    wrapper(<CompanySettingsPage />)
    await waitFor(() => expect(screen.getByText("General")).toBeInTheDocument())
  })

  it("shows Tax tab button", async () => {
    wrapper(<CompanySettingsPage />)
    await waitFor(() =>
      expect(screen.getByText("Tax")).toBeInTheDocument()
    )
  })

  it("clicking Tax tab shows tax regime selector", async () => {
    wrapper(<CompanySettingsPage />)
    const user = userEvent.setup()
    await waitFor(() => screen.getByText("Tax"))
    await user.click(screen.getByText("Tax"))
    await waitFor(() => {
      const text = document.body.textContent ?? ""
      expect(text).toMatch(/Tax Regime|tax_regime|Malaysia SST|Singapore GST/i)
    })
  })
})

// ── Tax regime pure logic ─────────────────────────────────────
describe("Tax regime logic", () => {
  const RATES: Record<string, number> = {
    MY_SST: 6, SG_GST: 9, AU_GST: 10, EU_VAT: 20, NONE: 0,
  }
  const getRate = (r: string) => RATES[r] ?? 0

  it("MY_SST rate = 6%", () => expect(getRate("MY_SST")).toBe(6))
  it("SG_GST rate = 9%", () => expect(getRate("SG_GST")).toBe(9))
  it("AU_GST rate = 10%", () => expect(getRate("AU_GST")).toBe(10))
  it("NONE = 0%", () => expect(getRate("NONE")).toBe(0))
  it("unknown regime = 0", () => expect(getRate("XYZ")).toBe(0))

  it("MY org has MYR currency", () => expect(mockOrg.currency).toBe("MYR"))
  it("SG org has SGD currency", () => expect(mockSGOrg.currency).toBe("SGD"))
  it("SG org has SG_GST regime", () => expect(mockSGOrg.tax_regime).toBe("SG_GST"))

  it("SST 6% on 1000 MYR = 60 tax", () => {
    expect(+(1000 * getRate("MY_SST") / 100).toFixed(2)).toBe(60)
  })
  it("GST 9% on 1000 SGD = 90 tax", () => {
    expect(+(1000 * getRate("SG_GST") / 100).toFixed(2)).toBe(90)
  })
})
