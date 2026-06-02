import { useState, useEffect, useRef, useMemo } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { useContacts, useBankAccounts, usePurchasePayment, useUpdatePurchasePayment, useBills, usePurchasePaymentActivity, type InvoiceActivityEvent } from "../../lib/hooks"
import { getContactPrefs, saveContactPref } from "../../lib/contact-prefs"
import { useToast } from "../../components/ui/toast"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"
import { SearchableSelect } from "../../components/ui/searchable-select"

export default function EditPurchasePaymentPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data: contacts = [] } = useContacts()
  const { data: bankAccounts = [] } = useBankAccounts()
  const { data: bills = [] } = useBills()
  const { data } = usePurchasePayment(id!)
  const updatePayment = useUpdatePurchasePayment()
  const { data: activity } = usePurchasePaymentActivity(id)

  const [paymentNo, setPaymentNo] = useState("")
  const [contactId, setContactId] = useState("")
  const [billId, setBillId] = useState("")
  const [paymentDate, setPaymentDate] = useState("")
  const [amount, setAmount] = useState("")
  const [currency, setCurrency] = useState("MYR")
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer")
  const [bankAccountId, setBankAccountId] = useState("")
  const [referenceNo, setReferenceNo] = useState("")
  const [notes, setNotes] = useState("")

  const populated = useRef(false)
  useEffect(() => {
    if (data && !populated.current) {
      populated.current = true
      setPaymentNo(data.payment_no || "")
      setContactId(String(data.contact_id || ""))
      setBillId(String((data as any).bill_id || ""))
      setPaymentDate(data.payment_date ? data.payment_date.slice(0, 10) : "")
      setAmount(data.amount != null ? String(data.amount) : "")
      setCurrency(data.currency || "MYR")
      setPaymentMethod(data.payment_method || "bank_transfer")
      setBankAccountId(String((data as any).bank_account_id || ""))
      setReferenceNo(data.reference_no || "")
      setNotes(data.notes || "")
    }
  }, [data])

  const filteredBills = useMemo(() => {
    if (!contactId) return bills as any[]
    return (bills as any[]).filter((b: any) => String(b.contact_id) === contactId && b.status !== "void" && b.status !== "draft")
  }, [bills, contactId])

  const handleSave = async () => {
    if (!paymentDate) { toast("Please enter payment date", "warning"); return }
    if (!amount || Number(amount) <= 0) { toast("Please enter a valid amount", "warning"); return }
    try {
      await updatePayment.mutateAsync({
        id: id!,
        contact_id: contactId || null,
        bill_id: billId || null,
        payment_no: paymentNo || undefined,
        payment_date: new Date(paymentDate).toISOString(),
        amount: Number(amount),
        currency,
        payment_method: paymentMethod,
        bank_account_id: bankAccountId || null,
        reference_no: referenceNo || null,
        notes: notes || null,
      })
      toast("Payment updated", "success")
      navigate("/purchases/payments")
    } catch {
      toast("Failed to update payment", "warning")
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="text-xs text-muted-foreground">Purchases &rsaquo; Payments</div>
        <div className="text-2xl font-semibold tracking-tight text-foreground">Edit Payment to Supplier</div>
      </div>

      <Card className="rounded-2xl border-border bg-card p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 max-w-3xl">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Payment #</label>
            <Input value={paymentNo} onChange={e => setPaymentNo(e.target.value)} placeholder="PPY-000000" className="h-10 rounded-xl" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Supplier</label>
            <SearchableSelect
              value={contactId}
              onChange={v => { if (v === "__add_new__") { navigate("/contacts/new"); return } setContactId(v); setBillId(""); if (v) { const prefs = getContactPrefs(v); if (prefs.currency) setCurrency(prefs.currency) } }}
              placeholder="Select supplier (optional)"
              options={(contacts as any[]).filter((c: any) => c.type === "supplier" || c.type === "vendor" || c.type === "both").map((c: any) => ({ value: c.id, label: c.name, hint: c.email ?? "" }))}
              footerAction={{ label: "+ Add New Supplier", onClick: () => navigate("/contacts/new") }}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Linked Bill</label>
            <Select value={billId || "__none__"} onValueChange={v => setBillId(v === "__none__" ? "" : v)}>
              <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Select bill (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No linked bill</SelectItem>
                {filteredBills.map((b: any) => (
                  <SelectItem key={b.id} value={b.id}>{b.bill_number} — bal {(parseFloat(b.total) - parseFloat(b.amount_paid || 0)).toFixed(2)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Payment Date *</label>
            <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className="h-10 rounded-xl" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Amount *</label>
            <Input type="number" min={0} step={0.01} value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="h-10 rounded-xl" />
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
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Payment Method</label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Select method" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="online_payment">Online Payment</SelectItem>
                <SelectItem value="fpx">FPX</SelectItem>
                <SelectItem value="card">Card</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Bank Account</label>
            <SearchableSelect
              value={bankAccountId}
              onChange={setBankAccountId}
              placeholder="Search or select account"
              options={bankAccounts.map((a: any) => ({ value: a.id, label: a.name, hint: a.account_number ?? a.bank_name ?? "" }))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Reference No</label>
            <Input value={referenceNo} onChange={e => setReferenceNo(e.target.value)} placeholder="Optional" className="h-10 rounded-xl" />
          </div>
        </div>

        <div className="mt-4 max-w-3xl">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Internal notes..." className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button type="button" variant="secondary" className="h-9 rounded-xl px-3 text-xs font-semibold" onClick={() => navigate("/purchases/payments")}>Cancel</Button>
          <Button type="button" onClick={handleSave} disabled={updatePayment.isPending || !paymentDate || !amount || Number(amount) <= 0} className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white hover:opacity-95">
            {updatePayment.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : "Save Changes"}
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
