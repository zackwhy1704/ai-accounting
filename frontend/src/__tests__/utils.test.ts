/**
 * Unit tests for lib/utils.ts
 * Rule: update this file whenever formatCurrency or formatDate are changed.
 */
import { describe, it, expect } from "vitest"
import { formatCurrency, formatDate, cn } from "../lib/utils"

describe("formatCurrency", () => {
  it("formats MYR with RM prefix", () => {
    expect(formatCurrency(1234.5, "MYR")).toBe("RM 1,234.50")
  })

  it("formats SGD with S$ prefix", () => {
    expect(formatCurrency(9999.99, "SGD")).toBe("S$ 9,999.99")
  })

  it("formats USD with $ prefix", () => {
    expect(formatCurrency(100, "USD")).toBe("$ 100.00")
  })

  it("defaults to MYR when currency is omitted", () => {
    expect(formatCurrency(500)).toBe("RM 500.00")
  })

  it("handles zero", () => {
    expect(formatCurrency(0, "MYR")).toBe("RM 0.00")
  })

  it("handles negative values", () => {
    expect(formatCurrency(-250.5, "MYR")).toBe("RM -250.50")
  })

  it("handles undefined gracefully (returns 0.00)", () => {
    expect(formatCurrency(undefined, "MYR")).toBe("RM 0.00")
  })

  it("handles null gracefully (returns 0.00)", () => {
    expect(formatCurrency(null, "SGD")).toBe("S$ 0.00")
  })

  it("formats large numbers with commas", () => {
    expect(formatCurrency(1000000, "MYR")).toBe("RM 1,000,000.00")
  })
})

describe("formatDate", () => {
  it("formats ISO date string to readable date", () => {
    const result = formatDate("2025-01-15T00:00:00Z")
    expect(result).toMatch(/Jan/)
    expect(result).toMatch(/2025/)
    expect(result).toMatch(/15/)
  })

  it("handles different months", () => {
    expect(formatDate("2025-12-31T00:00:00Z")).toMatch(/Dec/)
  })
})

describe("cn (class merge)", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar")
  })

  it("deduplicates tailwind classes", () => {
    expect(cn("px-2", "px-4")).toBe("px-4")
  })

  it("handles conditional falsy values", () => {
    expect(cn("foo", false && "bar", undefined, "baz")).toBe("foo baz")
  })
})
