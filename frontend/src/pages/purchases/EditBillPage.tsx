import { useState, useEffect, useRef, useMemo } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Plus, Trash2, Loader2 } from "lucide-react"
import { useContacts, useAccounts, useBill, useUpdateBill, useTaxRates, useBillActivity, type InvoiceActivityEvent } from "../../lib/hooks"
import { getContactPrefs, saveContactPref } from "../../lib/contact-prefs"
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

export default function EditBillPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data: contacts = [] } = useContacts()
  const { data: accounts = [] } = useAccounts()
  const { data: taxRates = [] } = useTaxRates()
  const { data } = useBill(id!)
  const updateBill = useUpdateBill()
  const { data: activity } = useBillActivity(id)

  const [contactId, setContactId] = useState("")
  const [billNumber, setBillNumber] = useState("")
  const [originalBillNumber, setOriginalBillNumber] = useState("")
  const [issueDate, setIssueDate] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [currency, setCurrency] = useState("MYR")
  const [notes, setNotes] = useState("")

  const [billingLine1, setBillingLine1] = useState("")
  const [billingLine2, setBillingLine2] = useState("")
  const [billingCity, setBillingCity] = useState("")
  const [billingState, setBillingState] = useState("")
  const [billingPostcode, setBillingPostcode] = useState("")
  const [billingCountry, setBillingCountry] = useState("")
  const [shippingLine1, setShippingLine1] = useState("")
  const [shippingLine2, setShippingLine2] = useState("")
  const [shippingCity, setShippingCity] = useState("")
  const [shippingState, setShippingState] = useState("")
  const [shippingPostcode, setShippingPostcode] = useState("")
  const [shippingCountry, setShippingCountry] = useState("")

  const [lineItems, setLineItems] = useState<LineItem[]>([emptyLine()])

  const populated = useRef(false)
  useEffect(() => {
    if (data && !populated.current) {
      populated.current = true
      setContactId(String(data.contact_id || ""))
      setBillNumber(data.bill_number || "")
      setOriginalBillNumber(data.bill_number || "")
      setIssueDate(data.issue_date ? data.issue_date.slice(0, 10) : "")
      setDueDate(data.due_date ? data.due_date.slice(0, 10) : "")
      setCurrency(data.currency || "MYR")
      setNotes(data.notes || "")
      setBillingLine1((data as any).billing_address_line1 || "")
      setBillingLine2((data as any).billing_address_line2 || "")
      setBillingCity((data as any).billing_city || "")
      setBillingState((data as any).billing_state || "")
      setBillingPostcode((data as any).billing_postcode || "")
      setBillingCountry((data as any).billing_country || "")
      setShippingLine1((data as any).shipping_address_line1 || "")
      setShippingLine2((data as any).shipping_address_line2 || "")
      setShippingCity((data as any).shipping_city || "")
      setShippingState((data as any).shipping_state || "")
      setShippingPostcode((data as any).shipping_postcode || "")
      setShippingCountry((data as any).shipping_country || "")
      if (data.line_items && data.line_items.length > 0) {
        setLineItems(data.line_items.map((li: any) => ({
          line_type: (li.line_type as "goods" | "services") || "goods",
          description: li.description || "",
          account_id: li.account_id ? String(li.account_id) : "",
          quantity: li.quantity || 1,
          unit_price: li.unit_price || 0,
          discount: li.discount || 0,
          discount_mode: (li.discount_mode as "percent" | "amount") || "percent",
          tax_rate: li.tax_rate || 0,
          tax_code_id: li.tax_code_id ? String(li.tax_code_id) : "",
          amount: li.amount || 0,
        })))
      }
    }
  }, [data])

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
  const linesValid = lineItems.length > 0 && lineItems.every(li => li.account_id)

  const handleSave = async () => {
    if (!contactId) { toast("Please select a supplier", "warning"); return }
    if (!issueDate) { toast("Please enter a bill date", "warning"); return }
    try {
      await updateBill.mutateAsync({
        id: id!,
        contact_id: contactId,
        ...(billNumber !== originalBillNumber ? { bill_number: billNumber } : {}),
        issue_date: new Date(issueDate).toISOString(),
        due_date: dueDate ? new Date(dueDate).toISOString() : new Date(issueDate).toISOString(),
        currency,
        notes: notes || null,
        billing_address_line1: billingLine1 || null,
        billing_address_line2: billingLine2 || null,
        billing_city: billingCity || null,
        billing_state: billingState || null,
        billing_postcode: billingPostcode || null,
        billing_country: billingCountry || null,
        shipping_address_line1: shippingLine1 || null,
        shipping_address_line2: shippingLine2 || null,
        shipping_city: shippingCity || null,
        shipping_state: shippingState || null,
        shipping_postcode: shippingPostcode || null,
        shipping_country: shippingCountry || null,
        line_items: lineItems.map((item, i) => {
          const qty = item.line_type === "services" ? 1 : item.quantity
          return {
            description: item.description,
            account_id: item.account_id || undefined,
            quantity: qty,
            unit_price: item.unit_price,
            tax_rate: item.tax_rate,
            tax_code_id: item.tax_code_id || undefined,
            discount: item.discount,
            discount_mode: item.discount_mode,
            amount: item.amount,
            sort_order: i,
          }
        }),
      } as any)
      toast("Bill updated", "success")
      navigate("/purchases/bills")
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      toast(typeof detail === "string" ? detail : "Failed to update bill", "warning")
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="text-xs text-muted-foreground">Purchases &rsaquo; Bills</div>
        <div className="text-2xl font-semibold tracking-tight text-foreground">Edit Bill</div>
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
            <Input value={billNumber} onChange={e => setBillNumber(e.target.value)} placeholder="BILL-0001" className="h-10 rounded-xl" />
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

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border p-4">
            <div className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Billing Address</div>
            <div className="space-y-2">
              <Input value={billingLine1} onChange={e => setBillingLine1(e.target.value)} placeholder="Address Line 1" className="h-9 rounded-lg text-sm" />
              <Input value={billingLine2} onChange={e => setBillingLine2(e.target.value)} placeholder="Address Line 2" className="h-9 rounded-lg text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <Input value={billingCity} onChange={e => setBillingCity(e.target.value)} placeholder="City" className="h-9 rounded-lg text-sm" />
                <Input value={billingState} onChange={e => setBillingState(e.target.value)} placeholder="State" className="h-9 rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input value={billingPostcode} onChange={e => setBillingPostcode(e.target.value)} placeholder="Postcode" className="h-9 rounded-lg text-sm" />
                <Input value={billingCountry} onChange={e => setBillingCountry(e.target.value)} placeholder="Country" className="h-9 rounded-lg text-sm" />
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border p-4">
            <div className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Shipping Address</div>
            <div className="space-y-2">
              <Input value={shippingLine1} onChange={e => setShippingLine1(e.target.value)} placeholder="Address Line 1" className="h-9 rounded-lg text-sm" />
              <Input value={shippingLine2} onChange={e => setShippingLine2(e.target.value)} placeholder="Address Line 2" className="h-9 rounded-lg text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <Input value={shippingCity} onChange={e => setShippingCity(e.target.value)} placeholder="City" className="h-9 rounded-lg text-sm" />
                <Input value={shippingState} onChange={e => setShippingState(e.target.value)} placeholder="State" className="h-9 rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input value={shippingPostcode} onChange={e => setShippingPostcode(e.target.value)} placeholder="Postcode" className="h-9 rounded-lg text-sm" />
                <Input value={shippingCountry} onChange={e => setShippingCountry(e.target.value)} placeholder="Country" className="h-9 rounded-lg text-sm" />
              </div>
            </div>
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

        <div className="mt-3">
          <Button type="button" onClick={() => setLineItems(p => [...p, emptyLine()])} className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white shadow-sm hover:opacity-95">
            <Plus className="mr-1.5 h-4 w-4" /> Item
          </Button>
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
          <Button type="button" onClick={handleSave} disabled={updateBill.isPending || !contactId || !issueDate || !lineItems.some(li => li.description.trim()) || !linesValid} className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white hover:opacity-95">
            {updateBill.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : "Save Changes"}
          </Button>
        </div>
      </Card>

      {activity && activity.events.length > 0 && (
        <Card className="rounded-2xl border-border bg-card p-6 shadow-sm">
          <div className="mb-3 text-sm font-semibold text-foreground">Transaction History</div>
          <div className="space-y-2">
            {activity.events.map((ev: InvoiceActivityEvent, idx: number) => (
              <div key={idx} className="flex items-start justify-between gap-3 border-b border-border py-2 last:border-0">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-medium text-foreground capitalize">{ev.type.replace(/_/g, " ")}</span>
                  <span className="text-xs text-muted-foreground">{ev.ref} {ev.note ? `— ${ev.note}` : ""}</span>
                  {ev.ts && <span className="text-[11px] text-muted-foreground">{new Date(ev.ts).toLocaleDateString()}</span>}
                </div>
                <div className="text-right">
                  {ev.delta !== 0 && <div className={`text-xs font-semibold ${ev.delta < 0 ? "text-emerald-600" : "text-foreground"}`}>{ev.delta < 0 ? `-${Math.abs(ev.delta).toFixed(2)}` : `+${ev.delta.toFixed(2)}`}</div>}
                  <div className="text-[11px] text-muted-foreground">Bal: {ev.balance.toFixed(2)}</div>
                </div>
              </div>
            ))}
          </div>
          {activity.outstanding !== undefined && (
            <div className="mt-3 flex justify-end border-t border-border pt-3">
              <div className="text-sm font-semibold text-foreground">Outstanding: {activity.outstanding.toFixed(2)}</div>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
