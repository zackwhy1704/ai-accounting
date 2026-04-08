import { useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { useContacts, useAccounts } from "../../../lib/hooks"
import { Card } from "../../../components/ui/card"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table"
import { Plus, Trash2 } from "lucide-react"
import api from "../../../lib/api"

interface LineItem {
  description: string
  quantity: number
  unit_price: number
  tax_rate: number
}

const CURRENCIES = ["MYR", "SGD", "USD", "HKD", "AUD", "EUR", "GBP", "JPY", "CNY", "THB", "IDR", "PHP"]

export default function NewSaleReceiptPage() {
  const navigate = useNavigate()
  const { data: contacts = [] } = useContacts()
  const { data: accounts = [] } = useAccounts()

  const [contactId, setContactId] = useState("")
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split("T")[0])
  const [paymentMethod, setPaymentMethod] = useState("cash")
  const [bankAccountId, setBankAccountId] = useState("")
  const [reference, setReference] = useState("")
  const [currency, setCurrency] = useState("MYR")
  const [saving, setSaving] = useState(false)
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: "", quantity: 1, unit_price: 0, tax_rate: 0 },
  ])

  const bankAccounts = useMemo(() =>
    accounts.filter((a: any) => a.type === "bank" || a.type === "cash" || a.account_type === "bank" || a.account_type === "cash"),
    [accounts]
  )

  const addLine = () => setLineItems(prev => [...prev, { description: "", quantity: 1, unit_price: 0, tax_rate: 0 }])
  const removeLine = (i: number) => setLineItems(prev => prev.filter((_, idx) => idx !== i))
  const updateLine = (i: number, field: keyof LineItem, value: string | number) => {
    setLineItems(prev => prev.map((li, idx) => idx === i ? { ...li, [field]: value } : li))
  }

  const subtotal = lineItems.reduce((s, li) => s + li.quantity * li.unit_price, 0)
  const taxTotal = lineItems.reduce((s, li) => s + li.quantity * li.unit_price * (li.tax_rate / 100), 0)
  const total = subtotal + taxTotal

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.post("/sales/receipts", {
        contact_id: contactId,
        receipt_date: receiptDate,
        payment_method: paymentMethod,
        bank_account_id: bankAccountId || undefined,
        reference,
        currency,
        line_items: lineItems.map(li => ({
          description: li.description,
          quantity: li.quantity,
          unit_price: li.unit_price,
          tax_rate: li.tax_rate,
          amount: li.quantity * li.unit_price,
        })),
        subtotal,
        tax_total: taxTotal,
        total,
      })
      navigate("/sales/receipts")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="text-2xl font-bold text-foreground">New Sales Receipt</h1>

      <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Customer</label>
            <Select value={contactId} onValueChange={v => v === "__add_new__" ? navigate("/contacts/new") : setContactId(v)}>
              <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
              <SelectContent>
                {contacts.filter((c: any) => c.type === "customer" || c.type === "both").map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
                <SelectItem value="__add_new__" className="text-primary font-medium">+ Add New Customer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Receipt Date</label>
            <Input type="date" value={receiptDate} onChange={e => setReceiptDate(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Payment Method</label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="online_payment">Online Payment</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Bank Account</label>
            <Select value={bankAccountId} onValueChange={setBankAccountId}>
              <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
              <SelectContent>
                {bankAccounts.map((a: any) => (
                  <SelectItem key={a.id} value={a.id}>{a.code} – {a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Reference</label>
            <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="Receipt reference" />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Currency</label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Line Items */}
      <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <h2 className="mb-4 text-lg font-semibold text-foreground">Line Items</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              <TableHead className="w-24">Qty</TableHead>
              <TableHead className="w-32">Unit Price</TableHead>
              <TableHead className="w-24">Tax %</TableHead>
              <TableHead className="w-32 text-right">Amount</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lineItems.map((li, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Input value={li.description} onChange={e => updateLine(i, "description", e.target.value)} placeholder="Item description" />
                </TableCell>
                <TableCell>
                  <Input type="number" min={1} value={li.quantity} onChange={e => updateLine(i, "quantity", Number(e.target.value))} />
                </TableCell>
                <TableCell>
                  <Input type="number" step="0.01" value={li.unit_price} onChange={e => updateLine(i, "unit_price", Number(e.target.value))} />
                </TableCell>
                <TableCell>
                  <Input type="number" step="0.01" value={li.tax_rate} onChange={e => updateLine(i, "tax_rate", Number(e.target.value))} />
                </TableCell>
                <TableCell className="text-right font-medium">{(li.quantity * li.unit_price).toFixed(2)}</TableCell>
                <TableCell>
                  {lineItems.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeLine(i)}>
                      <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Button type="button" variant="outline" className="mt-3 text-xs" onClick={addLine}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add Line
        </Button>

        <div className="mt-4 flex flex-col items-end gap-1 border-t border-border pt-4 text-sm">
          <div className="flex gap-8"><span className="text-muted-foreground">Subtotal</span><span className="font-medium">{subtotal.toFixed(2)}</span></div>
          <div className="flex gap-8"><span className="text-muted-foreground">Tax</span><span className="font-medium">{taxTotal.toFixed(2)}</span></div>
          <div className="flex gap-8 text-base"><span className="font-semibold">Total</span><span className="font-bold">{total.toFixed(2)}</span></div>
        </div>
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => navigate("/sales/receipts")}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving} className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700">
          {saving ? "Saving..." : "Save Receipt"}
        </Button>
      </div>
    </div>
  )
}
