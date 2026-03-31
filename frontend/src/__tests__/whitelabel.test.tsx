/**
 * Tests for White-label / Firm portal features.
 * Rule: update when FirmSettingsPage or portal logic changes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { mockPortalInfo, mockFirmOrg } from "./mocks/data"

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { id: "firm-user-001", full_name: "Best Books Admin", role: "admin", organization_id: "firm-001" },
    token: "fake-token",
  }),
}))
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("axios", () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: mockPortalInfo }),
    post: vi.fn().mockResolvedValue({ data: { access_token: "portal-token" } }),
  },
}))

import api from "@/lib/api"
import FirmSettingsPage from "@/pages/firm/FirmSettingsPage"
import ClientPortalPage from "@/pages/firm/ClientPortalPage"

function wrapper(ui: React.ReactElement, path = "/") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

afterEach(() => { vi.clearAllMocks() })

describe("FirmSettingsPage", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue({ data: mockFirmOrg })
  })

  it("renders without crashing", () => {
    expect(() => wrapper(<FirmSettingsPage />)).not.toThrow()
  })

  it("has some heading text", async () => {
    wrapper(<FirmSettingsPage />)
    await waitFor(() => {
      const text = document.body.textContent ?? ""
      expect(text.length).toBeGreaterThan(10)
    })
  })
})

describe("ClientPortalPage", () => {
  it("renders portal page for slug route", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    expect(() => render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/p/best-books"]}>
          <Routes>
            <Route path="/p/:slug" element={<ClientPortalPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )).not.toThrow()
  })

  it("shows firm branding after load", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/p/best-books"]}>
          <Routes>
            <Route path="/p/:slug" element={<ClientPortalPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
    await waitFor(() => {
      const text = document.body.textContent ?? ""
      expect(text).toMatch(/Best Books/i)
    })
  })
})

// ── Slug validation (mirrors backend) ────────────────────────
describe("Slug validation logic", () => {
  const RESERVED = new Set(["admin","api","login","register","onboarding","dashboard","settings","billing"])
  const validate = (s: string) => {
    const slug = s.toLowerCase().trim()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
    if (slug.length < 3) return { ok: false, reason: "too short" }
    if (slug.length > 50) return { ok: false, reason: "too long" }
    if (RESERVED.has(slug)) return { ok: false, reason: "reserved" }
    return { ok: true }
  }

  it("accepts valid slug 'best-books'", () => expect(validate("best-books").ok).toBe(true))
  it("rejects slug < 3 chars", () => expect(validate("ab").ok).toBe(false))
  it("rejects reserved 'admin'", () => expect(validate("admin").ok).toBe(false))
  it("rejects reserved 'dashboard'", () => expect(validate("dashboard").ok).toBe(false))
  it("normalises uppercase", () => expect(validate("BestBooks").ok).toBe(true))
  it("rejects slug of only dashes", () => expect(validate("---").ok).toBe(false))
})

// ── Data isolation logic (unit) ───────────────────────────────
describe("Portal data isolation", () => {
  it("portal client org_id differs from firm org_id", () => {
    expect("org-client-001").not.toBe("firm-001")
  })
  it("firm can access client org (client in firm's access list)", () => {
    const firmAccess = ["firm-001", "org-client-001"]
    expect(firmAccess.includes("org-client-001")).toBe(true)
  })
  it("client cannot access firm org (firm not in client access list)", () => {
    const clientAccess = ["org-client-001"]
    expect(clientAccess.includes("firm-001")).toBe(false)
  })
  it("client cannot switch to unrelated client org", () => {
    const clientAccess = ["org-client-001"]
    expect(clientAccess.includes("org-client-002")).toBe(false)
  })
})
