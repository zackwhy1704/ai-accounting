import { useState, useMemo, useEffect } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useContacts, useBankAccounts, useInvoices, useCreateSalesPayment } from "../../../lib/hooks"
import api from "../../../lib/api"
import { formatCurrency, formatDate } from "../../../lib/utils"
import { Card } from "../../../components/ui/card"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table"
import { getContactPrefs, saveContactPref } from "../../../lib/contact-prefs"

const cardClass = "rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]"

export default function NewPaymentPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { data: contacts } = useContacts()
  const { data: bankAccounts = [] } = useBankAccounts()
  const { data: invoices } = useInvoices()
  const createPayment = useCreateSalesPayment()

  const [customerId, setCustomerId] = useState("")
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0])
  const [paymentMethod, setPaymentMethod] = useState("")
  const [reference, setReference] = useState("")
  const [bankAccountId, setBankAccountId] = useState("")
  const [amount, setAmount] = useState("")
  const [currency, setCurrency] = useState("MYR")
  const [allocations, setAllocations] = useState<Record<string, number>>({})
  const [selectedInvoices, setSelectedInvoices] = useState<Record<string, boolean>>({})

  // Pre-fill from invoice link or direct contact/amount
  useEffect(() => {
    const invoiceId = searchParams.get("invoice_id")
    const directContactId = searchParams.get("contact_id")
    const directAmount = searchParams.get("amount")
    const debitNoteId = searchParams.get("debit_note_id")
    if (directContactId) setCustomerId(directContactId)
    if (directAmount) setAmount(directAmount)
    if (!invoices) return
    if (invoiceId) {
      const inv = invoices.find((i) => i.id === invoiceId)
      if (inv) {
        if (!directContactId && inv.contact_id) setCustomerId(inv.contact_id)
        setSelectedInvoices((prev) => ({ ...prev, [invoiceId]: true }))
        // When from debit note use the debit note amount, otherwise use balance
        const applyAmt = debitNoteId && directAmount ? parseFloat(directAmount) : (inv.total - (inv.amount_paid || 0))
        setAllocations((prev) => ({ ...prev, [invoiceId]: applyAmt }))
        if (!directAmount) setAmount(String(applyAmt))
      }
    }
  }, [searchParams, invoices])

  const outstandingInvoices = useMemo(() => {
    if (!invoices || !customerId) return []
    return invoices.filter(
      (inv: any) =>
        (inv.customer_id === customerId || inv.contact_id === customerId) &&
        (inv.status === "draft" || inv.status === "sent" || inv.status === "viewed" || inv.status === "outstanding" || inv.status === "partial" || inv.status === "overdue") &&
        (inv.balance ?? inv.amount_due ?? (inv.total - (inv.amount_paid || 0))) > 0
    )
  }, [invoices, customerId])

  const totalApplied = useMemo(() => {
    return Object.entries(allocations).reduce((sum, [id, val]) => {
      if (selectedInvoices[id]) return sum + (val || 0)
      return sum
    }, 0)
  }, [allocations, selectedInvoices])

  const toggleInvoice = (id: string) => {
    setSelectedInvoices((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const updateAllocation = (id: string, value: string) => {
    setAllocations((prev) => ({ ...prev, [id]: parseFloat(value) || 0 }))
  }

  const handleSave = async () => {
    const allocationsList = Object.entries(allocations)
      .filter(([id]) => selectedInvoices[id])
      .map(([invoice_id, amt]) => ({ invoice_id, amount: amt }))

    const payload = {
      contact_id: customerId,
      payment_date: paymentDate,
      payment_method: paymentMethod,
      reference,
      bank_account_id: bankAccountId || undefined,
      amount: parseFloat(amount) || 0,
      currency,
      allocations: allocationsList,
    }

    const debitNoteId = searchParams.get("debit_note_id")
    if (debitNoteId) {
      await api.post(`/debit-notes/${debitNoteId}/pay`, payload)
    } else {
      await createPayment.mutateAsync(payload)
    }

    navigate("/sales/payments")
  }

  const isFormValid = !!customerId && !!paymentMethod && !!amount && parseFloat(amount) > 0

  const getBalance = (inv: any) =>
    inv.balance ?? inv.amount_due ?? (inv.total - (inv.amount_paid || 0))

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="text-2xl font-bold text-foreground">{searchParams.get("debit_note_id") ? "Pay Debit Note" : "New Payment Received"}</h1>

      <Card className={cardClass}>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {/* Customer */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Customer</label>
            <Select value={customerId} onValueChange={v => {
              if (v === "__add_new__") { navigate("/contacts/new"); return }
              setCustomerId(v)
              const prefs = getContactPrefs(v)
              if (prefs.currency) setCurrency(prefs.currency)
            }}>
              <SelectTrigger>
                <SelectValue placeholder="Select customer" />
              </SelectTrigger>
              <SelectContent>
                {contacts?.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
                <SelectItem value="__add_new__" className="text-primary font-medium">+ Add New Customer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Payment Date */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Payment Date</label>
            <Input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
          </div>

          {/* Payment Method */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Payment Method</label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger>
                <SelectValue placeholder="Select method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="online_payment">Online Payment</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Reference */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Reference</label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Payment reference"
            />
          </div>

          {/* Bank Account */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Bank Account</label>
            <Select value={bankAccountId} onValueChange={setBankAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {bankAccounts.map((a: any) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Amount */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Amount</label>
            <Input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>

          {/* Currency */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Currency</label>
            <Select value={currency} onValueChange={v => { setCurrency(v); if (customerId) saveContactPref(customerId, "currency", v) }}>
              <SelectTrigger><SelectValue placeholder="Select currency" />
              </SelectTrigger>
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
      </Card>

      {/* Allocate to Invoices */}
      {customerId && (
        <Card className={cardClass}>
          <h2 className="mb-4 text-lg font-semibold text-foreground">Allocate to Invoices</h2>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">Invoice</TableHead>
                <TableHead>Invoice Number</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="text-right">Amount Applied</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {outstandingInvoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No outstanding invoices for this customer.
                  </TableCell>
                </TableRow>
              ) : (
                outstandingInvoices.map((inv: any) => (
                  <TableRow key={inv.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={!!selectedInvoices[inv.id]}
                        onChange={() => toggleInvoice(inv.id)}
                        className="h-4 w-4 rounded border-border"
                      />
                    </TableCell>
                    <TableCell>{inv.invoice_number || inv.number}</TableCell>
                    <TableCell>{formatDate(inv.date || inv.invoice_date)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(inv.total, currency)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(getBalance(inv), currency)}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        step="0.01"
                        className="ml-auto w-32 text-right"
                        value={allocations[inv.id] ?? ""}
                        onChange={(e) => updateAllocation(inv.id, e.target.value)}
                        disabled={!selectedInvoices[inv.id]}
                        placeholder="0.00"
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="mt-4 flex justify-end border-t border-border pt-4">
            <div className="text-sm font-semibold text-foreground">
              Total Applied: {formatCurrency(totalApplied, currency)}
            </div>
          </div>
        </Card>
      )}

      {/* Save Button */}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => navigate("/sales/payments")}>Cancel</Button>
        <Button
          onClick={handleSave}
          disabled={createPayment.isPending || !isFormValid}
          className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {createPayment.isPending ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  )
}
