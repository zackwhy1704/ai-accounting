import { useMemo, useState } from "react"
import type { LineItem, TaxRateOption } from "./types"

export interface UseLineItemsOptions {
  /**
   * Bills treat a "services" line's base as `unit_price` (quantity ignored)
   * for sub-total, discount, and tax math. Invoices always use
   * `quantity * unit_price` (with quantity forced to 1 for services).
   * Defaults to false (invoice behaviour).
   */
  servicesUsesUnitPriceOnly?: boolean
  /** Tax-code list used to sync tax_rate when a tax code is picked. */
  taxRates?: TaxRateOption[]
  /**
   * When a tax code is cleared (no match found), reset tax_rate to 0.
   * Bills do this; invoices leave the previous rate untouched.
   * Defaults to false (invoice behaviour).
   */
  resetTaxRateWhenNoMatch?: boolean
  /** Initial line items. Defaults to a single empty line. */
  initial?: LineItem[]
}

export function makeEmptyLine(): LineItem {
  return {
    line_type: "goods",
    description: "",
    account_id: "",
    quantity: 1,
    unit_price: 0,
    discount: 0,
    discount_mode: "percent",
    tax_rate: 0,
    tax_code_id: "",
    amount: 0,
  }
}

export interface UseLineItemsResult {
  lineItems: LineItem[]
  setLineItems: React.Dispatch<React.SetStateAction<LineItem[]>>
  updateLine: (idx: number, field: keyof LineItem, value: string | number) => void
  addLine: () => void
  removeLine: (idx: number) => void
  subTotal: number
  totalDiscount: number
  totalTax: number
  total: number
}

export function useLineItems(options: UseLineItemsOptions = {}): UseLineItemsResult {
  const {
    servicesUsesUnitPriceOnly = false,
    taxRates,
    resetTaxRateWhenNoMatch = false,
    initial,
  } = options

  const [lineItems, setLineItems] = useState<LineItem[]>(initial ?? [makeEmptyLine()])

  // Base used for sub-total / discount / tax for a single line.
  const lineBase = useMemo(() => {
    return (item: LineItem) =>
      servicesUsesUnitPriceOnly && item.line_type === "services"
        ? item.unit_price
        : item.quantity * item.unit_price
  }, [servicesUsesUnitPriceOnly])

  const lineDiscountAmount = useMemo(() => {
    return (item: LineItem) => {
      const base = lineBase(item)
      return item.discount_mode === "amount"
        ? Math.min(item.discount, base)
        : (base * item.discount) / 100
    }
  }, [lineBase])

  const updateLine = (idx: number, field: keyof LineItem, value: string | number) => {
    setLineItems(prev => {
      const updated = [...prev]
      updated[idx] = { ...updated[idx], [field]: value }
      if (field === "tax_code_id") {
        const tc = taxRates?.find(t => t.id === value)
        if (tc) updated[idx].tax_rate = tc.rate
        else if (resetTaxRateWhenNoMatch) updated[idx].tax_rate = 0
      }
      if (field === "line_type" && value === "services") {
        updated[idx].quantity = 1
      }
      const item = updated[idx]
      const afterDiscount = lineBase(item) - lineDiscountAmount(item)
      updated[idx].amount = afterDiscount * (1 + item.tax_rate / 100)
      return updated
    })
  }

  const addLine = () => setLineItems(prev => [...prev, makeEmptyLine()])

  const removeLine = (idx: number) =>
    setLineItems(prev => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)))

  const subTotal = lineItems.reduce((sum, item) => sum + lineBase(item), 0)
  const totalDiscount = lineItems.reduce((sum, item) => sum + lineDiscountAmount(item), 0)
  const totalTax = lineItems.reduce((sum, item) => {
    const afterDiscount = lineBase(item) - lineDiscountAmount(item)
    return sum + (afterDiscount * item.tax_rate) / 100
  }, 0)
  const total = subTotal - totalDiscount + totalTax

  return { lineItems, setLineItems, updateLine, addLine, removeLine, subTotal, totalDiscount, totalTax, total }
}
