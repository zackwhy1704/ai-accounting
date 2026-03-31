/**
 * Tests for Contacts module.
 * Rule: update when ContactsPage or ContactGroupsPage change.
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import { mockCustomer, mockVendor } from "./mocks/data"

vi.mock("@/lib/hooks", () => ({
  useContacts: vi.fn(),
}))
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
const tFn = (k: string) => {
  const map: Record<string, string> = {
    "contacts.title": "Contacts", "contacts.category": "Contacts", "contacts.desc": "",
    "contacts.customers": "Customers", "contacts.vendors": "Vendors", "contacts.groups": "Groups",
    "common.all": "All", "common.export": "Export", "common.search": "Search",
    "contacts.noContacts": "No contacts found",
  }
  return map[k] ?? k
}
vi.mock("@/lib/theme", () => ({ useTheme: () => ({ theme: "light", lang: "en", t: tFn }) }))

import { useContacts } from "@/lib/hooks"
import ContactsPage from "@/pages/contacts/ContactsPage"

function wrapper(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

afterEach(() => { vi.clearAllMocks() })

describe("ContactsPage", () => {
  it("renders page heading", () => {
    vi.mocked(useContacts).mockReturnValue({ data: [], isLoading: false, error: null } as any)
    wrapper(<ContactsPage />)
    expect(screen.getAllByText("Contacts").length).toBeGreaterThan(0)
  })

  it("shows customer contact after load", async () => {
    vi.mocked(useContacts).mockReturnValue({ data: [mockCustomer, mockVendor], isLoading: false, error: null } as any)
    wrapper(<ContactsPage />)
    await waitFor(() =>
      expect(screen.getAllByText("TechCorp Sdn Bhd").length).toBeGreaterThan(0)
    )
  })

  it("shows vendor contact after load", async () => {
    vi.mocked(useContacts).mockReturnValue({ data: [mockCustomer, mockVendor], isLoading: false, error: null } as any)
    wrapper(<ContactsPage />)
    await waitFor(() =>
      expect(screen.getByText("Supplies Co")).toBeInTheDocument()
    )
  })

  it("shows empty state when no contacts", async () => {
    vi.mocked(useContacts).mockReturnValue({ data: [], isLoading: false, error: null } as any)
    wrapper(<ContactsPage />)
    await waitFor(() =>
      expect(screen.getByText(/no contacts/i)).toBeInTheDocument()
    )
  })
})

describe("Contact data integrity", () => {
  it("customer type is 'customer'", () => expect(mockCustomer.type).toBe("customer"))
  it("vendor type is 'vendor'", () => expect(mockVendor.type).toBe("vendor"))
  it("customer has positive balance (they owe us)", () => expect(mockCustomer.balance).toBeGreaterThan(0))
  it("vendor has negative balance (we owe them)", () => expect(mockVendor.balance).toBeLessThan(0))
})
