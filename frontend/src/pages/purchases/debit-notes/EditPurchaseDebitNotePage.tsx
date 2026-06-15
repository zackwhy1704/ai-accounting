import { useState, useEffect, useRef } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { usePurchaseDebitNote, useUpdatePurchaseDebitNote, useContacts, useAccounts, useBills, useTaxRates, usePurchaseDebitNoteActivity, type InvoiceActivityEvent } from "../../../lib/hooks"
import { Card } from "../../../components/ui/card"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select"
import { SearchableSelect } from "../../../components/ui/searchable-select"
import { LineItemsEditor } from "../../../components/line-items/LineItemsEditor"
import { useToast } from "../../../components/ui/toast"
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

export default function EditPurchaseDebitNotePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data: debitNote, isLoading } = usePurchaseDebitNote(id)
  const { data: contacts = [] } = useContacts()
  const { data: accounts = [] } = useAccounts()
  const { data: bills = [] } = useBills()
  const { data: taxRates = [] } = useTaxRates()
  const updateDebitNote = useUpdatePurchaseDebitNote()
  const { data: activity } = usePurchaseDebitNoteActivity(id)
  const populated = useRef(false)

  const [debitNoteNumber, setDebitNoteNumber] = useState("")
  const [vendorId, setVendorId] = useState("")
  const [linkedBillId, setLinkedBillId] = useState("")
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [reference, setReference] = useState("")
  const [lines, setLines] = useState<LineItem[]>([emptyLine()])

  useEffect(() => {
    if (!debitNote || populated.current) return
    setDebitNoteNumber(debitNote.debit_note_number ?? "")
    setVendorId(String(debitNote.contact_id ?? ""))
    setLinkedBillId(String(debitNote.bill_id ?? ""))
    setDate(debitNote.issue_date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10))
    setReference(debitNote.reference ?? "")
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

  const vendors = (contacts as any[]).filter((c: any) => c.type === "supplier" || c.type === "vendor" || c.type === "both")
  const filteredBills = vendorId
    ? (bills as any[]).filter((b: any) => b.contact_id === vendorId)
    : (bills as any[])

  const handleVendorChange = (v: string) => {
    if (v === "__add_new__") { navigate("/contacts/new"); return }
    setVendorId(v)
    setLinkedBillId("")
  }

  const updateLine = (idx: number, field: keyof LineItem, value: string | number) => {
    setLines(prev => {
      const updated = [...prev]
      const line = { ...updated[idx], [field]: value }
      if (field === "tax_code_id") {
        const tc = (taxRates as any[]).find((t: any) => t.id === value)
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
  const linesValid = lines.length > 0 && lines.every(l => l.account_id)

  const handleSave = () => {
    updateDebitNote.mutate(
      {
        id,
        contact_id: vendorId,
        debit_note_number: debitNoteNumber || undefined,
        bill_id: linkedBillId || undefined,
        issue_date: date,
        reference,
        notes: null,
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
      {
        onSuccess: () => navigate("/purchases/debit-notes"),
        onError: (err: any) => toast(err?.response?.data?.detail ?? "Failed to save debit note", "warning"),
      }
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
        <div className="text-xs text-muted-foreground">Purchases</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Edit Debit Note {debitNote.debit_note_number}</div>
      </div>

      <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Debit Note #</label>
              <Input value={debitNoteNumber} onChange={e => setDebitNoteNumber(e.target.value)} placeholder="PDN-000001" className="mt-1.5 h-10 rounded-xl" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Vendor</label>
              <SearchableSelect
                value={vendorId}
                onChange={handleVendorChange}
                placeholder="Search or select vendor"
                options={vendors.map((c: any) => ({ value: c.id, label: c.name, hint: (c as any).email ?? "" }))}
                footerAction={{ label: "+ Add New Vendor", onClick: () => navigate("/contacts/new") }}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Linked Bill</label>
              <Select value={linkedBillId} onValueChange={setLinkedBillId}>
                <SelectTrigger className="mt-1.5 h-10 rounded-xl"><SelectValue placeholder="Select bill (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No linked bill</SelectItem>
                  {filteredBills.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.bill_number}</SelectItem>)}
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

          <LineItemsEditor
            items={lines}
            updateLine={updateLine}
            addLine={addLine}
            removeLine={removeLine}
            accounts={accounts as any[]}
            taxRates={taxRates as any[]}
            currency="MYR"
            quantityHeading="Quantity"
            typeTriggerClassName="text-xs"
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

      <div className="flex items-center justify-end">
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" onClick={() => navigate("/purchases/debit-notes")}>Cancel</Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={updateDebitNote.isPending || !vendorId || !lines.some(l => l.description?.trim()) || !linesValid}
            className="h-9 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 text-xs font-semibold text-white shadow-sm hover:opacity-95"
          >
            {updateDebitNote.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

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
