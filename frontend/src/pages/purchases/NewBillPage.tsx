import { useState, useEffect, useRef, useMemo } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Plus, Trash2, Loader2 } from "lucide-react"
import { useContacts, useAccounts, useCreateBill, useTaxRates, usePurchaseOrder } from "../../lib/hooks"
import { getContactPrefs, saveContactPref } from "../../lib/contact-prefs"
import { useQuery } from "@tanstack/react-query"
import api from "../../lib/api"
import { useToast } from "../../components/ui/toast"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"
import { SearchableSelect } from "../../components/ui/searchable-select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table"

interface LineItem {
  line_type: "goods" | "services"
  description: string
  account_id: string
  quantity: number
  unit_price: number
  discount: number
  discount_mode: "percent" | "amount"
  tax_rate: number
  tax_code_id: string
  amount: number
}

function emptyLine(): LineItem {
  return { line_type: "goods", description: "", account_id: "", quantity: 1, unit_price: 0, discount: 0, discount_mode: "percent", tax_rate: 0, tax_code_id: "", amount: 0 }
}

function lineDiscountAmount(item: LineItem): number {
  const lineTotal = item.line_type === "services" ? item.unit_price : item.quantity * item.unit_price
  return item.discount_mode === "amount" ? Math.min(item.discount, lineTotal) : (lineTotal * item.discount) / 100
}

export default function NewBillPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { toast } = useToast()
  const { data: contacts = [] } = useContacts()
  const { data: accounts = [] } = useAccounts()
  const { data: taxRates = [] } = useTaxRates()
  const createBill = useCreateBill()

  const fromPoId = searchParams.get("from_po")
  const { data: sourcePO } = usePurchaseOrder(fromPoId ?? undefined)

  const [contactId, setContactId] = useState("")
  const [billNumber, setBillNumber] = useState("")
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [dueDate, setDueDate] = useState("")
  const [currency, setCurrency] = useState("MYR")
  const [notes, setNotes] = useState("")
  const [lineItems, setLineItems] = useState<LineItem[]>([emptyLine()])
  const [productSearch, setProductSearch] = useState("")
  const [productDropdownOpen, setProductDropdownOpen] = useState(false)
  const productInputRef = useRef<HTMLInputElement>(null)
  const populated = useRef(false)

  const { data: products = [] } = useQuery<{ id: string; name: string; unit_price: number; account_id: string | null }[]>({
    queryKey: ["products"],
    queryFn: () => api.get("/products").then(r => r.data),
    staleTime: 5 * 60_000,
  })

  useEffect(() => {
    if (!sourcePO || populated.current) return
    populated.current = true
    setContactId(String(sourcePO.contact_id ?? ""))
    setCurrency(sourcePO.currency ?? "MYR")
    setNotes(sourcePO.notes ?? "")
    if (sourcePO.line_items?.length) {
      setLineItems(sourcePO.line_items.map((li: any) => ({
        line_type: "goods" as const,
        description: li.description ?? "",
        account_id: li.account_id ? String(li.account_id) : "",
        quantity: li.quantity ?? 1,
        unit_price: li.unit_price ?? 0,
        discount: li.discount ?? 0,
        discount_mode: "percent" as const,
        tax_rate: li.tax_rate ?? 0,
        tax_code_id: li.tax_code_id ? String(li.tax_code_id) : "",
        amount: li.amount ?? 0,
      })))
    }
  }, [sourcePO])

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

  const suppliers = useMemo(
    () => contacts.filter((c: any) => c.type === "vendor" || c.type === "supplier" || c.type === "both"),
    [contacts]
  )

  const activeTaxRates = useMemo(() => taxRates.filter((tr: any) => tr.is_active), [taxRates])

  const updateLine = (idx: number, field: keyof LineItem, value: string | number) => {
    setLineItems(prev => {
      const updated = [...prev]
      updated[idx] = { ...updated[idx], [field]: value }
      if (field === "tax_code_id") {
        const tc = activeTaxRates.find((t: any) => t.id === value)
        if (tc) updated[idx].tax_rate = tc.rate
        else updated[idx].tax_rate = 0
      }
      if (field === "line_type" && value === "services") {
        updated[idx].quantity = 1
      }
      const item = updated[idx]
      const lineTotal = item.line_type === "services" ? item.unit_price : item.quantity * item.unit_price
      updated[idx].amount = (lineTotal - lineDiscountAmount(item)) * (1 + item.tax_rate / 100)
      return updated
    })
  }

  const subTotal = lineItems.reduce((sum, item) => {
    return sum + (item.line_type === "services" ? item.unit_price : item.quantity * item.unit_price)
  }, 0)
  const totalDiscount = lineItems.reduce((sum, item) => sum + lineDiscountAmount(item), 0)
  const totalTax = lineItems.reduce((sum, item) => {
    const lineTotal = item.line_type === "services" ? item.unit_price : item.quantity * item.unit_price
    return sum + (lineTotal - lineDiscountAmount(item)) * (item.tax_rate / 100)
  }, 0)
  const total = subTotal - totalDiscount + totalTax

  const handleSave = async () => {
    if (!contactId) { toast("Please select a supplier", "warning"); return }
    if (!issueDate) { toast("Please enter a bill date", "warning"); return }
    try {
      await createBill.mutateAsync({
        contact_id: contactId,
        bill_number: billNumber || undefined,
        issue_date: new Date(issueDate).toISOString(),
        due_date: dueDate ? new Date(dueDate).toISOString() : new Date(issueDate).toISOString(),
        currency,
        notes: notes || null,
        line_items: lineItems.map((item, i) => {
          const qty = item.line_type === "services" ? 1 : item.quantity
          const lineTotal = qty * item.unit_price
          const discPct = item.discount_mode === "amount"
            ? (lineTotal > 0 ? Math.min(item.discount, lineTotal) / lineTotal * 100 : 0)
            : item.discount
          return {
            description: item.description,
            account_id: item.account_id || undefined,
            quantity: qty,
            unit_price: item.unit_price,
            tax_rate: item.tax_rate,
            tax_code_id: item.tax_code_id || undefined,
            discount: discPct,
            amount: item.amount,
            sort_order: i,
          }
        }),
      } as any)
      toast("Bill created", "success")
      navigate("/purchases/bills")
    } catch {
      toast("Failed to create bill", "warning")
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="text-xs text-muted-foreground">Purchases &rsaquo; Bills</div>
        <div className="text-2xl font-semibold tracking-tight text-foreground">
          {fromPoId ? `New Bill (from PO ${sourcePO?.po_number ?? "..."})` : "New Bill"}
        </div>
      </div>

      <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Supplier *</label>
            <SearchableSelect
              value={contactId}
              onChange={v => {
                setContactId(v)
                const prefs = getContactPrefs(v)
                if (prefs.currency) setCurrency(prefs.currency)
              }}
              placeholder="Search or select supplier"
              options={suppliers.map((c: any) => ({ value: c.id, label: c.name, hint: c.email ?? "" }))}
              footerAction={{ label: "+ Add New Supplier", onClick: () => navigate("/contacts/new") }}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Bill Date *</label>
            <Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className="h-10 rounded-xl" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Due Date</label>
            <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="h-10 rounded-xl" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Bill Number</label>
            <Input value={billNumber} onChange={e => setBillNumber(e.target.value)} placeholder="Auto-generated (BILL-0001)" className="h-10 rounded-xl" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Currency</label>
            <Select value={currency} onValueChange={v => { setCurrency(v); if (contactId) saveContactPref(contactId, "currency", v) }}>
              <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Select currency" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MYR">MYR - Malaysian Ringgit</SelectItem>
                <SelectItem value="SGD">SGD - Singapore Dollar</SelectItem>
                <SelectItem value="USD">USD - US Dollar</SelectItem>
                <SelectItem value="HKD">HKD - Hong Kong Dollar</SelectItem>
                <SelectItem value="AUD">AUD - Australian Dollar</SelectItem>
                <SelectItem value="EUR">EUR - Euro</SelectItem>
                <SelectItem value="GBP">GBP - British Pound</SelectItem>
                <SelectItem value="JPY">JPY - Japanese Yen</SelectItem>
                <SelectItem value="CNY">CNY - Chinese Yuan</SelectItem>
                <SelectItem value="THB">THB - Thai Baht</SelectItem>
                <SelectItem value="IDR">IDR - Indonesian Rupiah</SelectItem>
                <SelectItem value="PHP">PHP - Philippine Peso</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-border">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="w-10 text-center text-muted-foreground">#</TableHead>
                <TableHead className="w-[100px] text-muted-foreground">Type</TableHead>
                <TableHead className="min-w-[180px] text-muted-foreground">Description</TableHead>
                <TableHead className="w-[160px] text-muted-foreground">Account</TableHead>
                <TableHead className="w-[80px] text-muted-foreground">Qty</TableHead>
                <TableHead className="w-[110px] text-muted-foreground">Unit Price</TableHead>
                <TableHead className="w-[140px] text-muted-foreground">Discount</TableHead>
                <TableHead className="w-[160px] text-muted-foreground">Tax Code</TableHead>
                <TableHead className="w-[80px] text-muted-foreground">Tax %</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineItems.map((item, idx) => (
                <TableRow key={idx} className="border-border">
                  <TableCell className="text-center text-xs text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell>
                    <Select value={item.line_type} onValueChange={v => updateLine(idx, "line_type", v)}>
                      <SelectTrigger className="h-9 rounded-lg border-0 bg-transparent shadow-none text-xs">
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
                  <TableCell>
                    <SearchableSelect
                      value={item.account_id}
                      onChange={v => updateLine(idx, "account_id", v)}
                      placeholder="Account"
                      options={accounts.map((a: any) => ({ value: a.id, label: `${a.code} – ${a.name}`, hint: a.code }))}
                    />
                  </TableCell>
                  {item.line_type === "services" ? (
                    <TableCell className="text-center text-xs text-muted-foreground">—</TableCell>
                  ) : (
                    <TableCell>
                      <Input type="number" min={0} value={item.quantity} onChange={e => updateLine(idx, "quantity", Number(e.target.value))} className="h-9 rounded-lg border-0 bg-transparent px-1 shadow-none focus-visible:ring-1" />
                    </TableCell>
                  )}
                  <TableCell>
                    <Input type="number" min={0} step={0.01} value={item.unit_price} onChange={e => updateLine(idx, "unit_price", Number(e.target.value))} className="h-9 rounded-lg border-0 bg-transparent px-1 shadow-none focus-visible:ring-1" />
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
                      >
                        {item.discount_mode === "percent" ? "%" : currency}
                      </button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select value={item.tax_code_id} onValueChange={v => updateLine(idx, "tax_code_id", v === "__none__" ? "" : v)}>
                      <SelectTrigger className="h-9 rounded-lg border-0 bg-transparent shadow-none focus:ring-1 text-xs">
                        <SelectValue placeholder="Tax Code" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No Tax</SelectItem>
                        {activeTaxRates.map((tc: any) => (
                          <SelectItem key={tc.id} value={tc.id}>{tc.code} ({tc.rate}%)</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input type="number" min={0} max={100} step={0.01} value={item.tax_rate} onChange={e => updateLine(idx, "tax_rate", Number(e.target.value))} className="h-9 rounded-lg border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-1" placeholder="%" />
                  </TableCell>
                  <TableCell>
                    <button type="button" onClick={() => setLineItems(p => p.length <= 1 ? p : p.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-rose-500">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => setLineItems(p => [...p, emptyLine()])} className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white shadow-sm hover:opacity-95">
            <Plus className="mr-1.5 h-4 w-4" /> Item
          </Button>
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
                {products
                  .filter(p => !productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase()))
                  .slice(0, 10)
                  .map(p => (
                    <button
                      key={p.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-xs hover:bg-muted/60 flex items-center justify-between"
                      onMouseDown={e => {
                        e.preventDefault()
                        setLineItems(prev => [...prev, {
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
                        }])
                        setProductSearch("")
                        setProductDropdownOpen(false)
                      }}
                    >
                      <span className="truncate">{p.name}</span>
                      <span className="ml-2 shrink-0 text-muted-foreground">{p.unit_price.toFixed(2)}</span>
                    </button>
                  ))}
                {products.filter(p => !productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase())).length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">No products found</div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <div className="w-full max-w-xs space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Sub Total</span>
              <span className="font-medium text-foreground">{currency} {subTotal.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Discount</span>
              <span className="font-medium text-foreground">- {currency} {totalDiscount.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span className="font-medium text-foreground">{currency} {totalTax.toFixed(2)}</span>
            </div>
            <div className="border-t border-border pt-2">
              <div className="flex items-center justify-between text-base font-bold">
                <span className="text-foreground">Total</span>
                <span className="text-foreground">{currency} {total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Internal notes..." className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button type="button" variant="secondary" className="h-9 rounded-xl px-3 text-xs font-semibold" onClick={() => navigate("/purchases/bills")}>Cancel</Button>
          <Button type="button" onClick={handleSave} disabled={createBill.isPending || !contactId || !issueDate || !lineItems.some(li => li.description.trim())} className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white hover:opacity-95">
            {createBill.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : "Save as Draft"}
          </Button>
        </div>
      </Card>
    </div>
  )
}
