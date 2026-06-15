import { useState, useEffect, useRef, useMemo } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { useContacts, useAccounts, usePurchaseOrder, useUpdatePurchaseOrder, useTaxRates, usePurchaseOrderActivity, type InvoiceActivityEvent } from "../../lib/hooks"
import { getContactPrefs, saveContactPref } from "../../lib/contact-prefs"
import { useToast } from "../../components/ui/toast"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"
import { SearchableSelect } from "../../components/ui/searchable-select"
import { LineItemsEditor, useLineItems } from "../../components/line-items"

export default function EditPurchaseOrderPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data: contacts = [] } = useContacts()
  const { data: accounts = [] } = useAccounts()
  const { data: taxRates = [] } = useTaxRates()
  const { data } = usePurchaseOrder(id!)
  const updatePO = useUpdatePurchaseOrder()
  const { data: activity } = usePurchaseOrderActivity(id)

  const [poNumber, setPoNumber] = useState("")
  const [contactId, setContactId] = useState("")
  const [issueDate, setIssueDate] = useState("")
  const [expectedDate, setExpectedDate] = useState("")
  const [currency, setCurrency] = useState("MYR")
  const [deliveryAddress, setDeliveryAddress] = useState("")
  const [notes, setNotes] = useState("")

  const activeTaxRates = useMemo(() => taxRates.filter((tr: any) => tr.is_active), [taxRates])

  const { lineItems, setLineItems, updateLine, addLine, removeLine, subTotal, totalDiscount, totalTax, total } = useLineItems({
    servicesUsesUnitPriceOnly: true,
    taxRates: activeTaxRates,
    resetTaxRateWhenNoMatch: true,
  })

  const populated = useRef(false)
  useEffect(() => {
    if (data && !populated.current) {
      populated.current = true
      setPoNumber(data.po_number || "")
      setContactId(String(data.contact_id || ""))
      setIssueDate(data.issue_date ? data.issue_date.slice(0, 10) : "")
      setExpectedDate(data.expected_date ? data.expected_date.slice(0, 10) : "")
      setCurrency(data.currency || "MYR")
      setDeliveryAddress(data.delivery_address || "")
      setNotes(data.notes || "")
      if (data.line_items && data.line_items.length > 0) {
        setLineItems(data.line_items.map((li: any) => ({
          line_type: "goods" as const,
          description: li.description || "",
          account_id: li.account_id ? String(li.account_id) : "",
          quantity: li.quantity || 1,
          unit_price: li.unit_price || 0,
          discount: li.discount || 0,
          discount_mode: (li.discount_mode === "amount" ? "amount" : "percent") as "percent" | "amount",
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

  const linesValid = lineItems.length > 0 && lineItems.every(li => li.account_id)

  const handleSave = async () => {
    if (!contactId) { toast("Please select a supplier", "warning"); return }
    if (!issueDate) { toast("Please enter a PO date", "warning"); return }
    try {
      await updatePO.mutateAsync({
        id: id!,
        contact_id: contactId,
        po_number: poNumber || undefined,
        issue_date: new Date(issueDate).toISOString(),
        expected_date: expectedDate ? new Date(expectedDate).toISOString() : null,
        currency,
        delivery_address: deliveryAddress || null,
        notes: notes || null,
        line_items: lineItems.map((item, i) => ({
          description: item.description,
          account_id: item.account_id || undefined,
          quantity: item.line_type === "services" ? 1 : item.quantity,
          unit_price: item.unit_price,
          tax_rate: item.tax_rate,
          tax_code_id: item.tax_code_id || undefined,
          discount: item.discount,
          discount_mode: item.discount_mode,
          sort_order: i,
        })),
      } as any)
      toast("Purchase order updated", "success")
      navigate("/purchases/purchase-orders")
    } catch {
      toast("Failed to update purchase order", "warning")
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="text-xs text-muted-foreground">Purchases &rsaquo; Purchase Orders</div>
        <div className="text-2xl font-semibold tracking-tight text-foreground">Edit Purchase Order</div>
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
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">PO Date *</label>
            <Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className="h-10 rounded-xl" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Expected Delivery Date</label>
            <Input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} className="h-10 rounded-xl" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">PO #</label>
            <Input value={poNumber} onChange={e => setPoNumber(e.target.value)} placeholder="PO-0001" className="h-10 rounded-xl" />
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
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Delivery Address</label>
          <textarea value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} rows={2} placeholder="Delivery address (optional)" className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>

        <LineItemsEditor
          items={lineItems}
          updateLine={updateLine}
          addLine={addLine}
          removeLine={removeLine}
          accounts={accounts as any}
          taxRates={activeTaxRates as any}
          currency={currency}
          typeTriggerClassName="text-xs"
        />

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
          <Button type="button" variant="secondary" className="h-9 rounded-xl px-3 text-xs font-semibold" onClick={() => navigate("/purchases/purchase-orders")}>Cancel</Button>
          <Button type="button" onClick={handleSave} disabled={updatePO.isPending || !contactId || !issueDate || !lineItems.some(li => li.description.trim()) || !linesValid} className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white hover:opacity-95">
            {updatePO.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : "Save Changes"}
          </Button>
        </div>
      </Card>

      {activity && (
        <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
          <div className="mb-4 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-foreground">Activity</h3>
            <div className="text-xs text-muted-foreground">Total {activity.total.toFixed(2)}</div>
          </div>
          {activity.events.length === 0 ? <div className="text-sm text-muted-foreground">No activity yet.</div> : (
            <div className="space-y-3">{activity.events.map((ev: InvoiceActivityEvent, idx: number) => <SimpleActivityRow key={`${ev.type}-${ev.ref_id}-${idx}`} event={ev} />)}</div>
          )}
        </Card>
      )}
    </div>
  )
}

const ACTIVITY_TYPE_LABELS: Record<string, string> = { issued: "Issued", credit_note: "Credit Note", debit_note: "Debit Note", payment: "Payment", refund: "Refund", journal: "Journal" }
const ACTIVITY_TYPE_COLORS: Record<string, string> = { issued: "bg-blue-100 text-blue-700", credit_note: "bg-rose-100 text-rose-700", debit_note: "bg-amber-100 text-amber-700", payment: "bg-emerald-100 text-emerald-700", refund: "bg-orange-100 text-orange-700", journal: "bg-slate-100 text-slate-700" }
function SimpleActivityRow({ event }: { event: InvoiceActivityEvent }) {
  const date = event.ts ? new Date(event.ts).toLocaleDateString() : "—"
  const sign = event.delta > 0 ? "+" : event.delta < 0 ? "−" : ""
  const amount = Math.abs(event.delta).toFixed(2)
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-background/50 p-3">
      <div className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${ACTIVITY_TYPE_COLORS[event.type] ?? "bg-slate-100 text-slate-700"}`}>{ACTIVITY_TYPE_LABELS[event.type] ?? event.type}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-sm font-medium text-foreground truncate">{event.ref}</div>
          <div className="text-xs text-muted-foreground shrink-0">{date}</div>
        </div>
        {event.note && <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{event.note}</div>}
      </div>
      <div className="text-right shrink-0">
        {event.delta !== 0 && <div className={`text-sm font-semibold ${event.delta > 0 ? "text-amber-600" : "text-emerald-600"}`}>{sign}{amount}</div>}
        <div className="text-[11px] text-muted-foreground">Bal {event.balance.toFixed(2)}</div>
      </div>
    </div>
  )
}
