import { useState, useEffect, useRef } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { useDebitNote, useUpdateDebitNote, useContacts, useAccounts, useInvoices, useTaxRates, useDebitNoteActivity, type InvoiceActivityEvent } from "../../../lib/hooks"
import { getContactPrefs } from "../../../lib/contact-prefs"
import { Card } from "../../../components/ui/card"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select"
import { SearchableSelect } from "../../../components/ui/searchable-select"
import { LineItemsEditor } from "../../../components/line-items/LineItemsEditor"
import type { LineItem } from "../../../components/line-items/types"

function emptyLine(): LineItem {
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

function lineDiscountAmount(item: LineItem): number {
  const lineTotal = item.quantity * item.unit_price
  return item.discount_mode === "amount"
    ? Math.min(item.discount, lineTotal)
    : (lineTotal * item.discount) / 100
}

export default function EditDebitNotePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: debitNote, isLoading } = useDebitNote(id)
  const { data: contacts = [] } = useContacts()
  const { data: accounts = [] } = useAccounts()
  const { data: invoices = [] } = useInvoices()
  const { data: taxRates = [] } = useTaxRates()
  const updateDebitNote = useUpdateDebitNote()
  const { data: activity } = useDebitNoteActivity(id)
  const populated = useRef(false)

  const [debitNoteNumber, setDebitNoteNumber] = useState("")
  const [customerId, setCustomerId] = useState("")
  const [linkedInvoiceId, setLinkedInvoiceId] = useState("")
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [reference, setReference] = useState("")
  const [currency, setCurrency] = useState("MYR")
  const [lines, setLines] = useState<LineItem[]>([emptyLine()])

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

  useEffect(() => {
    if (!debitNote || populated.current) return
    setDebitNoteNumber(debitNote.debit_note_number ?? "")
    setCustomerId(String(debitNote.contact_id ?? ""))
    setLinkedInvoiceId(String(debitNote.invoice_id ?? ""))
    setDate(debitNote.issue_date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10))
    setReference(debitNote.reference ?? "")
    setBillingLine1(debitNote.billing_address_line1 ?? "")
    setBillingLine2(debitNote.billing_address_line2 ?? "")
    setBillingCity(debitNote.billing_city ?? "")
    setBillingState(debitNote.billing_state ?? "")
    setBillingPostcode(debitNote.billing_postcode ?? "")
    setBillingCountry(debitNote.billing_country ?? "")
    setShippingLine1(debitNote.shipping_address_line1 ?? "")
    setShippingLine2(debitNote.shipping_address_line2 ?? "")
    setShippingCity(debitNote.shipping_city ?? "")
    setShippingState(debitNote.shipping_state ?? "")
    setShippingPostcode(debitNote.shipping_postcode ?? "")
    setShippingCountry(debitNote.shipping_country ?? "")
    if (debitNote.line_items?.length) {
      setLines(debitNote.line_items.map((l: any) => ({
        line_type: (l.line_type === "services" ? "services" : "goods") as "goods" | "services",
        description: l.description ?? "",
        account_id: l.account_id ? String(l.account_id) : "",
        quantity: l.quantity ?? 1,
        unit_price: l.unit_price ?? 0,
        discount: l.discount ?? 0,
        discount_mode: (l.discount_mode === "amount" ? "amount" : "percent") as "percent" | "amount",
        tax_rate: l.tax_rate ?? 0,
        tax_code_id: l.tax_code_id ? String(l.tax_code_id) : "",
        amount: (l.quantity ?? 1) * (l.unit_price ?? 0),
      })))
    }
    populated.current = true
  }, [debitNote])

  const customers = contacts.filter((c: any) => c.type === "customer" || c.type === "both")

  const handleCustomerChange = (v: string) => {
    if (v === "__add_new__") { navigate("/contacts/new"); return }
    setCustomerId(v)
    setLinkedInvoiceId("")
    const contact = contacts.find((c: any) => c.id === v) as any
    if (contact) {
      setBillingLine1(contact.billing_address_line1 ?? "")
      setBillingLine2(contact.billing_address_line2 ?? "")
      setBillingCity(contact.billing_city ?? "")
      setBillingState(contact.billing_state ?? "")
      setBillingPostcode(contact.billing_postcode ?? "")
      setBillingCountry(contact.billing_country ?? "")
    }
    const prefs = getContactPrefs(v)
    if (prefs.currency) setCurrency(prefs.currency)
  }

  const filteredInvoices = customerId
    ? invoices.filter((inv: any) => inv.contact_id === customerId)
    : invoices

  const updateLine = (idx: number, field: keyof LineItem, value: string | number) => {
    setLines(prev => {
      const updated = [...prev]
      const line = { ...updated[idx], [field]: value }
      if (field === "tax_code_id") {
        const tc = taxRates.find((t: any) => t.id === value)
        if (tc) line.tax_rate = tc.rate
      }
      updated[idx] = line
      return updated
    })
  }

  const addLine = () => setLines(prev => [...prev, emptyLine()])
  const removeLine = (idx: number) => {
    setLines(prev => prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx))
  }

  const subTotal = lines.reduce((sum, l) => sum + l.quantity * l.unit_price, 0)
  const totalDiscount = lines.reduce((sum, l) => sum + lineDiscountAmount(l), 0)
  const totalTax = lines.reduce((sum, l) => sum + (l.quantity * l.unit_price - lineDiscountAmount(l)) * (l.tax_rate / 100), 0)
  const total = subTotal - totalDiscount + totalTax

  const handleSave = () => {
    updateDebitNote.mutate(
      {
        id,
        contact_id: customerId,
        debit_note_number: debitNoteNumber || undefined,
        invoice_id: linkedInvoiceId || undefined,
        issue_date: date,
        reference,
        notes: null,
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
        line_items: lines.map(l => ({
          description: l.description,
          line_type: l.line_type,
          account_id: l.account_id || undefined,
          quantity: l.quantity,
          unit_price: l.unit_price,
          discount: l.discount,
          discount_mode: l.discount_mode,
          tax_rate: l.tax_rate,
          tax_code_id: l.tax_code_id || undefined,
        })),
      } as any,
      { onSuccess: () => navigate("/sales/debit-notes") }
    )
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!debitNote) {
    return <div className="p-6 text-muted-foreground">Debit note not found.</div>
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Sales</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Edit Debit Note {debitNote.debit_note_number}</div>
      </div>

      <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Debit Note #</label>
              <Input value={debitNoteNumber} onChange={e => setDebitNoteNumber(e.target.value)} placeholder="DN-000000" className="mt-1.5 h-10 rounded-xl" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Customer</label>
              <SearchableSelect
                value={customerId}
                onChange={handleCustomerChange}
                placeholder="Search or select customer"
                options={customers.map((c: any) => ({ value: c.id, label: c.name, hint: (c as any).email ?? "" }))}
                footerAction={{ label: "+ Add New Customer", onClick: () => navigate("/contacts/new") }}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Linked Invoice</label>
              <Select value={linkedInvoiceId} onValueChange={setLinkedInvoiceId}>
                <SelectTrigger className="mt-1.5 h-10 rounded-xl"><SelectValue placeholder="Select invoice" /></SelectTrigger>
                <SelectContent>
                  {filteredInvoices.map((inv: any) => <SelectItem key={inv.id} value={inv.id}>{inv.invoice_number}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Date</label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1.5 h-10 rounded-xl" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Reference</label>
              <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="Enter reference" className="mt-1.5 h-10 rounded-xl" />
            </div>
          </div>

          {/* Billing & Shipping Address */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-border p-4">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Billing Address</div>
              <div className="flex flex-col gap-2">
                <Input value={billingLine1} onChange={e => setBillingLine1(e.target.value)} placeholder="Address Line 1" className="h-9 rounded-lg" />
                <Input value={billingLine2} onChange={e => setBillingLine2(e.target.value)} placeholder="Address Line 2" className="h-9 rounded-lg" />
                <div className="grid grid-cols-2 gap-2">
                  <Input value={billingCity} onChange={e => setBillingCity(e.target.value)} placeholder="City" className="h-9 rounded-lg" />
                  <Input value={billingState} onChange={e => setBillingState(e.target.value)} placeholder="State" className="h-9 rounded-lg" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input value={billingPostcode} onChange={e => setBillingPostcode(e.target.value)} placeholder="Postcode" className="h-9 rounded-lg" />
                  <Input value={billingCountry} onChange={e => setBillingCountry(e.target.value)} placeholder="Country" className="h-9 rounded-lg" />
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border p-4">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Shipping Address</div>
              <div className="flex flex-col gap-2">
                <Input value={shippingLine1} onChange={e => setShippingLine1(e.target.value)} placeholder="Address Line 1" className="h-9 rounded-lg" />
                <Input value={shippingLine2} onChange={e => setShippingLine2(e.target.value)} placeholder="Address Line 2" className="h-9 rounded-lg" />
                <div className="grid grid-cols-2 gap-2">
                  <Input value={shippingCity} onChange={e => setShippingCity(e.target.value)} placeholder="City" className="h-9 rounded-lg" />
                  <Input value={shippingState} onChange={e => setShippingState(e.target.value)} placeholder="State" className="h-9 rounded-lg" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input value={shippingPostcode} onChange={e => setShippingPostcode(e.target.value)} placeholder="Postcode" className="h-9 rounded-lg" />
                  <Input value={shippingCountry} onChange={e => setShippingCountry(e.target.value)} placeholder="Country" className="h-9 rounded-lg" />
                </div>
              </div>
            </div>
          </div>

          <LineItemsEditor
            items={lines}
            updateLine={updateLine}
            addLine={addLine}
            removeLine={removeLine}
            accounts={accounts as any[]}
            taxRates={taxRates as any[]}
            currency={currency}
            quantityHeading="Quantity"
            servicesQtyStyle="span"
            discountToggleTitle
          />

          <div className="flex justify-end">
            <div className="w-full max-w-sm flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Sub Total</span>
                <span className="text-foreground">{subTotal.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Discount</span>
                <span className="text-foreground">- {totalDiscount.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Tax</span>
                <span className="text-foreground">{totalTax.toFixed(2)}</span>
              </div>
              <div className="border-t border-border pt-2 flex items-center justify-between text-sm font-semibold">
                <span className="text-foreground">TOTAL</span>
                <span className="text-foreground">{total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {activity && (
        <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
          <div className="mb-4 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-foreground">Activity</h3>
            <div className="text-xs text-muted-foreground">Total {activity.total.toFixed(2)}</div>
          </div>
          {activity.events.length === 0 ? (
            <div className="text-sm text-muted-foreground">No activity yet.</div>
          ) : (
            <div className="space-y-3">
              {activity.events.map((ev: InvoiceActivityEvent, idx: number) => (
                <SimpleActivityRow key={`${ev.type}-${ev.ref_id}-${idx}`} event={ev} />
              ))}
            </div>
          )}
        </Card>
      )}

      <div className="flex items-center justify-end">
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" onClick={() => navigate("/sales/debit-notes")}>Cancel</Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={updateDebitNote.isPending || !customerId || !lines.some(l => l.description?.trim()) || !lines.every(l => l.account_id)}
            className="h-9 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 text-xs font-semibold text-white shadow-sm hover:opacity-95"
          >
            {updateDebitNote.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  )
}

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  issued: "Issued", credit_note: "Credit Note", debit_note: "Debit Note",
  payment: "Payment", refund: "Refund", journal: "Journal",
}
const ACTIVITY_TYPE_COLORS: Record<string, string> = {
  issued: "bg-blue-100 text-blue-700", credit_note: "bg-rose-100 text-rose-700",
  debit_note: "bg-amber-100 text-amber-700", payment: "bg-emerald-100 text-emerald-700",
  refund: "bg-orange-100 text-orange-700", journal: "bg-slate-100 text-slate-700",
}
function SimpleActivityRow({ event }: { event: InvoiceActivityEvent }) {
  const date = event.ts ? new Date(event.ts).toLocaleDateString() : "—"
  const sign = event.delta > 0 ? "+" : event.delta < 0 ? "−" : ""
  const amount = Math.abs(event.delta).toFixed(2)
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-background/50 p-3">
      <div className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${ACTIVITY_TYPE_COLORS[event.type] ?? "bg-slate-100 text-slate-700"}`}>
        {ACTIVITY_TYPE_LABELS[event.type] ?? event.type}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-sm font-medium text-foreground truncate">{event.ref}</div>
          <div className="text-xs text-muted-foreground shrink-0">{date}</div>
        </div>
        {event.note && <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{event.note}</div>}
      </div>
      <div className="text-right shrink-0">
        {event.delta !== 0 && (
          <div className={`text-sm font-semibold ${event.delta > 0 ? "text-amber-600" : "text-emerald-600"}`}>{sign}{amount}</div>
        )}
        <div className="text-[11px] text-muted-foreground">Bal {event.balance.toFixed(2)}</div>
      </div>
    </div>
  )
}
