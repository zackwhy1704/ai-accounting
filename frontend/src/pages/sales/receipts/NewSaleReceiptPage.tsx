import { useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { useContacts, useAccounts, useTaxRates, useCreateSaleReceipt } from "../../../lib/hooks"
import { Card } from "../../../components/ui/card"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table"
import { Plus, Trash2 } from "lucide-react"
import { getContactPrefs, saveContactPref } from "../../../lib/contact-prefs"

interface LineItem {
  description: string
  quantity: number
  unit_price: number
  discount: number
  discount_mode: "percent" | "amount"
  tax_code_id: string
  tax_rate: number
}

const CURRENCIES = ["MYR", "SGD", "USD", "HKD", "AUD", "EUR", "GBP", "JPY", "CNY", "THB", "IDR", "PHP"]

export default function NewSaleReceiptPage() {
  const navigate = useNavigate()
  const { data: contacts = [] } = useContacts()
  const { data: accounts = [] } = useAccounts()
  const { data: taxRates = [] } = useTaxRates()
  const createReceipt = useCreateSaleReceipt()

  const [contactId, setContactId] = useState("")
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split("T")[0])
  const [paymentMethod, setPaymentMethod] = useState("cash")
  const [bankAccountId, setBankAccountId] = useState("")
  const [reference, setReference] = useState("")
  const [currency, setCurrency] = useState("MYR")
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: "", quantity: 1, unit_price: 0, discount: 0, discount_mode: "percent", tax_code_id: "", tax_rate: 0 },
  ])

  const bankAccounts = useMemo(() =>
    accounts.filter((a: any) => a.type === "bank" || a.type === "cash" || a.account_type === "bank" || a.account_type === "cash"),
    [accounts]
  )

  const addLine = () => setLineItems(prev => [...prev, { description: "", quantity: 1, unit_price: 0, discount: 0, discount_mode: "percent", tax_code_id: "", tax_rate: 0 }])
  const removeLine = (i: number) => setLineItems(prev => prev.filter((_, idx) => idx !== i))
  const updateLine = (i: number, field: keyof LineItem, value: string | number) => {
    setLineItems(prev => prev.map((li, idx) => {
      if (idx !== i) return li
      const updated = { ...li, [field]: value }
      if (field === "tax_code_id") {
        const tc = taxRates.find((t: any) => t.id === value)
        if (tc) updated.tax_rate = tc.rate
        else if (value === "") updated.tax_rate = 0
      }
      return updated
    }))
  }

  const lineTotal = (li: LineItem) => li.quantity * li.unit_price
  const lineDiscount = (li: LineItem) => li.discount_mode === "amount" ? Math.min(li.discount, lineTotal(li)) : lineTotal(li) * (li.discount / 100)
  const lineAfterDiscount = (li: LineItem) => lineTotal(li) - lineDiscount(li)

  const subtotal = lineItems.reduce((s, li) => s + lineTotal(li), 0)
  const totalDiscount = lineItems.reduce((s, li) => s + lineDiscount(li), 0)
  const taxTotal = lineItems.reduce((s, li) => s + lineAfterDiscount(li) * (li.tax_rate / 100), 0)
  const total = subtotal - totalDiscount + taxTotal

  const handleSave = async () => {
    await createReceipt.mutateAsync({
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
        discount: lineDiscount(li),
        tax_rate: li.tax_rate,
        amount: lineAfterDiscount(li),
      })),
    })
    navigate("/sales/payments")
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <h1 className="text-2xl font-bold text-foreground">New Sales Receipt</h1>

      <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Customer</label>
            <Select value={contactId} onValueChange={v => {
              if (v === "__add_new__") { navigate("/contacts/new"); return }
              setContactId(v)
              const prefs = getContactPrefs(v)
              if (prefs.currency) setCurrency(prefs.currency)
            }}>
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
            <label className="text-sm font-medium text-foreground">Reference</label>
            <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="Receipt reference" />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Currency</label>
            <Select value={currency} onValueChange={v => { setCurrency(v); if (contactId) saveContactPref(contactId, "currency", v) }}>
              <SelectTrigger><SelectValue placeholder="Select currency" /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <h2 className="mb-4 text-lg font-semibold text-foreground">Line Items</h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">Description</TableHead>
                <TableHead className="w-20 text-muted-foreground">Qty</TableHead>
                <TableHead className="w-28 text-muted-foreground">Unit Price</TableHead>
                <TableHead className="w-20 text-muted-foreground">Discount</TableHead>
                <TableHead className="w-[150px] text-muted-foreground">Tax Code</TableHead>
                <TableHead className="w-20 text-muted-foreground">Tax %</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineItems.map((li, i) => (
                <TableRow key={i} className="border-border">
                  <TableCell>
                    <Input value={li.description} onChange={e => updateLine(i, "description", e.target.value)} placeholder="Item description" className="h-9 rounded-lg border-0 bg-transparent px-1 shadow-none focus-visible:ring-1" />
                  </TableCell>
                  <TableCell>
                    <Input type="number" min={1} value={li.quantity} onChange={e => updateLine(i, "quantity", Number(e.target.value))} className="h-9 rounded-lg border-0 bg-transparent px-1 shadow-none focus-visible:ring-1" />
                  </TableCell>
                  <TableCell>
                    <Input type="number" step="0.01" value={li.unit_price} onChange={e => updateLine(i, "unit_price", Number(e.target.value))} className="h-9 rounded-lg border-0 bg-transparent px-1 shadow-none focus-visible:ring-1" />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number" min={0} step={0.01}
                        value={li.discount}
                        onChange={e => updateLine(i, "discount", Number(e.target.value))}
                        className="h-9 w-20 rounded-lg border-0 bg-transparent px-1 shadow-none focus-visible:ring-1"
                      />
                      <button
                        type="button"
                        onClick={() => updateLine(i, "discount_mode", li.discount_mode === "percent" ? "amount" : "percent")}
                        className="h-7 w-9 rounded-md border border-border bg-muted/40 text-[11px] font-semibold text-foreground hover:bg-muted"
                        title={li.discount_mode === "percent" ? "Switch to flat amount" : "Switch to percentage"}
                      >
                        {li.discount_mode === "percent" ? "%" : currency}
                      </button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select value={li.tax_code_id} onValueChange={v => updateLine(i, "tax_code_id", v === "__none__" ? "" : v)}>
                      <SelectTrigger className="h-9 rounded-lg border-0 bg-transparent shadow-none focus:ring-1 text-xs">
                        <SelectValue placeholder="Tax Code" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No Tax</SelectItem>
                        {taxRates.map((tc: any) => (
                          <SelectItem key={tc.id} value={tc.id}>{tc.code} ({tc.rate}%)</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input type="number" min={0} max={100} step={0.01} value={li.tax_rate} onChange={e => updateLine(i, "tax_rate", Number(e.target.value))} className="h-9 rounded-lg border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-1" placeholder="%" />
                  </TableCell>
                  <TableCell>
                    {lineItems.length > 1 && (
                      <button type="button" onClick={() => removeLine(i)} className="text-muted-foreground hover:text-rose-500">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Button type="button" variant="outline" className="mt-3 text-xs" onClick={addLine}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add Line
        </Button>

        <div className="mt-4 flex flex-col items-end gap-1 border-t border-border pt-4 text-sm">
          <div className="flex w-56 justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-medium">{subtotal.toFixed(2)}</span></div>
          {totalDiscount > 0 && <div className="flex w-56 justify-between text-rose-600"><span>Discount</span><span>- {totalDiscount.toFixed(2)}</span></div>}
          <div className="flex w-56 justify-between"><span className="text-muted-foreground">Tax</span><span className="font-medium">{taxTotal.toFixed(2)}</span></div>
          <div className="flex w-56 justify-between text-base"><span className="font-semibold">Total</span><span className="font-bold">{total.toFixed(2)}</span></div>
        </div>
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => navigate("/sales/payments")}>Cancel</Button>
        <Button onClick={handleSave} disabled={createReceipt.isPending || !contactId || !lineItems.some(li => li.description.trim())} className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed">
          {createReceipt.isPending ? "Saving..." : "Save Receipt"}
        </Button>
      </div>
    </div>
  )
}
