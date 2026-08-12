import { useEffect, useRef, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select"
import { SearchableSelect } from "../ui/searchable-select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table"
import type { LineItem, TaxRateOption } from "./types"

export interface AccountOption {
  id: string
  code: string
  name: string
}

export interface ProductOption {
  id: string
  name: string
  unit_price: number
  account_id: string | null
}

export interface LineItemsEditorProps {
  items: LineItem[]
  updateLine: (idx: number, field: keyof LineItem, value: string | number) => void
  addLine: () => void
  removeLine: (idx: number) => void
  onAddProductLine?: (line: LineItem) => void

  accounts: AccountOption[]
  taxRates: TaxRateOption[]
  /** Currency symbol shown on the discount-mode toggle when in amount mode. */
  currency: string

  /** Header label for the quantity column ("Qty" for bills, "Quantity" for invoices). */
  quantityHeading?: string
  /** min-width class for the Description column header. */
  descriptionHeadClassName?: string
  /** Width class for the discount column header. */
  discountHeadClassName?: string
  /** Extra className applied to the Tax Code body cell (invoices set w-[160px]). */
  taxCodeCellClassName?: string
  /** Extra className applied to the Tax % body cell (invoices set w-[80px]). */
  taxRateCellClassName?: string
  /**
   * How to render the quantity cell for a services line.
   * "cell" (bills): the dash is the whole centered cell.
   * "span" (invoices): a muted span inside a normal cell.
   */
  servicesQtyStyle?: "cell" | "span"
  /** Extra className for the line-type Select trigger (bills add text-xs). */
  typeTriggerClassName?: string
  /** triggerClassName passed to the account SearchableSelect (invoices set one). */
  accountTriggerClassName?: string

  /** Optional per-row cell wrappers for error highlighting. */
  accountCellClassName?: (idx: number) => string
  taxCellClassName?: (idx: number) => string
  /** Fired after the account changes (used to clear error highlight). */
  onAccountChanged?: (idx: number) => void
  /** Fired after the tax code changes (used to clear error highlight). */
  onTaxChanged?: (idx: number) => void

  /** Product quick-add search shown next to the Add Item button. */
  products?: ProductOption[]
  showProductSearch?: boolean
  /** When set, the parent does server-side product search: this fires (debounced)
   *  as the user types and the local client-side filter is skipped (products are
   *  already server-filtered). Removes the "first 50 products" ceiling. */
  onProductSearch?: (query: string) => void
  /** Wrapper className for the add-row controls row. */
  controlsClassName?: string
  /** Show a tooltip on the discount-mode toggle (invoices do; bills do not). */
  discountToggleTitle?: boolean
}

export function LineItemsEditor({
  items,
  updateLine,
  addLine,
  removeLine,
  onAddProductLine,
  accounts,
  taxRates,
  currency,
  quantityHeading = "Qty",
  descriptionHeadClassName = "min-w-[180px]",
  discountHeadClassName = "w-[140px]",
  taxCodeCellClassName,
  taxRateCellClassName,
  servicesQtyStyle = "cell",
  typeTriggerClassName = "",
  accountTriggerClassName,
  accountCellClassName,
  taxCellClassName,
  onAccountChanged,
  onTaxChanged,
  products = [],
  showProductSearch = false,
  onProductSearch,
  controlsClassName = "mt-3",
  discountToggleTitle = false,
}: LineItemsEditorProps) {
  const [productSearch, setProductSearch] = useState("")
  const [productDropdownOpen, setProductDropdownOpen] = useState(false)
  const productInputRef = useRef<HTMLInputElement>(null)

  // Server-side product search: debounce the typed query up to the parent.
  useEffect(() => {
    if (!onProductSearch) return
    const t = setTimeout(() => onProductSearch(productSearch), 250)
    return () => clearTimeout(t)
  }, [productSearch, onProductSearch])

  useEffect(() => {
    if (!productDropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (productInputRef.current && !productInputRef.current.closest(".relative")?.contains(e.target as Node)) {
        setProductDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [productDropdownOpen])

  const accountOptions = accounts.map(a => ({ value: a.id, label: `${a.code} – ${a.name}`, hint: a.code }))

  return (
    <>
      <div className="mt-6 rounded-2xl border border-border">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="w-10 text-center text-muted-foreground">#</TableHead>
              <TableHead className="w-[100px] text-muted-foreground">Type</TableHead>
              <TableHead className={`${descriptionHeadClassName} text-muted-foreground`}>Description</TableHead>
              <TableHead className="w-[160px] text-muted-foreground">Account</TableHead>
              <TableHead className="w-[80px] text-muted-foreground">{quantityHeading}</TableHead>
              <TableHead className="w-[110px] text-muted-foreground">Unit Price</TableHead>
              <TableHead className={`${discountHeadClassName} text-muted-foreground`}>Discount</TableHead>
              <TableHead className="w-[160px] text-muted-foreground">Tax Code</TableHead>
              <TableHead className="w-[80px] text-muted-foreground">Tax %</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, idx) => (
              <TableRow key={idx} className="border-border">
                <TableCell className="text-center text-xs text-muted-foreground">{idx + 1}</TableCell>
                <TableCell>
                  <Select value={item.line_type} onValueChange={v => updateLine(idx, "line_type", v)}>
                    <SelectTrigger className={`h-9 rounded-lg border-0 bg-transparent shadow-none${typeTriggerClassName ? ` ${typeTriggerClassName}` : ""}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="goods">Goods</SelectItem>
                      <SelectItem value="services">Services</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input value={item.description} onChange={e => updateLine(idx, "description", e.target.value)} placeholder="Description" className="h-9 rounded-lg border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-1" />
                </TableCell>
                <TableCell className={accountCellClassName ? accountCellClassName(idx) : undefined}>
                  <SearchableSelect
                    value={item.account_id}
                    onChange={v => { updateLine(idx, "account_id", v); onAccountChanged?.(idx) }}
                    placeholder="Account"
                    {...(accountTriggerClassName ? { triggerClassName: accountTriggerClassName } : {})}
                    options={accountOptions}
                  />
                </TableCell>
                {item.line_type === "services" ? (
                  servicesQtyStyle === "span" ? (
                    <TableCell>
                      <span className="px-1 text-sm text-muted-foreground">&mdash;</span>
                    </TableCell>
                  ) : (
                    <TableCell className="text-center text-xs text-muted-foreground">—</TableCell>
                  )
                ) : (
                  <TableCell>
                    <Input type="number" min={0} value={item.quantity} onChange={e => updateLine(idx, "quantity", Number(e.target.value))} className={`h-9 rounded-lg border-0 bg-transparent px-1 ${servicesQtyStyle === "span" ? "text-sm " : ""}shadow-none focus-visible:ring-1`} />
                  </TableCell>
                )}
                <TableCell>
                  <Input type="number" min={0} step={0.01} value={item.unit_price} onChange={e => updateLine(idx, "unit_price", Number(e.target.value))} className={`h-9 rounded-lg border-0 bg-transparent px-1 ${servicesQtyStyle === "span" ? "text-sm " : ""}shadow-none focus-visible:ring-1`} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number" min={0} step={0.01}
                      value={item.discount}
                      onChange={e => updateLine(idx, "discount", Number(e.target.value))}
                      className="h-9 w-20 rounded-lg border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-1"
                    />
                    <button
                      type="button"
                      onClick={() => updateLine(idx, "discount_mode", item.discount_mode === "percent" ? "amount" : "percent")}
                      className="h-7 w-9 rounded-md border border-border bg-muted/40 text-[11px] font-semibold text-foreground hover:bg-muted"
                      {...(discountToggleTitle ? { title: item.discount_mode === "percent" ? "Switch to flat amount" : "Switch to percentage" } : {})}
                    >
                      {item.discount_mode === "percent" ? "%" : currency}
                    </button>
                  </div>
                </TableCell>
                <TableCell className={taxCellClassName ? taxCellClassName(idx) : taxCodeCellClassName}>
                  <Select value={item.tax_code_id} onValueChange={v => { updateLine(idx, "tax_code_id", v === "__none__" ? "" : v); onTaxChanged?.(idx) }}>
                    <SelectTrigger className="h-9 rounded-lg border-0 bg-transparent shadow-none focus:ring-1 text-xs">
                      <SelectValue placeholder="Tax Code" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No Tax</SelectItem>
                      {taxRates.map(tc => (
                        <SelectItem key={tc.id} value={tc.id}>{tc.code} ({tc.rate}%)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className={taxRateCellClassName}>
                  <Input type="number" min={0} max={100} step={0.01} value={item.tax_rate} onChange={e => updateLine(idx, "tax_rate", Number(e.target.value))} className="h-9 rounded-lg border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-1" placeholder="%" />
                </TableCell>
                <TableCell>
                  <button type="button" onClick={() => removeLine(idx)} className="text-muted-foreground hover:text-rose-500">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className={showProductSearch ? `${controlsClassName} flex flex-wrap items-center gap-3` : controlsClassName}>
        <Button type="button" onClick={addLine} className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white shadow-sm hover:opacity-95">
          <Plus className="mr-1.5 h-4 w-4" /> Item
        </Button>
        {showProductSearch && (
          <div className="relative">
            <Input
              ref={productInputRef}
              value={productSearch}
              onChange={e => { setProductSearch(e.target.value); setProductDropdownOpen(true) }}
              onFocus={() => setProductDropdownOpen(true)}
              placeholder="Add Product..."
              className="h-9 w-48 rounded-xl pl-3 pr-3 text-xs"
            />
            {productDropdownOpen && (
              <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-xl border border-border bg-card shadow-lg py-1">
                {(onProductSearch
                  ? products  // server already filtered by the typed query
                  : products.filter(p => !productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase())))
                  .slice(0, 10)
                  .map(p => (
                    <button
                      key={p.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-xs hover:bg-muted/60 flex items-center justify-between"
                      onMouseDown={e => {
                        e.preventDefault()
                        onAddProductLine?.({
                          product_id: p.id,
                          line_type: "goods",
                          description: p.name,
                          account_id: p.account_id ?? "",
                          quantity: 1,
                          unit_price: p.unit_price,
                          amount: p.unit_price,
                          discount: 0,
                          discount_mode: "percent",
                          tax_rate: 0,
                          tax_code_id: "",
                        })
                        setProductSearch("")
                        setProductDropdownOpen(false)
                      }}
                    >
                      <span className="truncate">{p.name}</span>
                      <span className="ml-2 shrink-0 text-muted-foreground">{p.unit_price.toFixed(2)}</span>
                    </button>
                  ))}
                {(onProductSearch
                  ? products
                  : products.filter(p => !productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase()))).length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">No products found</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
