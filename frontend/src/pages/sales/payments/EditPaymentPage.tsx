import { useState, useEffect, useRef, useMemo } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { useSalesPayment, useUpdateSalesPayment, useContacts, useAccounts, useInvoices } from "../../../lib/hooks"
import { formatCurrency, formatDate } from "../../../lib/utils"
import { Card } from "../../../components/ui/card"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table"
import { getContactPrefs, saveContactPref } from "../../../lib/contact-prefs"

const cardClass = "rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]"

export default function EditPaymentPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: payment, isLoading } = useSalesPayment(id)
  const { data: contacts } = useContacts()
  const { data: accounts } = useAccounts()
  const { data: invoices } = useInvoices()
  const updatePayment = useUpdateSalesPayment()
  const populated = useRef(false)

  const [customerId, setCustomerId] = useState("")
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0])
  const [paymentMethod, setPaymentMethod] = useState("")
  const [reference, setReference] = useState("")
  const [bankAccountId, setBankAccountId] = useState("")
  const [amount, setAmount] = useState("")
  const [currency, setCurrency] = useState("MYR")
  const [allocations, setAllocations] = useState<Record<string, number>>({})
  const [selectedInvoices, setSelectedInvoices] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!payment || populated.current) return
    setCustomerId(String(payment.customer_id ?? payment.contact_id ?? ""))
    setPaymentDate(payment.payment_date?.slice(0, 10) ?? new Date().toISOString().split("T")[0])
    setPaymentMethod(payment.payment_method ?? "")
    setReference(payment.reference ?? "")
    setBankAccountId(String(payment.bank_account_id ?? ""))
    setAmount(String(payment.amount ?? ""))
    setCurrency(payment.currency ?? "MYR")
    if (payment.allocations?.length) {
      const allocs: Record<string, number> = {}
      const selected: Record<string, boolean> = {}
      for (const a of payment.allocations) {
        allocs[a.invoice_id] = a.amount ?? a.amount_applied
        selected[a.invoice_id] = true
      }
      setAllocations(allocs)
      setSelectedInvoices(selected)
    }
    populated.current = true
  }, [payment])

  const bankAccounts = useMemo(() => {
    if (!accounts) return []
    return accounts.filter((a: any) => a.type === "bank" || a.type === "cash" || a.account_type === "bank" || a.account_type === "cash")
  }, [accounts])

  const outstandingInvoices = useMemo(() => {
    if (!invoices || !customerId) return []
    return invoices.filter((inv: any) =>
      (inv.customer_id === customerId || inv.contact_id === customerId) &&
      (inv.status === "sent" || inv.status === "outstanding" || inv.status === "partial" || inv.status === "overdue") &&
      (inv.balance ?? inv.amount_due ?? (inv.total - (inv.amount_paid || 0))) > 0
    )
  }, [invoices, customerId])

  const totalApplied = useMemo(() => {
    return Object.entries(allocations).reduce((sum, [id, val]) => {
      if (selectedInvoices[id]) return sum + (val || 0)
      return sum
    }, 0)
  }, [allocations, selectedInvoices])

  const toggleInvoice = (invId: string) => {
    setSelectedInvoices(prev => ({ ...prev, [invId]: !prev[invId] }))
  }

  const updateAllocation = (invId: string, value: string) => {
    setAllocations(prev => ({ ...prev, [invId]: parseFloat(value) || 0 }))
  }

  const getBalance = (inv: any) => inv.balance ?? inv.amount_due ?? (inv.total - (inv.amount_paid || 0))

  const handleSave = async () => {
    const allocationsList = Object.entries(allocations)
      .filter(([invId]) => selectedInvoices[invId])
      .map(([invoice_id, amt]) => ({ invoice_id, amount: amt }))

    await updatePayment.mutateAsync({
      id,
      contact_id: customerId,
      payment_date: paymentDate,
      payment_method: paymentMethod,
      reference,
      bank_account_id: bankAccountId,
      amount: parseFloat(amount) || 0,
      currency,
      allocations: allocationsList,
    })

    navigate("/sales/payments")
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!payment) {
    return <div className="p-6 text-muted-foreground">Payment not found.</div>
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="text-2xl font-bold text-foreground">Edit Payment</h1>

      <Card className={cardClass}>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Customer</label>
            <Select value={customerId} onValueChange={v => {
              if (v === "__add_new__") { navigate("/contacts/new"); return }
              setCustomerId(v)
              const prefs = getContactPrefs(v)
              if (prefs.currency) setCurrency(prefs.currency)
            }}>
              <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
              <SelectContent>
                {contacts?.filter((c: any) => c.type === "customer" || c.type === "both").map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
                <SelectItem value="__add_new__" className="text-primary font-medium">+ Add New Customer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Payment Date</label>
            <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Payment Method</label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="online_payment">Online Payment</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Reference</label>
            <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="Payment reference" />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Bank Account</label>
            <Select value={bankAccountId} onValueChange={setBankAccountId}>
              <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
              <SelectContent>
                {bankAccounts.map((a: any) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Amount</label>
            <Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Currency</label>
            <Select value={currency} onValueChange={v => { setCurrency(v); if (customerId) saveContactPref(customerId, "currency", v) }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MYR">MYR - Malaysian Ringgit</SelectItem>
                <SelectItem value="SGD">SGD - Singapore Dollar</SelectItem>
                <SelectItem value="USD">USD - US Dollar</SelectItem>
                <SelectItem value="EUR">EUR - Euro</SelectItem>
                <SelectItem value="GBP">GBP - British Pound</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

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
                  <TableCell colSpan={6} className="text-center text-muted-foreground">No outstanding invoices for this customer.</TableCell>
                </TableRow>
              ) : (
                outstandingInvoices.map((inv: any) => (
                  <TableRow key={inv.id}>
                    <TableCell>
                      <input type="checkbox" checked={!!selectedInvoices[inv.id]} onChange={() => toggleInvoice(inv.id)} className="h-4 w-4 rounded border-border" />
                    </TableCell>
                    <TableCell>{inv.invoice_number || inv.number}</TableCell>
                    <TableCell>{formatDate(inv.date || inv.invoice_date)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(inv.total, currency)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(getBalance(inv), currency)}</TableCell>
                    <TableCell className="text-right">
                      <Input type="number" step="0.01" className="ml-auto w-32 text-right" value={allocations[inv.id] ?? ""} onChange={e => updateAllocation(inv.id, e.target.value)} disabled={!selectedInvoices[inv.id]} placeholder="0.00" />
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

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => navigate("/sales/payments")}>Cancel</Button>
        <Button onClick={handleSave} disabled={updatePayment.isPending || !customerId || !paymentMethod || !amount || parseFloat(amount) <= 0} className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700">
          {updatePayment.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  )
}
