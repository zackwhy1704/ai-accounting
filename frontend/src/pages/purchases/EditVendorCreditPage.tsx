import { useState, useEffect, useRef } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Plus, Trash2, Loader2 } from "lucide-react"
import { useContacts, useAccounts, useBills, usePurchaseCreditNote, useUpdatePurchaseCreditNote, useTaxRates } from "../../lib/hooks"
import { getContactPrefs, saveContactPref } from "../../lib/contact-prefs"
import { useToast } from "../../components/ui/toast"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"
import { SearchableSelect } from "../../components/ui/searchable-select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table"

interface LineItem {
  id: string
  description: string
  line_type: "goods" | "services"
  accountId: string
  quantity: number
  unitPrice: number
  discount: number
  discount_mode: "percent" | "amount"
  taxRate: number
  taxCodeId: string
}

function lineDiscountAmount(item: LineItem): number {
  const lineTotal = item.quantity * item.unitPrice
  return item.discount_mode === "amount" ? Math.min(item.discount, lineTotal) : (lineTotal * item.discount) / 100
}

const emptyLine = (): LineItem => ({
  id: crypto.randomUUID(),
  description: "",
  line_type: "goods",
  accountId: "",
  quantity: 1,
  unitPrice: 0,
  discount: 0,
  discount_mode: "percent",
  taxRate: 0,
  taxCodeId: "",
})

export default function EditVendorCreditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data: contacts = [] } = useContacts()
  const { data: allBills = [] } = useBills()
  const { data: taxRates = [] } = useTaxRates()
  const { data: accounts = [] } = useAccounts()
  const { data } = usePurchaseCreditNote(id!)
  const updatePCN = useUpdatePurchaseCreditNote()

  const [pcnNumber, setPcnNumber] = useState("")
  const [vendorId, setVendorId] = useState("")
  const [linkedBillId, setLinkedBillId] = useState("")
  const [date, setDate] = useState("")
  const [reference, setReference] = useState("")
  const [currency, setCurrency] = useState("MYR")
  const [notes, setNotes] = useState("")
  const [lines, setLines] = useState<LineItem[]>([emptyLine()])

  const populated = useRef(false)
  useEffect(() => {
    if (data && !populated.current) {
      populated.current = true
      setPcnNumber(data.pcn_number || "")
      setVendorId(data.contact_id || "")
      setLinkedBillId(data.bill_id || "")
      setDate(data.issue_date ? data.issue_date.slice(0, 10) : "")
      setReference(data.reference || "")
      setCurrency(data.currency || "MYR")
      setNotes(data.notes || "")
      if (data.line_items && data.line_items.length > 0) {
        setLines(data.line_items.map((li: any) => ({
          id: crypto.randomUUID(),
          description: li.description || "",
          line_type: (li.line_type === "services" ? "services" : "goods") as "goods" | "services",
          accountId: li.account_id || "",
          quantity: li.quantity ?? 1,
          unitPrice: li.unit_price ?? 0,
          discount: li.discount ?? 0,
          discount_mode: (li.discount_mode === "amount" ? "amount" : "percent") as "percent" | "amount",
          taxRate: li.tax_rate ?? 0,
          taxCodeId: li.tax_code_id || "",
        })))
      }
    }
  }, [data])

  const vendors = (contacts as any[]).filter((c: any) => c.type === "supplier" || c.type === "vendor" || c.type === "both")
  const filteredBills = vendorId
    ? (allBills as any[]).filter((b: any) => b.contact_id === vendorId && b.status !== "void")
    : (allBills as any[]).filter((b: any) => b.status !== "void")

  const handleVendorChange = (v: string) => {
    if (v === "__add_new__") { navigate("/contacts/new"); return }
    setVendorId(v)
    setLinkedBillId("")
    const prefs = getContactPrefs(v)
    if (prefs.currency) setCurrency(prefs.currency)
  }

  const updateLine = (lineId: string, field: keyof LineItem, value: any) => {
    setLines(prev => prev.map(l => {
      if (l.id !== lineId) return l
      const updated = { ...l, [field]: value }
      if (field === "taxCodeId") {
        const tc = (taxRates as any[]).find((t: any) => t.id === value)
        if (tc) updated.taxRate = tc.rate
      }
      if (field === "line_type" && value === "services") updated.quantity = 1
      return updated
    }))
  }

  const removeLine = (lineId: string) => {
    setLines(prev => (prev.length === 1 ? prev : prev.filter(l => l.id !== lineId)))
  }

  const subTotal = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0)
  const totalDiscount = lines.reduce((sum, l) => sum + lineDiscountAmount(l), 0)
  const totalTax = lines.reduce((sum, l) => sum + (l.quantity * l.unitPrice - lineDiscountAmount(l)) * (l.taxRate / 100), 0)
  const total = subTotal - totalDiscount + totalTax

  const isReadOnly = data?.status === "void" || data?.status === "applied"
  const isFormValid = !!vendorId && lines.some(l => l.description.trim() !== "")

  const handleSave = () => {
    if (!isFormValid) { toast("Please select a supplier and add at least one line item", "warning"); return }
    updatePCN.mutate(
      {
        id: id!,
        contact_id: vendorId,
        pcn_number: pcnNumber || undefined,
        bill_id: linkedBillId || null,
        issue_date: new Date(date).toISOString(),
        reference: reference || null,
        currency,
        notes: notes || null,
        line_items: lines.map((l, i) => ({
          description: l.description,
          line_type: l.line_type,
          account_id: l.accountId || undefined,
          quantity: l.quantity,
          unit_price: l.unitPrice,
          discount: l.discount,
          discount_mode: l.discount_mode,
          tax_rate: l.taxRate,
          tax_code_id: l.taxCodeId || undefined,
          amount: (l.quantity * l.unitPrice - lineDiscountAmount(l)) * (1 + l.taxRate / 100),
          sort_order: i,
        })),
      } as any,
      {
        onSuccess: () => { toast("Purchase credit note updated", "success"); navigate("/purchases/credit-notes") },
        onError: (err: any) => toast(err?.response?.data?.detail ?? "Failed to update credit note", "warning"),
      }
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Purchases › Credit Notes</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Edit Purchase Credit Note</div>
        {isReadOnly && <div className="mt-1 text-sm text-amber-600">This credit note is {data?.status} and cannot be edited.</div>}
      </div>

      <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Credit Note #</label>
              <Input
                value={pcnNumber}
                onChange={e => setPcnNumber(e.target.value)}
                placeholder="PCN-00001"
                disabled={isReadOnly}
                className="mt-1.5 h-10 rounded-xl"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Supplier *</label>
              <SearchableSelect
                value={vendorId}
                onChange={handleVendorChange}
                placeholder="Search or select supplier"
                options={vendors.map((c: any) => ({ value: c.id, label: c.name, hint: (c as any).email ?? "" }))}
                footerAction={{ label: "+ Add New Supplier", onClick: () => navigate("/contacts/new") }}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Linked Bill (optional)</label>
              <Select value={linkedBillId} onValueChange={v => setLinkedBillId(v === "__none__" ? "" : v)} disabled={isReadOnly}>
                <SelectTrigger className="mt-1.5 h-10 rounded-xl">
                  <SelectValue placeholder="Select bill (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No linked bill</SelectItem>
                  {filteredBills.map((b: any) => (
                    <SelectItem key={b.id} value={b.id}>{b.bill_number}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Date</label>
              <Input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                disabled={isReadOnly}
                className="mt-1.5 h-10 rounded-xl"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Reference</label>
              <Input
                value={reference}
                onChange={e => setReference(e.target.value)}
                placeholder="e.g. Supplier CN ref"
                disabled={isReadOnly}
                className="mt-1.5 h-10 rounded-xl"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Currency</label>
              <Select value={currency} onValueChange={v => { setCurrency(v); if (vendorId) saveContactPref(vendorId, "currency", v) }} disabled={isReadOnly}>
                <SelectTrigger className="mt-1.5 h-10 rounded-xl"><SelectValue /></SelectTrigger>
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

          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="w-[50px] text-muted-foreground">#</TableHead>
                  <TableHead className="w-[110px] text-muted-foreground">Type</TableHead>
                  <TableHead className="text-muted-foreground">Description</TableHead>
                  <TableHead className="w-[180px] text-muted-foreground">Account</TableHead>
                  <TableHead className="w-[100px] text-muted-foreground">Quantity</TableHead>
                  <TableHead className="w-[130px] text-muted-foreground">Unit Price</TableHead>
                  <TableHead className="w-[80px] text-muted-foreground">Discount</TableHead>
                  <TableHead className="w-[160px] text-muted-foreground">Tax Code</TableHead>
                  <TableHead className="w-[80px] text-muted-foreground">Tax %</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line, idx) => (
                  <TableRow key={line.id} className="border-border hover:bg-muted/50">
                    <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell>
                      <Select value={line.line_type} onValueChange={v => updateLine(line.id, "line_type", v as "goods" | "services")} disabled={isReadOnly}>
                        <SelectTrigger className="h-9 rounded-lg border-0 bg-transparent shadow-none focus:ring-1 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="goods">Goods</SelectItem>
                          <SelectItem value="services">Services</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        value={line.description}
                        onChange={e => updateLine(line.id, "description", e.target.value)}
                        placeholder="Item description"
                        disabled={isReadOnly}
                        className="h-9 rounded-lg border-0 bg-transparent px-2 text-sm shadow-none focus-visible:ring-1"
                      />
                    </TableCell>
                    <TableCell>
                      <SearchableSelect
                        value={line.accountId}
                        onChange={v => updateLine(line.id, "accountId", v)}
                        placeholder="Account"
                        options={(accounts as any[]).map((a: any) => ({ value: a.id, label: `${a.code} – ${a.name}`, hint: a.code }))}
                      />
                    </TableCell>
                    <TableCell>
                      {line.line_type === "services" ? (
                        <span className="px-2 text-sm text-muted-foreground">—</span>
                      ) : (
                        <Input
                          type="number" min={0}
                          value={line.quantity}
                          onChange={e => updateLine(line.id, "quantity", Number(e.target.value))}
                          disabled={isReadOnly}
                          className="h-9 rounded-lg border-0 bg-transparent px-2 text-sm shadow-none focus-visible:ring-1"
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number" min={0} step={0.01}
                        value={line.unitPrice}
                        onChange={e => updateLine(line.id, "unitPrice", Number(e.target.value))}
                        disabled={isReadOnly}
                        className="h-9 rounded-lg border-0 bg-transparent px-2 text-sm shadow-none focus-visible:ring-1"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number" min={0} step={0.01}
                          value={line.discount}
                          onChange={e => updateLine(line.id, "discount", Number(e.target.value))}
                          disabled={isReadOnly}
                          className="h-9 w-20 rounded-lg border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-1"
                        />
                        <button
                          type="button"
                          disabled={isReadOnly}
                          onClick={() => updateLine(line.id, "discount_mode", line.discount_mode === "percent" ? "amount" : "percent")}
                          className="h-7 w-9 rounded-md border border-border bg-muted/40 text-[11px] font-semibold text-foreground hover:bg-muted disabled:opacity-50"
                        >
                          {line.discount_mode === "percent" ? "%" : "#"}
                        </button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select value={line.taxCodeId} onValueChange={v => updateLine(line.id, "taxCodeId", v === "__none__" ? "" : v)} disabled={isReadOnly}>
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
                    <TableCell>
                      <Input
                        type="number" min={0} max={100} step={0.01}
                        value={line.taxRate}
                        onChange={e => updateLine(line.id, "taxRate", Number(e.target.value))}
                        disabled={isReadOnly}
                        className="h-9 rounded-lg border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-1"
                        placeholder="%"
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button" variant="ghost" size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => removeLine(line.id)}
                        disabled={isReadOnly}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {!isReadOnly && (
            <div>
              <Button
                type="button" variant="outline"
                className="h-9 rounded-xl border-blue-300 px-3 text-xs font-semibold text-blue-600 hover:bg-blue-50"
                onClick={() => setLines(prev => [...prev, emptyLine()])}
              >
                <Plus className="mr-2 h-4 w-4" /> Item
              </Button>
            </div>
          )}

          <div className="flex justify-end">
            <div className="w-full max-w-sm flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Sub Total</span>
                <span className="text-foreground">{currency} {subTotal.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Discount</span>
                <span className="text-foreground">- {currency} {totalDiscount.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Tax</span>
                <span className="text-foreground">{currency} {totalTax.toFixed(2)}</span>
              </div>
              <div className="border-t border-border pt-2 flex items-center justify-between text-sm font-semibold">
                <span className="text-foreground">TOTAL</span>
                <span className="text-foreground">{currency} {total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              disabled={isReadOnly}
              placeholder="Internal notes..."
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-end">
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" onClick={() => navigate("/purchases/credit-notes")}>
            {isReadOnly ? "Back" : "Cancel"}
          </Button>
          {!isReadOnly && (
            <Button
              type="button"
              onClick={handleSave}
              disabled={updatePCN.isPending || !isFormValid}
              className="h-9 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 text-xs font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {updatePCN.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : "Save Changes"}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
