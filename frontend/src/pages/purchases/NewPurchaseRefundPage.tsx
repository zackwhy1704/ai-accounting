import { useState, useEffect, useRef, useMemo } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { useContacts, useBankAccounts, useCreatePurchaseRefund, useBills, usePurchaseCreditNotes } from "../../lib/hooks"
import { getContactPrefs, saveContactPref } from "../../lib/contact-prefs"
import { useToast } from "../../components/ui/toast"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"
import { SearchableSelect } from "../../components/ui/searchable-select"

export default function NewPurchaseRefundPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { toast } = useToast()
  const { data: contacts = [] } = useContacts()
  const { data: bankAccounts = [] } = useBankAccounts()
  const { data: bills = [] } = useBills()
  const { data: pcns = [] } = usePurchaseCreditNotes()
  const createRefund = useCreatePurchaseRefund()

  const initialPcnId = searchParams.get("pcn_id") ?? ""
  const initialBillId = searchParams.get("bill_id") ?? ""
  const initialContactId = searchParams.get("contact_id") ?? ""
  const initialAmount = searchParams.get("amount") ?? ""

  const [refundNo, setRefundNo] = useState(() => `PRF-${Date.now().toString().slice(-6)}`)
  const [contactId, setContactId] = useState(initialContactId)
  const [pcnId, setPcnId] = useState(initialPcnId)
  const [billId, setBillId] = useState(initialBillId)
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [amount, setAmount] = useState(initialAmount)
  const [currency, setCurrency] = useState("MYR")
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer")
  const [bankAccountId, setBankAccountId] = useState("")
  const [referenceNo, setReferenceNo] = useState("")
  const [notes, setNotes] = useState("")

  // When a bill or PCN is selected, prefill amount with remaining balance
  const amountPrefilled = useRef(false)
  useEffect(() => {
    if (amountPrefilled.current) return
    if (pcnId) {
      const pcn = (pcns as any[]).find((p: any) => String(p.id) === pcnId)
      if (pcn) {
        const balance = parseFloat(pcn.total) - parseFloat(pcn.credit_applied || 0)
        if (balance > 0) { setAmount(balance.toFixed(2)); amountPrefilled.current = true }
      }
    } else if (billId) {
      const bill = (bills as any[]).find((b: any) => String(b.id) === billId)
      if (bill) {
        const balance = parseFloat(bill.total) - parseFloat(bill.amount_paid || 0)
        if (balance > 0) { setAmount(balance.toFixed(2)); amountPrefilled.current = true }
      }
    }
  }, [billId, pcnId, bills, pcns])

  const filteredBills = contactId
    ? (bills as any[]).filter((b: any) => String(b.contact_id) === contactId && b.status !== "void" && b.status !== "draft")
    : (bills as any[]).filter((b: any) => b.status !== "void" && b.status !== "draft")

  const filteredPcns = useMemo(() => {
    const all = (pcns as any[]).filter((p: any) => p.status !== "void" && p.status !== "applied")
    return contactId ? all.filter((p: any) => String(p.contact_id) === contactId) : all
  }, [pcns, contactId])

  const handleContactChange = (v: string) => {
    if (v === "__add_new__") { navigate("/contacts/new"); return }
    setContactId(v)
    setBillId("")
    setPcnId("")
    amountPrefilled.current = false
    if (v) { const prefs = getContactPrefs(v); if (prefs.currency) setCurrency(prefs.currency) }
  }

  const handleBillChange = (v: string) => {
    setBillId(v === "__none__" ? "" : v)
    setPcnId("")
    amountPrefilled.current = false
  }

  const handlePcnChange = (v: string) => {
    setPcnId(v === "__none__" ? "" : v)
    setBillId("")
    amountPrefilled.current = false
  }

  const handleSave = async () => {
    if (!paymentDate) { toast("Please enter refund date", "warning"); return }
    if (!amount || Number(amount) <= 0) { toast("Please enter a valid amount", "warning"); return }
    try {
      await createRefund.mutateAsync({
        contact_id: contactId || null,
        bill_id: billId || null,
        pcn_id: pcnId || null,

        refund_no: refundNo || undefined,
        refund_date: new Date(paymentDate).toISOString(),
        amount: Number(amount),
        currency,
        payment_method: paymentMethod,
        bank_account_id: bankAccountId || null,
        reference_no: referenceNo || null,
        notes: notes || null,
      })
      toast("Refund recorded", "success")
      navigate("/purchases/refunds")
    } catch {
      toast("Failed to record refund", "warning")
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="text-xs text-muted-foreground">Purchases &rsaquo; Refunds</div>
        <div className="text-2xl font-semibold tracking-tight text-foreground">Record Purchase Refund</div>
      </div>

      <Card className="rounded-2xl border-border bg-card p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 max-w-3xl">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Refund #</label>
            <Input value={refundNo} onChange={e => setRefundNo(e.target.value)} placeholder="PRF-000000" className="h-10 rounded-xl" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Supplier</label>
            <SearchableSelect
              value={contactId}
              onChange={handleContactChange}
              placeholder="Select supplier (optional)"
              options={(contacts as any[])
                .filter((c: any) => c.type === "supplier" || c.type === "vendor" || c.type === "both")
                .map((c: any) => ({ value: c.id, label: c.name, hint: c.email ?? "" }))}
              footerAction={{ label: "+ Add New Supplier", onClick: () => navigate("/contacts/new") }}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Linked Credit Note</label>
            <Select value={pcnId || "__none__"} onValueChange={handlePcnChange}>
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue placeholder="Select credit note (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No linked credit note</SelectItem>
                {filteredPcns.map((p: any) => {
                  const balance = (parseFloat(p.total) - parseFloat(p.credit_applied || 0)).toFixed(2)
                  return (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.pcn_number} — balance {balance}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Linked Bill</label>
            <Select value={billId || "__none__"} onValueChange={handleBillChange}>
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue placeholder="Select bill (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No linked bill</SelectItem>
                {filteredBills.map((b: any) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.bill_number} — balance {(parseFloat(b.total) - parseFloat(b.amount_paid || 0)).toFixed(2)}
                  </SelectItem>
                ))}
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
          <Button type="button" variant="secondary" className="h-9 rounded-xl px-3 text-xs font-semibold" onClick={() => navigate("/purchases/refunds")}>Cancel</Button>
          <Button type="button" onClick={handleSave} disabled={createRefund.isPending || !paymentDate || !amount || Number(amount) <= 0} className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white hover:opacity-95">
            {createRefund.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : "Save Refund"}
          </Button>
        </div>
      </Card>
    </div>
  )
}
