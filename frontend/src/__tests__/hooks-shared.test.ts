/**
 * Tests for lib/hooks/_shared.ts — makeListHook, usePage, Paginated type.
 *
 * These tests verify:
 * 1. The Paginated<T> envelope shape is correctly typed
 * 2. makeListHook's useList selects the items array from the envelope
 * 3. makeListHook's usePage returns the full envelope (for table pagination)
 * 4. Bare-array fallback: when the API returns a plain array (un-paginated),
 *    usePage wraps it in a synthetic envelope
 *
 * We mock @tanstack/react-query and the api module to avoid network calls.
 *
 * Rule: update when makeListHook or usePage behaviour changes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createElement } from "react"
import type { Paginated } from "@/lib/hooks/_shared"
import { makeListHook } from "@/lib/hooks/_shared"

// ── Mock the api module so no real HTTP requests are made ─────────────────────
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(),
  },
}))

import api from "@/lib/api"

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  })
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children)
}

// ── Paginated type shape tests (pure TypeScript, no React) ─────────────────────

describe("Paginated<T> interface shape", () => {
  it("can be assigned with all required fields", () => {
    const env: Paginated<string> = {
      items: ["a", "b"],
      total: 25,
      page: 1,
      limit: 10,
      pages: 3,
    }
    expect(env.items).toEqual(["a", "b"])
    expect(env.total).toBe(25)
    expect(env.page).toBe(1)
    expect(env.limit).toBe(10)
    expect(env.pages).toBe(3)
  })

  it("works with empty items", () => {
    const env: Paginated<number> = { items: [], total: 0, page: 1, limit: 50, pages: 1 }
    expect(env.items).toHaveLength(0)
  })
})

// ── makeListHook — useList (select returns array) ─────────────────────────────

describe("makeListHook — useList", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns an array when API returns paginated envelope", async () => {
    const envelope: Paginated<{ id: string }> = {
      items: [{ id: "1" }, { id: "2" }],
      total: 2, page: 1, limit: 10, pages: 1,
    }
    vi.mocked(api.get).mockResolvedValueOnce({ data: envelope })

    const hook = makeListHook<{ id: string }>("/test", "test")
    const { result } = renderHook(() => hook.useList(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([{ id: "1" }, { id: "2" }])
  })

  it("returns an array when API returns a bare array", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: [{ id: "a" }, { id: "b" }] })

    const hook = makeListHook<{ id: string }>("/test-arr", "test-arr")
    const { result } = renderHook(() => hook.useList(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(Array.isArray(result.current.data)).toBe(true)
    expect(result.current.data).toEqual([{ id: "a" }, { id: "b" }])
  })

  it("data is undefined while loading", async () => {
    // Mock that never resolves during the check
    vi.mocked(api.get).mockReturnValueOnce(new Promise(() => {}))
    const hook = makeListHook<{ id: string }>("/test-load", "test-load")
    const { result } = renderHook(() => hook.useList(), { wrapper: makeWrapper() })
    // Before resolution, data should be undefined (or the placeholder)
    expect(result.current.isSuccess).toBe(false)
  })
})

// ── makeListHook — usePage (returns full envelope) ────────────────────────────

describe("makeListHook — usePage", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns full envelope with total and pages", async () => {
    const envelope: Paginated<{ id: string }> = {
      items: [{ id: "x" }],
      total: 42, page: 2, limit: 10, pages: 5,
    }
    vi.mocked(api.get).mockResolvedValueOnce({ data: envelope })

    const hook = makeListHook<{ id: string }>("/pageable", "pageable")
    const { result } = renderHook(() => hook.usePage({ page: 2, limit: 10 }), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.total).toBe(42)
    expect(result.current.data?.pages).toBe(5)
    expect(result.current.data?.page).toBe(2)
    expect(result.current.data?.items).toEqual([{ id: "x" }])
  })

  it("wraps a bare array response in a synthetic envelope", async () => {
    const arr = [{ id: "1" }, { id: "2" }, { id: "3" }]
    vi.mocked(api.get).mockResolvedValueOnce({ data: arr })

    const hook = makeListHook<{ id: string }>("/bare-arr", "bare-arr")
    const { result } = renderHook(() => hook.usePage(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.items).toEqual(arr)
    expect(result.current.data?.total).toBe(3)
    expect(result.current.data?.page).toBe(1)
    expect(result.current.data?.pages).toBe(1)
  })

  it("synthetic envelope for empty bare array has pages=1", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: [] })

    const hook = makeListHook<{ id: string }>("/empty-arr", "empty-arr")
    const { result } = renderHook(() => hook.usePage(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.pages).toBe(1)  // never 0
    expect(result.current.data?.total).toBe(0)
  })

  it("passes params to the API call", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      data: { items: [], total: 0, page: 3, limit: 25, pages: 0 },
    })

    const hook = makeListHook<{ id: string }>("/pageable2", "pageable2")
    const { result } = renderHook(
      () => hook.usePage({ page: 3, limit: 25, status: "paid" }),
      { wrapper: makeWrapper() }
    )

    await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true))
    expect(vi.mocked(api.get)).toHaveBeenCalledWith("/pageable2", {
      params: { page: 3, limit: 25, status: "paid" },
    })
  })
})
