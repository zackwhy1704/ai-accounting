import { useState, useEffect, useRef } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { useContacts, usePurchaseRefund, useUpdatePurchaseRefund } from "../../lib/hooks"
import { getContactPrefs, saveContactPref } from "../../lib/contact-prefs"
import { useToast } from "../../components/ui/toast"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"

export default function EditPurchaseRefundPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data: contacts = [] } = useContacts()
  const { data } = usePurchaseRefund(id!)
  const updateRefund = useUpdatePurchaseRefund()

  const [contactId, setContactId] = useState("")
  const [paymentDate, setPaymentDate] = useState("")
  const [amount, setAmount] = useState("")
  const [currency, setCurrency] = useState("SGD")
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer")
  const [referenceNo, setReferenceNo] = useState("")
  const [notes, setNotes] = useState("")

  const populated = useRef(false)
  useEffect(() => {
    if (data && !populated.current) {
      populated.current = true
      setContactId(data.contact_id || "")
      setPaymentDate(data.payment_date ? data.payment_date.slice(0, 10) : "")
      setAmount(data.amount != null ? String(data.amount) : "")
      setCurrency(data.currency || "SGD")
      setPaymentMethod(data.payment_method || "bank_transfer")
      setReferenceNo(data.reference_no || "")
      setNotes(data.notes || "")
    }
  }, [data])

  const handleSave = async () => {
    if (!paymentDate) { toast("Please enter refund date", "warning"); return }
    if (!amount || Number(amount) <= 0) { toast("Please enter a valid amount", "warning"); return }
    try {
      await updateRefund.mutateAsync({
        id: id!,
        contact_id: contactId || null,
        refund_date: new Date(paymentDate).toISOString(),
        amount: Number(amount),
        currency,
        payment_method: paymentMethod,
        reference_no: referenceNo || null,
        notes: notes || null,
      })
      toast("Refund updated", "success")
      navigate("/purchases/refunds")
    } catch {
      toast("Failed to update refund", "warning")
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="text-xs text-muted-foreground">Purchases &rsaquo; Refunds</div>
        <div className="text-2xl font-semibold tracking-tight text-foreground">Edit Purchase Refund</div>
      </div>

      <Card className="rounded-2xl border-border bg-card p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 max-w-3xl">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Supplier</label>
            <Select value={contactId} onValueChange={v => { if (v === "__add_new__") { navigate("/contacts/new"); return } setContactId(v); if (v) { const prefs = getContactPrefs(v); if (prefs.currency) setCurrency(prefs.currency) } }}>
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue placeholder="Select supplier (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {contacts.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
                <SelectItem value="__add_new__" className="text-primary font-medium">+ Add New Supplier</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Refund Date *</label>
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
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Reference No</label>
            <Input value={referenceNo} onChange={e => setReferenceNo(e.target.value)} placeholder="Optional" className="h-10 rounded-xl" />
          </div>
        </div>

        <div className="mt-4 max-w-3xl">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Internal notes..." className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button type="button" variant="secondary" className="h-9 rounded-xl px-3 text-xs font-semibold" onClick={() => navigate("/purchases/refunds")}>Cancel</Button>
          <Button type="button" onClick={handleSave} disabled={updateRefund.isPending || !paymentDate || !amount || Number(amount) <= 0} className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white hover:opacity-95">
            {updateRefund.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : "Save Changes"}
          </Button>
        </div>
      </Card>
    </div>
  )
}
