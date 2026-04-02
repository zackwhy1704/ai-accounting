import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Plus, Trash2, Loader2 } from "lucide-react"
import { useContacts, usePurchaseOrders, useCreateGoodsReceivedNote } from "../../lib/hooks"
import { useToast } from "../../components/ui/toast"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table"

interface LineItem {
  description: string
  quantity_ordered: number
  quantity_received: number
  unit_price: number
}

function newLine(): LineItem {
  return { description: "", quantity_ordered: 0, quantity_received: 1, unit_price: 0 }
}

export default function NewGoodsReceivedNotePage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data: contacts = [] } = useContacts()
  const { data: purchaseOrders = [] } = usePurchaseOrders()
  const createGRN = useCreateGoodsReceivedNote()

  const [contactId, setContactId] = useState("")
  const [purchaseOrderId, setPurchaseOrderId] = useState("")
  const [receivedDate, setReceivedDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [currency, setCurrency] = useState("SGD")
  const [notes, setNotes] = useState("")
  const [lineItems, setLineItems] = useState<LineItem[]>([newLine()])

  const updateLine = (idx: number, field: keyof LineItem, value: string | number) => {
    setLineItems(prev => {
      const updated = [...prev]
      updated[idx] = { ...updated[idx], [field]: value }
      return updated
    })
  }

  const handleSave = async () => {
    if (!contactId) { toast("Please select a supplier", "warning"); return }
    if (!receivedDate) { toast("Please enter received date", "warning"); return }
    try {
      await createGRN.mutateAsync({
        contact_id: contactId,
        purchase_order_id: purchaseOrderId || null,
        received_date: new Date(receivedDate).toISOString(),
        currency,
        notes: notes || null,
        line_items: lineItems.map(item => ({
          description: item.description,
          quantity_ordered: item.quantity_ordered,
          quantity_received: item.quantity_received,
          unit_price: item.unit_price,
        })),
      })
      toast("GRN created", "success")
      navigate("/purchases/goods-received-notes")
    } catch {
      toast("Failed to create GRN", "warning")
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="text-xs text-muted-foreground">Purchases &rsaquo; Goods Received Notes</div>
        <div className="text-2xl font-semibold tracking-tight text-foreground">New Goods Received Note</div>
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
                {contacts.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
                <SelectItem value="__add_new__" className="text-primary font-medium">+ Add New Supplier</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Related Purchase Order</label>
            <Select value={purchaseOrderId} onValueChange={setPurchaseOrderId}>
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue placeholder="Select PO (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {purchaseOrders.map(po => (
                  <SelectItem key={po.id} value={po.id}>{po.po_number}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Received Date *</label>
            <Input type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)} className="h-10 rounded-xl" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Currency</label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
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

        <div className="mt-6 overflow-x-auto rounded-2xl border border-border">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">Description</TableHead>
                <TableHead className="w-[110px] text-muted-foreground">Qty Ordered</TableHead>
                <TableHead className="w-[110px] text-muted-foreground">Qty Received</TableHead>
                <TableHead className="w-[110px] text-muted-foreground">Unit Price</TableHead>
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
                    <Input type="number" min={0} value={item.quantity_ordered} onChange={e => updateLine(idx, "quantity_ordered", Number(e.target.value))} className="h-9 rounded-lg border-0 bg-transparent px-1 shadow-none focus-visible:ring-1" />
                  </TableCell>
                  <TableCell>
                    <Input type="number" min={0} value={item.quantity_received} onChange={e => updateLine(idx, "quantity_received", Number(e.target.value))} className="h-9 rounded-lg border-0 bg-transparent px-1 shadow-none focus-visible:ring-1" />
                  </TableCell>
                  <TableCell>
                    <Input type="number" min={0} step={0.01} value={item.unit_price} onChange={e => updateLine(idx, "unit_price", Number(e.target.value))} className="h-9 rounded-lg border-0 bg-transparent px-1 shadow-none focus-visible:ring-1" />
                  </TableCell>
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

        <div className="mt-6">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Internal notes..." className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button type="button" variant="secondary" className="h-9 rounded-xl px-3 text-xs font-semibold" onClick={() => navigate("/purchases/goods-received-notes")}>Cancel</Button>
          <Button type="button" onClick={handleSave} disabled={createGRN.isPending} className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white hover:opacity-95">
            {createGRN.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : "Save"}
          </Button>
        </div>
      </Card>
    </div>
  )
}
