/**
 * Tests for the useLineItems hook (components/line-items/useLineItems.ts).
 * Uses renderHook to exercise the hook's state machine without rendering a component.
 *
 * Rule: update when useLineItems logic changes (totals, add/remove, tax, discount).
 */
import { describe, it, expect } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useLineItems, makeEmptyLine } from "@/components/line-items/useLineItems"

describe("makeEmptyLine", () => {
  it("returns a line with sensible defaults", () => {
    const line = makeEmptyLine()
    expect(line.line_type).toBe("goods")
    expect(line.quantity).toBe(1)
    expect(line.unit_price).toBe(0)
    expect(line.discount).toBe(0)
    expect(line.tax_rate).toBe(0)
    expect(line.amount).toBe(0)
  })
})

describe("useLineItems — initial state", () => {
  it("starts with one empty line item", () => {
    const { result } = renderHook(() => useLineItems())
    expect(result.current.lineItems).toHaveLength(1)
  })

  it("uses provided initial items", () => {
    const initial = [makeEmptyLine(), makeEmptyLine()]
    const { result } = renderHook(() => useLineItems({ initial }))
    expect(result.current.lineItems).toHaveLength(2)
  })

  it("all totals start at 0", () => {
    const { result } = renderHook(() => useLineItems())
    expect(result.current.subTotal).toBe(0)
    expect(result.current.totalTax).toBe(0)
    expect(result.current.totalDiscount).toBe(0)
    expect(result.current.total).toBe(0)
  })
})

describe("useLineItems — addLine", () => {
  it("adds a new empty line", () => {
    const { result } = renderHook(() => useLineItems())
    act(() => result.current.addLine())
    expect(result.current.lineItems).toHaveLength(2)
  })

  it("each added line starts with zeros", () => {
    const { result } = renderHook(() => useLineItems())
    act(() => result.current.addLine())
    const newLine = result.current.lineItems[1]
    expect(newLine.unit_price).toBe(0)
    expect(newLine.quantity).toBe(1)
  })
})

describe("useLineItems — removeLine", () => {
  it("removes a line by index", () => {
    const { result } = renderHook(() => useLineItems())
    act(() => result.current.addLine())  // now 2 lines
    act(() => result.current.removeLine(0))
    expect(result.current.lineItems).toHaveLength(1)
  })

  it("does not remove the last remaining line", () => {
    const { result } = renderHook(() => useLineItems())
    expect(result.current.lineItems).toHaveLength(1)
    act(() => result.current.removeLine(0))
    // should stay at 1
    expect(result.current.lineItems).toHaveLength(1)
  })

  it("removes the correct item when there are multiple", () => {
    const initial = [
      { ...makeEmptyLine(), description: "first" },
      { ...makeEmptyLine(), description: "second" },
      { ...makeEmptyLine(), description: "third" },
    ]
    const { result } = renderHook(() => useLineItems({ initial }))
    act(() => result.current.removeLine(1))  // remove "second"
    expect(result.current.lineItems).toHaveLength(2)
    expect(result.current.lineItems[0].description).toBe("first")
    expect(result.current.lineItems[1].description).toBe("third")
  })
})

describe("useLineItems — updateLine", () => {
  it("updates a field on the given line", () => {
    const { result } = renderHook(() => useLineItems())
    act(() => result.current.updateLine(0, "unit_price", 100))
    expect(result.current.lineItems[0].unit_price).toBe(100)
  })

  it("recalculates totals when price changes", () => {
    const { result } = renderHook(() => useLineItems())
    act(() => result.current.updateLine(0, "unit_price", 200))
    // quantity is 1, no discount, no tax → total = 200
    expect(result.current.subTotal).toBe(200)
    expect(result.current.total).toBe(200)
  })

  it("recalculates totals when quantity changes", () => {
    const { result } = renderHook(() => useLineItems())
    act(() => result.current.updateLine(0, "unit_price", 50))
    act(() => result.current.updateLine(0, "quantity", 4))
    expect(result.current.subTotal).toBe(200)
    expect(result.current.total).toBe(200)
  })

  it("applies percent discount correctly", () => {
    const { result } = renderHook(() => useLineItems())
    act(() => result.current.updateLine(0, "unit_price", 100))
    act(() => result.current.updateLine(0, "discount", 10))
    act(() => result.current.updateLine(0, "discount_mode", "percent"))
    expect(result.current.totalDiscount).toBe(10)
    expect(result.current.subTotal).toBe(100)
    // total = 100 - 10 + 0 tax = 90
    expect(result.current.total).toBe(90)
  })

  it("applies amount discount correctly", () => {
    const { result } = renderHook(() => useLineItems())
    act(() => result.current.updateLine(0, "unit_price", 100))
    act(() => result.current.updateLine(0, "discount", 20))
    act(() => result.current.updateLine(0, "discount_mode", "amount"))
    expect(result.current.totalDiscount).toBe(20)
    expect(result.current.total).toBe(80)
  })

  it("calculates tax on after-discount amount", () => {
    const { result } = renderHook(() => useLineItems())
    act(() => result.current.updateLine(0, "unit_price", 100))
    act(() => result.current.updateLine(0, "tax_rate", 10))  // 10%
    // no discount: tax = 100 * 10% = 10, total = 110
    expect(result.current.totalTax).toBeCloseTo(10)
    expect(result.current.total).toBeCloseTo(110)
  })

  it("combined discount + tax: tax is on after-discount amount", () => {
    const { result } = renderHook(() => useLineItems())
    act(() => result.current.updateLine(0, "unit_price", 100))
    act(() => result.current.updateLine(0, "discount", 10))  // 10% off → 90
    act(() => result.current.updateLine(0, "discount_mode", "percent"))
    act(() => result.current.updateLine(0, "tax_rate", 10))  // 10% of 90 = 9
    expect(result.current.totalTax).toBeCloseTo(9)
    expect(result.current.total).toBeCloseTo(99)  // 90 + 9
  })

  it("updates description without affecting totals", () => {
    const { result } = renderHook(() => useLineItems())
    act(() => result.current.updateLine(0, "description", "Consulting"))
    expect(result.current.lineItems[0].description).toBe("Consulting")
    expect(result.current.total).toBe(0)
  })

  it("sets quantity to 1 when line_type changes to services", () => {
    const { result } = renderHook(() => useLineItems())
    act(() => result.current.updateLine(0, "quantity", 5))
    act(() => result.current.updateLine(0, "line_type", "services"))
    expect(result.current.lineItems[0].quantity).toBe(1)
  })
})

describe("useLineItems — tax rate sync from tax code", () => {
  it("syncs tax_rate when a known tax_code_id is set", () => {
    const taxRates = [{ id: "tc-001", code: "SR6", name: "Service Tax 6%", rate: 6 }]
    const { result } = renderHook(() => useLineItems({ taxRates }))
    act(() => result.current.updateLine(0, "tax_code_id", "tc-001"))
    expect(result.current.lineItems[0].tax_rate).toBe(6)
  })

  it("does not change tax_rate when tax_code_id is unknown (default behaviour)", () => {
    const taxRates = [{ id: "tc-001", code: "SR6", name: "Service Tax 6%", rate: 6 }]
    const { result } = renderHook(() => useLineItems({ taxRates }))
    act(() => result.current.updateLine(0, "tax_rate", 8))  // set manually first
    act(() => result.current.updateLine(0, "tax_code_id", "unknown-id"))
    // resetTaxRateWhenNoMatch defaults to false, so rate stays at 8
    expect(result.current.lineItems[0].tax_rate).toBe(8)
  })

  it("resets tax_rate to 0 when tax_code_id is unknown and resetTaxRateWhenNoMatch=true", () => {
    const taxRates = [{ id: "tc-001", code: "SR6", name: "Service Tax 6%", rate: 6 }]
    const { result } = renderHook(() => useLineItems({ taxRates, resetTaxRateWhenNoMatch: true }))
    act(() => result.current.updateLine(0, "tax_rate", 8))
    act(() => result.current.updateLine(0, "tax_code_id", "unknown-id"))
    expect(result.current.lineItems[0].tax_rate).toBe(0)
  })
})

describe("useLineItems — servicesUsesUnitPriceOnly mode (bills)", () => {
  it("uses unit_price as base for services lines when flag is set", () => {
    const { result } = renderHook(() => useLineItems({ servicesUsesUnitPriceOnly: true }))
    act(() => result.current.updateLine(0, "line_type", "services"))
    act(() => result.current.updateLine(0, "unit_price", 500))
    act(() => result.current.updateLine(0, "quantity", 3))  // ignored for services base
    // subTotal should be 500 (unit_price only), not 1500 (qty * price)
    expect(result.current.subTotal).toBe(500)
  })

  it("still uses qty * price for goods lines", () => {
    const { result } = renderHook(() => useLineItems({ servicesUsesUnitPriceOnly: true }))
    act(() => result.current.updateLine(0, "unit_price", 100))
    act(() => result.current.updateLine(0, "quantity", 3))
    expect(result.current.subTotal).toBe(300)
  })
})

describe("useLineItems — multi-line totals", () => {
  it("sums totals across multiple lines", () => {
    const { result } = renderHook(() => useLineItems())
    act(() => {
      result.current.addLine()
      result.current.updateLine(0, "unit_price", 100)
      result.current.updateLine(1, "unit_price", 200)
    })
    expect(result.current.subTotal).toBe(300)
    expect(result.current.total).toBe(300)
  })

  it("sums tax across multiple lines", () => {
    const { result } = renderHook(() => useLineItems())
    act(() => {
      result.current.addLine()
      result.current.updateLine(0, "unit_price", 100)
      result.current.updateLine(0, "tax_rate", 10)
      result.current.updateLine(1, "unit_price", 200)
      result.current.updateLine(1, "tax_rate", 10)
    })
    expect(result.current.totalTax).toBeCloseTo(30)  // 10 + 20
    expect(result.current.total).toBeCloseTo(330)
  })
})
