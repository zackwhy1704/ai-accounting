import { useState, useMemo, useEffect } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { useContacts, useBankAccounts, useCreatePurchasePayment, useBills, usePurchaseDebitNotes } from "../../lib/hooks"
import { formatCurrency, formatDate } from "../../lib/utils"
import { getContactPrefs, saveContactPref } from "../../lib/contact-prefs"
import { useToast } from "../../components/ui/toast"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"
import { SearchableSelect } from "../../components/ui/searchable-select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table"

const cardClass = "rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]"

export default function NewPurchasePaymentPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { toast } = useToast()
  const { data: contacts = [] } = useContacts()
  const { data: bankAccounts = [] } = useBankAccounts()
  const { data: bills = [] } = useBills()
  const { data: purchaseDebitNotes = [] } = usePurchaseDebitNotes()
  const createPayment = useCreatePurchasePayment()

  const fromBillId = searchParams.get("bill_id")
  const fromDebitNoteId = searchParams.get("debit_note_id")
  const fromContactId = searchParams.get("contact_id")
  const fromAmount = searchParams.get("amount")

  const [paymentNo, setPaymentNo] = useState("")
  const [contactId, setContactId] = useState(fromContactId ?? "")
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [amount, setAmount] = useState(fromAmount ?? "")
  const [currency, setCurrency] = useState("MYR")
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer")
  const [bankAccountId, setBankAccountId] = useState("")
  const [referenceNo, setReferenceNo] = useState("")
  const [notes, setNotes] = useState("")
  const [allocations, setAllocations] = useState<Record<string, number>>({})
  const [selectedBills, setSelectedBills] = useState<Record<string, boolean>>({})
  const [selectedDNs, setSelectedDNs] = useState<Record<string, boolean>>({})
  const [dnAllocations, setDnAllocations] = useState<Record<string, number>>({})

  // Pre-select the bill or debit note from URL param
  useEffect(() => {
    if (fromBillId) {
      setSelectedBills(prev => ({ ...prev, [fromBillId]: true }))
      if (fromAmount) setAllocations(prev => ({ ...prev, [fromBillId]: parseFloat(fromAmount) }))
    }
    if (fromDebitNoteId) {
      setSelectedDNs(prev => ({ ...prev, [fromDebitNoteId]: true }))
      if (fromAmount) setDnAllocations(prev => ({ ...prev, [fromDebitNoteId]: parseFloat(fromAmount) }))
    }
    if (fromContactId) {
      const prefs = getContactPrefs(fromContactId)
      if (prefs.currency) setCurrency(prefs.currency)
    }
  }, [fromBillId, fromDebitNoteId, fromContactId, fromAmount])

  const suppliers = useMemo(
    () => contacts.filter((c: any) => c.type === "vendor" || c.type === "supplier" || c.type === "both"),
    [contacts]
  )

  const outstandingBills = useMemo(() => {
    if (!contactId) return []
    return bills.filter((b: any) =>
      b.contact_id === contactId &&
      (b.status === "outstanding" || b.status === "overdue" || b.status === "partially paid" || b.status === "received" || b.status === "approved") &&
      (b.total - (b.amount_paid ?? 0)) > 0
    )
  }, [bills, contactId])

  const outstandingDebitNotes = useMemo(() => {
    if (!contactId) return []
    return (purchaseDebitNotes as any[]).filter((dn: any) =>
      String(dn.contact_id) === String(contactId) &&
      (dn.status === "issued" || dn.status === "partially paid") &&
      (dn.total - (dn.amount_paid ?? 0)) > 0
    )
  }, [purchaseDebitNotes, contactId])

  const totalApplied = useMemo(() => {
    const billTotal = Object.entries(allocations).reduce((sum, [id, val]) => selectedBills[id] ? sum + (val || 0) : sum, 0)
    const dnTotal = Object.entries(dnAllocations).reduce((sum, [id, val]) => selectedDNs[id] ? sum + (val || 0) : sum, 0)
    return billTotal + dnTotal
  }, [allocations, selectedBills, dnAllocations, selectedDNs])

  const toggleBill = (billId: string) => {
    setSelectedBills(prev => ({ ...prev, [billId]: !prev[billId] }))
  }

  const updateAllocation = (billId: string, value: string) => {
    setAllocations(prev => ({ ...prev, [billId]: parseFloat(value) || 0 }))
  }

  const toggleDN = (dnId: string) => {
    setSelectedDNs(prev => ({ ...prev, [dnId]: !prev[dnId] }))
  }

  const updateDnAllocation = (dnId: string, value: string) => {
    setDnAllocations(prev => ({ ...prev, [dnId]: parseFloat(value) || 0 }))
  }

  const getBalance = (b: any) => b.total - (b.amount_paid ?? 0)

  const effectiveAmount = parseFloat(amount) > 0 ? parseFloat(amount) : totalApplied
  const isFormValid = !!contactId && !!paymentMethod && effectiveAmount > 0

  const handleSave = async () => {
    if (!isFormValid) { toast("Please fill in all required fields", "warning"); return }
    try {
      // One payment can settle several bills/debit notes: send every ticked
      // allocation and let the backend derive the amount from their sum.
      const allocationRows = [
        ...Object.entries(selectedBills)
          .filter(([id, sel]) => sel && (allocations[id] || 0) > 0)
          .map(([id]) => ({ bill_id: id, amount: allocations[id] })),
        ...Object.entries(selectedDNs)
          .filter(([id, sel]) => sel && (dnAllocations[id] || 0) > 0)
          .map(([id]) => ({ debit_note_id: id, amount: dnAllocations[id] })),
      ]

      await createPayment.mutateAsync({
        contact_id: contactId || null,
        payment_no: paymentNo || undefined,
        payment_date: new Date(paymentDate).toISOString(),
        amount: allocationRows.length > 0 ? 0 : effectiveAmount,
        allocations: allocationRows,
        currency,
        payment_method: paymentMethod,
        reference_no: referenceNo || null,
        notes: notes || null,
        bank_account_id: bankAccountId || null,
      })

      toast("Payment recorded", "success")
      navigate("/purchases/payments")
    } catch (err: any) {
      toast(err?.response?.data?.detail || "Failed to record payment", "warning")
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex flex-col gap-1">
        <div className="text-xs text-muted-foreground">Purchases &rsaquo; Payments</div>
        <h1 className="text-2xl font-bold text-foreground">Record Payment to Supplier</h1>
      </div>

      <Card className={cardClass}>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Payment #</label>
            <Input value={paymentNo} onChange={e => setPaymentNo(e.target.value)} placeholder="Auto-generated (PPY-0001)" />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Supplier *</label>
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

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Payment Date *</label>
            <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Payment Method *</label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
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

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Bank Account</label>
            <SearchableSelect
              value={bankAccountId}
              onChange={setBankAccountId}
              placeholder="Search or select account"
              options={bankAccounts.map((a: any) => ({ value: a.id, label: a.name, hint: a.account_number ?? a.bank_name ?? "" }))}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Amount</label>
            <Input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Currency</label>
            <Select value={currency} onValueChange={v => { setCurrency(v); if (contactId) saveContactPref(contactId, "currency", v) }}>
              <SelectTrigger><SelectValue placeholder="Select currency" /></SelectTrigger>
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

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Reference No</label>
            <Input value={referenceNo} onChange={e => setReferenceNo(e.target.value)} placeholder="Optional" />
          </div>

          <div className="col-span-full space-y-1.5">
            <label className="text-sm font-medium text-foreground">Notes</label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
          </div>
        </div>
      </Card>

      {contactId && (
        <Card className={cardClass}>
          <h2 className="mb-4 text-lg font-semibold text-foreground">Allocate to Bills</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Bill Number</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="text-right">Amount Applied</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {outstandingBills.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">No outstanding bills for this supplier.</TableCell>
                </TableRow>
              ) : (
                outstandingBills.map((b: any) => (
                  <TableRow key={b.id}>
                    <TableCell>
                      <input type="checkbox" checked={!!selectedBills[b.id]} onChange={() => toggleBill(b.id)} className="h-4 w-4 rounded border-border" />
                    </TableCell>
                    <TableCell>{b.bill_number}</TableCell>
                    <TableCell>{formatDate(b.issue_date)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(b.total, currency)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(getBalance(b), currency)}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number" step="0.01"
                        className="ml-auto w-32 text-right"
                        value={allocations[b.id] ?? ""}
                        onChange={e => updateAllocation(b.id, e.target.value)}
                        disabled={!selectedBills[b.id]}
                        placeholder="0.00"
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <div className="mt-4 flex justify-end border-t border-border pt-4">
            <div className="text-sm font-semibold text-foreground">Total Applied: {formatCurrency(totalApplied, currency)}</div>
          </div>
        </Card>
      )}

      {/* Allocate to Purchase Debit Notes */}
      {contactId && outstandingDebitNotes.length > 0 && (
        <Card className={cardClass}>
          <h2 className="mb-4 text-lg font-semibold text-foreground">Allocate to Debit Notes</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Debit Note Number</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="text-right">Amount Applied</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {outstandingDebitNotes.map((dn: any) => (
                <TableRow key={dn.id}>
                  <TableCell>
                    <input type="checkbox" checked={!!selectedDNs[dn.id]} onChange={() => toggleDN(dn.id)} className="h-4 w-4 rounded border-border" />
                  </TableCell>
                  <TableCell>{dn.debit_note_number}</TableCell>
                  <TableCell>{formatDate(dn.issue_date)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(dn.total, currency)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(dn.total - (dn.amount_paid ?? 0), currency)}</TableCell>
                  <TableCell className="text-right">
                    <Input type="number" step="0.01" className="ml-auto w-32 text-right" value={dnAllocations[dn.id] ?? ""} onChange={e => updateDnAllocation(dn.id, e.target.value)} disabled={!selectedDNs[dn.id]} placeholder="0.00" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => navigate("/purchases/payments")}>Cancel</Button>
        <Button
          onClick={handleSave}
          disabled={createPayment.isPending || !isFormValid}
          className="bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] text-white hover:opacity-95 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {createPayment.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : "Save Payment"}
        </Button>
      </div>
    </div>
  )
}
