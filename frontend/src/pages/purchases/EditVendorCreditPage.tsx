import { useState, useEffect, useRef } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Plus, Trash2, Loader2 } from "lucide-react"
import { useContacts, useBills, useVendorCredit, useUpdateVendorCredit, useTaxRates, useAccounts } from "../../lib/hooks"
import { getContactPrefs, saveContactPref } from "../../lib/contact-prefs"
import { useToast } from "../../components/ui/toast"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"
import { SearchableSelect } from "../../components/ui/searchable-select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table"

interface LineItem {
  description: string
  account_id: string
  quantity: number
  unit_price: number
  amount: number
  discount: number
  discount_mode: "percent" | "amount"
  tax_rate: number
  line_type: "goods" | "services"
  tax_code_id: string
}

function lineDiscountAmount(item: LineItem): number {
  const lineTotal = item.quantity * item.unit_price
  return item.discount_mode === "amount" ? Math.min(item.discount, lineTotal) : (lineTotal * item.discount) / 100
}

function newLine(): LineItem {
  return { description: "", account_id: "", quantity: 1, unit_price: 0, amount: 0, discount: 0, discount_mode: "percent", tax_rate: 0, line_type: "goods", tax_code_id: "" }
}

export default function EditVendorCreditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data: contacts = [] } = useContacts()
  const { data: allBills = [] } = useBills()
  const { data: taxRates = [] } = useTaxRates()
  const { data: accounts = [] } = useAccounts()
  const { data } = useVendorCredit(id!)
  const updateVendorCredit = useUpdateVendorCredit()

  const [vendorCreditNumber, setVendorCreditNumber] = useState("")
  const [contactId, setContactId] = useState("")
  const [billId, setBillId] = useState("")
  const [issueDate, setIssueDate] = useState("")
  const [currency, setCurrency] = useState("MYR")
  const [notes, setNotes] = useState("")
  const [lineItems, setLineItems] = useState<LineItem[]>([newLine()])

  const populated = useRef(false)
  useEffect(() => {
    if (data && !populated.current) {
      populated.current = true
      setVendorCreditNumber(data.vendor_credit_number || "")
      setContactId(data.contact_id || "")
      setBillId(data.bill_id || "")
      setIssueDate(data.issue_date ? data.issue_date.slice(0, 10) : "")
      setCurrency(data.currency || "MYR")
      setNotes(data.notes || "")
      if (data.line_items && data.line_items.length > 0) {
        setLineItems(data.line_items.map((li: any) => ({
          description: li.description || "",
          account_id: li.account_id || "",
          quantity: li.quantity ?? 1,
          unit_price: li.unit_price ?? 0,
          discount: li.discount ?? 0,
          discount_mode: (li.discount_mode === "amount" ? "amount" : "percent") as "percent" | "amount",
          tax_code_id: li.tax_code_id || "",
          tax_rate: li.tax_rate ?? 0,
          line_type: (li.line_type === "services" ? "services" : "goods") as "goods" | "services",
          amount: li.amount ?? 0,
        })))
      }
    }
  }, [data])

  const supplierBills = (allBills as any[]).filter(
    (b: any) => String(b.contact_id) === String(contactId) && b.status !== "void"
  )

  const handleContactChange = (v: string) => {
    if (v === "__add_new__") { navigate("/contacts/new"); return }
    setContactId(v)
    setBillId("")
    const prefs = getContactPrefs(v)
    if (prefs.currency) setCurrency(prefs.currency)
  }

  const updateLine = (idx: number, field: keyof LineItem, value: string | number) => {
    setLineItems(prev => {
      const updated = [...prev]
      updated[idx] = { ...updated[idx], [field]: value }
      if (field === "tax_code_id") {
        const tc = (taxRates as any[]).find((t: any) => t.id === value)
        if (tc) updated[idx].tax_rate = tc.rate
      }
      if (field === "line_type" && value === "services") {
        updated[idx].quantity = 1
      }
      const item = updated[idx]
      const discAmt = lineDiscountAmount(item)
      const afterDiscount = item.quantity * item.unit_price - discAmt
      updated[idx].amount = afterDiscount * (1 + item.tax_rate / 100)
      return updated
    })
  }

  const subtotal = lineItems.reduce((s, i) => s + i.quantity * i.unit_price, 0)
  const totalDiscount = lineItems.reduce((s, i) => s + lineDiscountAmount(i), 0)
  const taxAmount = lineItems.reduce((s, i) => s + (i.quantity * i.unit_price - lineDiscountAmount(i)) * (i.tax_rate / 100), 0)
  const total = subtotal - totalDiscount + taxAmount

  const handleSave = async () => {
    if (!contactId) { toast("Please select a supplier", "warning"); return }
    if (!lineItems.some(li => li.description.trim())) { toast("Please add at least one line item", "warning"); return }
    try {
      await updateVendorCredit.mutateAsync({
        id: id!,
        contact_id: contactId,
        vendor_credit_number: vendorCreditNumber || undefined,
        bill_id: billId || null,
        issue_date: new Date(issueDate).toISOString(),
        currency,
        notes: notes || null,
        line_items: lineItems.map((item, i) => ({
          description: item.description,
          account_id: item.account_id || undefined,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount: item.discount,
          discount_mode: item.discount_mode,
          tax_rate: item.tax_rate,
          tax_code_id: item.tax_code_id || undefined,
          line_type: item.line_type,
          amount: item.amount,
          sort_order: i,
        })),
      })
      toast("Vendor credit updated", "success")
      navigate("/purchases/vendor-credits")
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      toast(typeof detail === "string" ? detail : "Failed to update vendor credit", "warning")
    }
  }

  const cardClass = "rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]"

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <div className="text-xs text-muted-foreground">Purchases &rsaquo; Credit Notes</div>
        <div className="text-2xl font-semibold tracking-tight text-foreground">Edit Vendor Credit</div>
      </div>

      <Card className={cardClass}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Credit #</label>
            <Input value={vendorCreditNumber} onChange={e => setVendorCreditNumber(e.target.value)} placeholder="VC-00001" className="h-10 rounded-xl" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Supplier *</label>
            <SearchableSelect
              value={contactId}
              onChange={handleContactChange}
              placeholder="Search or select supplier"
              options={(contacts as any[])
                .filter((c: any) => c.type === "supplier" || c.type === "vendor" || c.type === "both")
                .map((c: any) => ({ value: c.id, label: c.name, hint: c.email ?? "" }))}
              footerAction={{ label: "+ Add New Supplier", onClick: () => navigate("/contacts/new") }}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Related Bill (optional)</label>
            <SearchableSelect
              value={billId}
              onChange={setBillId}
              placeholder={contactId ? "Search bill this CN adjusts" : "Select supplier first"}
              allowClear
              options={supplierBills.map((b: any) => ({
                value: b.id,
                label: b.bill_number,
                hint: b.reference ?? "",
              }))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Issue Date</label>
            <Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className="h-10 rounded-xl" />
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

        <div className="mt-4">
          <Button
            type="button"
            onClick={() => setLineItems(p => [...p, newLine()])}
            className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white shadow-sm hover:opacity-95"
          >
            <Plus className="mr-1.5 h-4 w-4" /> Item
          </Button>
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-border">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="w-10 text-center text-muted-foreground">#</TableHead>
                <TableHead className="w-[100px] text-muted-foreground">Type</TableHead>
                <TableHead className="min-w-[200px] text-muted-foreground">Description</TableHead>
                <TableHead className="w-[160px] text-muted-foreground">Account</TableHead>
                <TableHead className="w-[80px] text-muted-foreground">Qty</TableHead>
                <TableHead className="w-[110px] text-muted-foreground">Unit Price</TableHead>
                <TableHead className="w-[80px] text-muted-foreground">Discount</TableHead>
                <TableHead className="w-[160px] text-muted-foreground">Tax Code</TableHead>
                <TableHead className="w-[80px] text-muted-foreground">Tax %</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineItems.length === 0 ? (
                <TableRow className="border-border">
                  <TableCell colSpan={10} className="py-8 text-center text-sm text-muted-foreground">No Data</TableCell>
                </TableRow>
              ) : (
                lineItems.map((item, idx) => (
                  <TableRow key={idx} className="border-border">
                    <TableCell className="text-center text-xs text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell>
                      <Select value={item.line_type} onValueChange={v => updateLine(idx, "line_type", v)}>
                        <SelectTrigger className="h-9 rounded-lg border-0 bg-transparent shadow-none">
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
                        triggerClassName="h-9 rounded-lg border-0 bg-transparent shadow-none text-xs"
                        options={(accounts as any[]).map((a: any) => ({ value: a.id, label: `${a.code} – ${a.name}`, hint: a.code }))}
                      />
                    </TableCell>
                    <TableCell>
                      {item.line_type === "services" ? (
                        <span className="px-1 text-sm text-muted-foreground">&mdash;</span>
                      ) : (
                        <Input type="number" min={0} value={item.quantity} onChange={e => updateLine(idx, "quantity", Number(e.target.value))} className="h-9 rounded-lg border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-1" />
                      )}
                    </TableCell>
                    <TableCell>
                      <Input type="number" min={0} step={0.01} value={item.unit_price} onChange={e => updateLine(idx, "unit_price", Number(e.target.value))} className="h-9 rounded-lg border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-1" />
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
                          title={item.discount_mode === "percent" ? "Switch to flat amount" : "Switch to percentage"}
                        >
                          {item.discount_mode === "percent" ? "%" : currency}
                        </button>
                      </div>
                    </TableCell>
                    <TableCell className="w-[160px]">
                      <Select value={item.tax_code_id} onValueChange={v => updateLine(idx, "tax_code_id", v === "__none__" ? "" : v)}>
                        <SelectTrigger className="h-9 rounded-lg border-0 bg-transparent shadow-none focus:ring-1 text-xs">
                          <SelectValue placeholder="Tax Code" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">No Tax</SelectItem>
                          {(taxRates as any[]).map((tc: any) => (
                            <SelectItem key={tc.id} value={tc.id}>{tc.code} ({tc.rate}%)</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="w-[80px]">
                      <Input type="number" min={0} max={100} step={0.01} value={item.tax_rate} onChange={e => updateLine(idx, "tax_rate", Number(e.target.value))} className="h-9 rounded-lg border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-1" placeholder="%" />
                    </TableCell>
                    <TableCell>
                      <button type="button" onClick={() => setLineItems(p => p.length <= 1 ? p : p.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-rose-500">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="mt-6 flex justify-end">
          <div className="w-full max-w-xs space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Sub Total</span>
              <span className="font-medium text-foreground">{currency} {subtotal.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span className="font-medium text-foreground">{currency} {taxAmount.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Discount</span>
              <span className="font-medium text-foreground">{currency} {totalDiscount.toFixed(2)}</span>
            </div>
            <div className="border-t border-border pt-2">
              <div className="flex items-center justify-between text-base font-semibold">
                <span className="text-foreground">TOTAL</span>
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
          <Button type="button" variant="secondary" className="h-9 rounded-xl px-3 text-xs font-semibold" onClick={() => navigate("/purchases/vendor-credits")}>Cancel</Button>
          <Button type="button" onClick={handleSave} disabled={updateVendorCredit.isPending || !contactId || !lineItems.some(li => li.description.trim())} className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white hover:opacity-95">
            {updateVendorCredit.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : "Save Changes"}
          </Button>
        </div>
      </Card>
    </div>
  )
}
