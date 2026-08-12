export type LineType = "goods" | "services"
export type DiscountMode = "percent" | "amount"

/**
 * Shared line-item shape used by the bills and invoices editors.
 * Every field every target page touches is represented here.
 */
export interface LineItem {
  product_id?: string
  line_type: LineType
  description: string
  account_id: string
  quantity: number
  unit_price: number
  discount: number
  discount_mode: DiscountMode
  tax_rate: number
  tax_code_id: string
  amount: number
}

export interface TaxRateOption {
  id: string
  code: string
  rate: number
  is_active?: boolean
}
