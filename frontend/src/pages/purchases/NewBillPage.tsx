import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Plus, Trash2, Loader2 } from "lucide-react"
import { useContacts, useCreateBill } from "../../lib/hooks"
import { useToast } from "../../components/ui/toast"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table"

interface LineItem {
  description: string
  quantity: number
  unit_price: number
  tax_rate: number
  amount: number
}

function newLine(): LineItem {
  return { description: "", quantity: 1, unit_price: 0, tax_rate: 0, amount: 0 }
}

export default function NewBillPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data: contacts = [] } = useContacts()
  const createBill = useCreateBill()

  const [contactId, setContactId] = useState("")
  const [billNumber, setBillNumber] = useState(`BILL-${Date.now().toString().slice(-6)}`)
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [dueDate, setDueDate] = useState("")
  const [currency, setCurrency] = useState("SGD")
  const [notes, setNotes] = useState("")
  const [lineItems, setLineItems] = useState<LineItem[]>([newLine()])

  const updateLine = (idx: number, field: keyof LineItem, value: string | number) => {
    setLineItems(prev => {
      const updated = [...prev]
      updated[idx] = { ...updated[idx], [field]: value }
      const item = updated[idx]
      updated[idx].amount = item.quantity * item.unit_price * (1 + item.tax_rate / 100)
      return updated
    })
  }

  const subtotal = lineItems.reduce((s, i) => s + i.quantity * i.unit_price, 0)
  const taxAmount = lineItems.reduce((s, i) => s + i.quantity * i.unit_price * (i.tax_rate / 100), 0)
  const total = subtotal + taxAmount

  const handleSave = async () => {
    if (!contactId) { toast("Please select a supplier", "warning"); return }
    if (!issueDate) { toast("Please enter a bill date", "warning"); return }
    try {
      await createBill.mutateAsync({
        contact_id: contactId,
        bill_number: billNumber,
        issue_date: new Date(issueDate).toISOString(),
        due_date: dueDate ? new Date(dueDate).toISOString() : new Date(issueDate).toISOString(),
        currency,
        notes: notes || null,
        line_items: lineItems.map((item, i) => ({
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          tax_rate: item.tax_rate,
          amount: item.amount,
          sort_order: i,
        })),
      })
      toast("Bill created", "success")
      navigate("/purchases/bills")
    } catch {
      toast("Failed to create bill", "warning")
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="text-xs text-muted-foreground">Purchases &rsaquo; Bills</div>
        <div className="text-2xl font-semibold tracking-tight text-foreground">New Bill</div>
      </div>

      <Card className="rounded-2xl border-border bg-card p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Supplier *</label>
            <Select value={contactId} onValueChange={v => v === "__add_new__" ? navigate("/contacts/new") : setContactId(v)}>
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue placeholder="Select supplier" />
              </SelectTrigger>
              <SelectContent>
                {contacts
                  .filter(c => c.type === "vendor" || c.type === "supplier" || c.type === "both")
                  .map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                {contacts
                  .filter(c => !["vendor", "supplier", "both"].includes(c.type))
                  .map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                <SelectItem value="__add_new__" className="text-primary font-medium">+ Add New Supplier</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Bill Number</label>
            <Input value={billNumber} onChange={e => setBillNumber(e.target.value)} className="h-10 rounded-xl" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Currency</label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SGD">SGD</SelectItem>
                <SelectItem value="MYR">MYR</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Bill Date *</label>
            <Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className="h-10 rounded-xl" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Due Date</label>
            <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="h-10 rounded-xl" />
          </div>
        </div>

        <div className="mt-6 overflow-x-auto rounded-2xl border border-border">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">Description</TableHead>
                <TableHead className="w-[80px] text-muted-foreground">Qty</TableHead>
                <TableHead className="w-[110px] text-muted-foreground">Unit Price</TableHead>
                <TableHead className="w-[80px] text-muted-foreground">Tax %</TableHead>
                <TableHead className="w-[110px] text-right text-muted-foreground">Amount</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineItems.map((item, idx) => (
                <TableRow key={idx} className="border-border">
                  <TableCell>
                    <Input value={item.description} onChange={e => updateLine(idx, "description", e.target.value)} placeholder="Description" className="h-9 rounded-lg border-0 bg-transparent px-1 shadow-none focus-visible:ring-1" />
                  </TableCell>
                  <TableCell>
                    <Input type="number" min={0} value={item.quantity} onChange={e => updateLine(idx, "quantity", Number(e.target.value))} className="h-9 rounded-lg border-0 bg-transparent px-1 shadow-none focus-visible:ring-1" />
                  </TableCell>
                  <TableCell>
                    <Input type="number" min={0} step={0.01} value={item.unit_price} onChange={e => updateLine(idx, "unit_price", Number(e.target.value))} className="h-9 rounded-lg border-0 bg-transparent px-1 shadow-none focus-visible:ring-1" />
                  </TableCell>
                  <TableCell>
                    <Input type="number" min={0} max={100} value={item.tax_rate} onChange={e => updateLine(idx, "tax_rate", Number(e.target.value))} className="h-9 rounded-lg border-0 bg-transparent px-1 shadow-none focus-visible:ring-1" placeholder="%" />
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium text-foreground">{item.amount.toFixed(2)}</TableCell>
                  <TableCell>
                    <button type="button" onClick={() => setLineItems(p => p.length <= 1 ? p : p.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-rose-500">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="mt-3">
          <Button type="button" onClick={() => setLineItems(p => [...p, newLine()])} className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white shadow-sm hover:opacity-95">
            <Plus className="mr-1.5 h-4 w-4" /> Add Line Item
          </Button>
        </div>

        <div className="mt-6 flex justify-end">
          <div className="w-full max-w-xs space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium text-foreground">{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span className="font-medium text-foreground">{taxAmount.toFixed(2)}</span>
            </div>
            <div className="border-t border-border pt-2">
              <div className="flex items-center justify-between text-base font-bold">
                <span className="text-foreground">Total</span>
                <span className="text-foreground">{total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Internal notes..." className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button type="button" variant="secondary" className="h-9 rounded-xl px-3 text-xs font-semibold" onClick={() => navigate("/purchases/bills")}>Cancel</Button>
          <Button type="button" onClick={handleSave} disabled={createBill.isPending} className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white hover:opacity-95">
            {createBill.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : "Save as Draft"}
          </Button>
        </div>
      </Card>
    </div>
  )
}
