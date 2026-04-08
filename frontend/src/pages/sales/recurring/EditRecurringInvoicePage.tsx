import { useState, useEffect, useRef } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { useRecurringInvoice, useUpdateRecurringInvoice, useContacts, useAccounts, useTaxRates } from "../../../lib/hooks"
import { Card } from "../../../components/ui/card"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table"

interface LineItem {
  description: string
  account_id: string
  quantity: number
  unit_price: number
  tax_code_id: string
  tax_rate: number
}

const CURRENCIES = ["MYR", "SGD", "USD", "HKD", "AUD", "EUR", "GBP", "JPY", "CNY", "THB", "IDR", "PHP"]

export default function EditRecurringInvoicePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: recurringInvoice, isLoading } = useRecurringInvoice(id)
  const { data: contacts = [] } = useContacts()
  const { data: accounts = [] } = useAccounts()
  const { data: taxRates = [] } = useTaxRates()
  const updateRecurringInvoice = useUpdateRecurringInvoice()
  const populated = useRef(false)

  const [contactId, setContactId] = useState("")
  const [frequency, setFrequency] = useState("monthly")
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0])
  const [endDate, setEndDate] = useState("")
  const [currency, setCurrency] = useState("MYR")
  const [reference, setReference] = useState("")
  const [autoSend, setAutoSend] = useState(false)
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: "", account_id: "", quantity: 1, unit_price: 0, tax_code_id: "", tax_rate: 0 },
  ])

  useEffect(() => {
    if (!recurringInvoice || populated.current) return
    setContactId(String(recurringInvoice.contact_id ?? ""))
    setFrequency(recurringInvoice.frequency ?? "monthly")
    setStartDate(recurringInvoice.start_date?.slice(0, 10) ?? new Date().toISOString().split("T")[0])
    setEndDate(recurringInvoice.end_date?.slice(0, 10) ?? "")
    setCurrency(recurringInvoice.currency ?? "MYR")
    setReference(recurringInvoice.reference ?? "")
    setAutoSend(recurringInvoice.auto_send ?? false)
    if (recurringInvoice.line_items?.length) {
      setLineItems(recurringInvoice.line_items.map((li: any) => ({
        description: li.description ?? "",
        account_id: li.account_id ? String(li.account_id) : "",
        quantity: li.quantity ?? 1,
        unit_price: li.unit_price ?? 0,
        tax_code_id: li.tax_code_id ? String(li.tax_code_id) : "",
        tax_rate: li.tax_rate ?? 0,
      })))
    }
    populated.current = true
  }, [recurringInvoice])

  const addLine = () => setLineItems(prev => [...prev, { description: "", account_id: "", quantity: 1, unit_price: 0, tax_code_id: "", tax_rate: 0 }])
  const removeLine = (i: number) => setLineItems(prev => prev.filter((_, idx) => idx !== i))
  const updateLine = (i: number, field: keyof LineItem, value: string | number) => {
    setLineItems(prev => {
      const updated = prev.map((li, idx) => idx === i ? { ...li, [field]: value } : li)
      if (field === "tax_code_id") {
        const tc = taxRates.find((t: any) => t.id === value)
        if (tc) updated[i] = { ...updated[i], tax_rate: tc.rate }
      }
      return updated
    })
  }

  const subtotal = lineItems.reduce((s, li) => s + li.quantity * li.unit_price, 0)
  const taxTotal = lineItems.reduce((s, li) => s + li.quantity * li.unit_price * (li.tax_rate / 100), 0)
  const total = subtotal + taxTotal

  const handleSave = async () => {
    await updateRecurringInvoice.mutateAsync({
      id,
      contact_id: contactId,
      frequency,
      start_date: startDate,
      end_date: endDate || undefined,
      currency,
      reference,
      auto_send: autoSend,
      line_items: lineItems.map(li => ({
        description: li.description,
        account_id: li.account_id || undefined,
        quantity: li.quantity,
        unit_price: li.unit_price,
        tax_rate: li.tax_rate,
        amount: li.quantity * li.unit_price,
      })),
      subtotal,
      tax_total: taxTotal,
      total,
    })
    navigate("/sales/recurring")
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!recurringInvoice) {
    return <div className="p-6 text-muted-foreground">Recurring invoice not found.</div>
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="text-2xl font-bold text-foreground">Edit Recurring Invoice</h1>

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
            <label className="text-sm font-medium text-foreground">Frequency</label>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="biweekly">Bi-weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Start Date</label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">End Date (optional)</label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
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

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Reference</label>
            <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="Reference note" />
          </div>

          <div className="flex items-center gap-2 md:col-span-2">
            <input type="checkbox" id="autoSend" checked={autoSend} onChange={e => setAutoSend(e.target.checked)} className="h-4 w-4 rounded border-border" />
            <label htmlFor="autoSend" className="text-sm text-foreground">Automatically send invoice to customer</label>
          </div>
        </div>
      </Card>

      <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <h2 className="mb-4 text-lg font-semibold text-foreground">Line Items</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              <TableHead className="w-36">Account</TableHead>
              <TableHead className="w-20">Qty</TableHead>
              <TableHead className="w-28">Unit Price</TableHead>
              <TableHead className="w-20">Tax %</TableHead>
              <TableHead className="w-28 text-right">Amount</TableHead>
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
                  <Select value={li.account_id} onValueChange={v => updateLine(i, "account_id", v)}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Account" /></SelectTrigger>
                    <SelectContent>
                      {accounts.filter((a: any) => a.type === "revenue" || a.account_type === "revenue" || a.type === "income").map((a: any) => (
                        <SelectItem key={a.id} value={a.id}>{a.code} – {a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
          <div className="flex gap-8 text-base"><span className="font-semibold">Total per invoice</span><span className="font-bold">{total.toFixed(2)}</span></div>
        </div>
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => navigate("/sales/recurring")}>Cancel</Button>
        <Button onClick={handleSave} disabled={updateRecurringInvoice.isPending} className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700">
          {updateRecurringInvoice.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  )
}
