import { useState, useEffect, useRef } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Plus, Trash2, Loader2 } from "lucide-react"
import { useDeliveryOrder, useUpdateDeliveryOrder, useContacts, useTaxRates } from "../../../lib/hooks"
import { Card } from "../../../components/ui/card"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table"

interface LineItem {
  description: string
  quantity: number
  unit_price: number
  amount: number
  tax_code_id: string
  tax_rate: number
}

export default function EditDeliveryOrderPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: deliveryOrder, isLoading } = useDeliveryOrder(id)
  const { data: contacts = [] } = useContacts()
  const { data: taxRates = [] } = useTaxRates()
  const updateDeliveryOrder = useUpdateDeliveryOrder()
  const populated = useRef(false)

  const [doNumber, setDoNumber] = useState("")
  const [contactId, setContactId] = useState("")
  const [deliveryDate, setDeliveryDate] = useState("")
  const [poNumber, setPoNumber] = useState("")
  const [deliverTo, setDeliverTo] = useState({ address1: "", address2: "", city: "", state: "", postcode: "", country: "" })
  const [shipTo, setShipTo] = useState({ address1: "", address2: "", city: "", state: "", postcode: "", country: "" })
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: "", quantity: 1, unit_price: 0, amount: 0, tax_code_id: "", tax_rate: 0 },
  ])

  useEffect(() => {
    if (!deliveryOrder || populated.current) return
    setDoNumber(deliveryOrder.delivery_number ?? "")
    setContactId(String(deliveryOrder.contact_id ?? ""))
    setDeliveryDate(deliveryOrder.delivery_date?.slice(0, 10) ?? "")
    setPoNumber(deliveryOrder.reference ?? "")
    if (deliveryOrder.deliver_to_address) {
      setDeliverTo(prev => ({ ...prev, address1: deliveryOrder.deliver_to_address ?? "" }))
    }
    if (deliveryOrder.ship_to_address) {
      setShipTo(prev => ({ ...prev, address1: deliveryOrder.ship_to_address ?? "" }))
    }
    if (deliveryOrder.line_items?.length) {
      setLineItems(deliveryOrder.line_items.map((l: any) => ({
        description: l.description ?? "",
        quantity: l.quantity ?? 1,
        unit_price: l.unit_price ?? 0,
        amount: l.amount ?? 0,
        tax_code_id: l.tax_code_id ? String(l.tax_code_id) : "",
        tax_rate: l.tax_rate ?? 0,
      })))
    }
    populated.current = true
  }, [deliveryOrder])

  const handleCustomerChange = (v: string) => {
    if (v === "__add_new__") { navigate("/contacts/new"); return }
    setContactId(v)
    const contact = contacts.find((c: any) => c.id === v)
    if (contact) {
      setDeliverTo({
        address1: contact.billing_address_line1 ?? "",
        address2: contact.billing_address_line2 ?? "",
        city: contact.billing_city ?? "",
        state: contact.billing_state ?? "",
        postcode: contact.billing_postcode ?? "",
        country: contact.billing_country ?? "",
      })
      setShipTo({
        address1: contact.shipping_address_line1 ?? "",
        address2: contact.shipping_address_line2 ?? "",
        city: contact.shipping_city ?? "",
        state: contact.shipping_state ?? "",
        postcode: contact.shipping_postcode ?? "",
        country: contact.shipping_country ?? "",
      })
    }
  }

  const updateLineItem = (index: number, field: keyof LineItem, value: string | number) => {
    setLineItems(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      const item = updated[index]
      updated[index].amount = item.quantity * item.unit_price
      if (field === "tax_code_id") {
        const tc = taxRates.find((t: any) => t.id === value)
        if (tc) updated[index] = { ...updated[index], tax_rate: tc.rate }
      }
      return updated
    })
  }

  const addLineItem = () => {
    setLineItems(prev => [...prev, { description: "", quantity: 1, unit_price: 0, amount: 0, tax_code_id: "", tax_rate: 0 }])
  }

  const removeLineItem = (index: number) => {
    setLineItems(prev => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))
  }

  const subTotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
  const totalTax = lineItems.reduce((s, l) => s + l.quantity * l.unit_price * (l.tax_rate / 100), 0)
  const total = subTotal + totalTax

  const handleSave = async () => {
    try {
      await updateDeliveryOrder.mutateAsync({
        id,
        delivery_number: doNumber,
        contact_id: contactId,
        delivery_date: deliveryDate,
        reference: poNumber || null,
        deliver_to_address: [deliverTo.address1, deliverTo.address2, deliverTo.city, deliverTo.state, deliverTo.postcode, deliverTo.country].filter(Boolean).join(", ") || null,
        ship_to_address: [shipTo.address1, shipTo.address2, shipTo.city, shipTo.state, shipTo.postcode, shipTo.country].filter(Boolean).join(", ") || null,
        notes: null,
        line_items: lineItems.map(li => ({
          description: li.description,
          quantity: li.quantity,
          unit_price: li.unit_price,
          tax_rate: li.tax_rate,
          tax_code_id: li.tax_code_id || undefined,
        })),
      })
      navigate("/sales/delivery-orders")
    } catch {
      // error handled by mutation
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!deliveryOrder) {
    return <div className="p-6 text-muted-foreground">Delivery order not found.</div>
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <div className="text-xs text-muted-foreground">Sales</div>
        <div className="text-2xl font-semibold tracking-tight text-foreground">Edit Delivery Order {deliveryOrder.delivery_number}</div>
      </div>

      {/* Items Card */}
      <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Customer *</label>
            <Select value={contactId} onValueChange={handleCustomerChange}>
              <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Select customer" /></SelectTrigger>
              <SelectContent>
                {contacts.filter((c: any) => c.type === "customer" || c.type === "both").map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
                <SelectItem value="__add_new__" className="text-primary font-medium">+ Add New Customer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Delivery #</label>
            <Input value={doNumber} onChange={e => setDoNumber(e.target.value)} placeholder="DO-000000" className="h-10 rounded-xl" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Delivery Date</label>
            <Input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} className="h-10 rounded-xl" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">P.O. Number</label>
            <Input value={poNumber} onChange={e => setPoNumber(e.target.value)} placeholder="P.O. #" className="h-10 rounded-xl" />
          </div>
        </div>

        <div className="mt-6 overflow-x-auto rounded-2xl border border-border">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="w-[80px] text-muted-foreground">QTY</TableHead>
                <TableHead className="min-w-[280px] text-muted-foreground">Description</TableHead>
                <TableHead className="w-[130px] text-muted-foreground">Unit Price</TableHead>
                <TableHead className="w-[160px] text-muted-foreground">Tax Code</TableHead>
                <TableHead className="w-[80px] text-muted-foreground">Tax %</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineItems.map((item, idx) => (
                <TableRow key={idx} className="border-border">
                  <TableCell>
                    <Input type="number" min={0} value={item.quantity} onChange={e => updateLineItem(idx, "quantity", Number(e.target.value))} className="h-9 rounded-lg border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-1" />
                  </TableCell>
                  <TableCell>
                    <Input value={item.description} onChange={e => updateLineItem(idx, "description", e.target.value)} placeholder="Item description" className="h-9 rounded-lg border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-1" />
                  </TableCell>
                  <TableCell>
                    <Input type="number" min={0} step={0.01} value={item.unit_price} onChange={e => updateLineItem(idx, "unit_price", Number(e.target.value))} className="h-9 rounded-lg border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-1" />
                  </TableCell>
                  <TableCell className="w-[160px]">
                    <Select value={item.tax_code_id} onValueChange={v => updateLineItem(idx, "tax_code_id", v === "__none__" ? "" : v)}>
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
                  <TableCell className="w-[80px]">
                    <Input
                      type="number" min={0} max={100} step={0.01}
                      value={item.tax_rate}
                      onChange={e => updateLineItem(idx, "tax_rate", Number(e.target.value))}
                      className="h-9 rounded-lg border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-1"
                      placeholder="%"
                    />
                  </TableCell>
                  <TableCell>
                    <button type="button" onClick={() => removeLineItem(idx)} className="text-muted-foreground hover:text-rose-500">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="mt-3">
          <Button type="button" onClick={addLineItem} className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white shadow-sm hover:opacity-95">
            <Plus className="mr-1.5 h-4 w-4" /> Item
          </Button>
        </div>

        <div className="mt-6 flex justify-end">
          <div className="w-full max-w-xs space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium text-foreground">{subTotal.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span className="font-medium text-foreground">{totalTax.toFixed(2)}</span>
            </div>
            <div className="border-t border-border pt-2">
              <div className="flex items-center justify-between text-base font-semibold">
                <span className="text-foreground">TOTAL</span>
                <span className="text-foreground">{total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Billing & Shipping Card */}
      <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <h3 className="mb-4 text-sm font-semibold text-foreground">Billing & Shipping</h3>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <h3 className="mb-4 text-sm font-semibold text-foreground">DELIVER TO</h3>
            <div className="space-y-3">
              <Input placeholder="Address Line 1" value={deliverTo.address1} onChange={e => setDeliverTo(prev => ({ ...prev, address1: e.target.value }))} className="h-10 rounded-xl" />
              <Input placeholder="Address Line 2" value={deliverTo.address2} onChange={e => setDeliverTo(prev => ({ ...prev, address2: e.target.value }))} className="h-10 rounded-xl" />
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="City" value={deliverTo.city} onChange={e => setDeliverTo(prev => ({ ...prev, city: e.target.value }))} className="h-10 rounded-xl" />
                <Input placeholder="State" value={deliverTo.state} onChange={e => setDeliverTo(prev => ({ ...prev, state: e.target.value }))} className="h-10 rounded-xl" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="Postcode" value={deliverTo.postcode} onChange={e => setDeliverTo(prev => ({ ...prev, postcode: e.target.value }))} className="h-10 rounded-xl" />
                <Input placeholder="Country" value={deliverTo.country} onChange={e => setDeliverTo(prev => ({ ...prev, country: e.target.value }))} className="h-10 rounded-xl" />
              </div>
            </div>
          </div>
          <div>
            <h3 className="mb-4 text-sm font-semibold text-foreground">SHIP TO</h3>
            <div className="space-y-3">
              <Input placeholder="Address Line 1" value={shipTo.address1} onChange={e => setShipTo(prev => ({ ...prev, address1: e.target.value }))} className="h-10 rounded-xl" />
              <Input placeholder="Address Line 2" value={shipTo.address2} onChange={e => setShipTo(prev => ({ ...prev, address2: e.target.value }))} className="h-10 rounded-xl" />
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="City" value={shipTo.city} onChange={e => setShipTo(prev => ({ ...prev, city: e.target.value }))} className="h-10 rounded-xl" />
                <Input placeholder="State" value={shipTo.state} onChange={e => setShipTo(prev => ({ ...prev, state: e.target.value }))} className="h-10 rounded-xl" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="Postcode" value={shipTo.postcode} onChange={e => setShipTo(prev => ({ ...prev, postcode: e.target.value }))} className="h-10 rounded-xl" />
                <Input placeholder="Country" value={shipTo.country} onChange={e => setShipTo(prev => ({ ...prev, country: e.target.value }))} className="h-10 rounded-xl" />
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* General Info Card */}
      <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <h3 className="mb-4 text-sm font-semibold text-foreground">General Info</h3>
        <div className="max-w-lg space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Notes</label>
            <textarea placeholder="Internal notes..." rows={3} className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
        </div>
      </Card>

      {/* Save/Cancel Footer */}
      <div className="flex items-center justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => navigate("/sales/delivery-orders")}>Cancel</Button>
        <Button type="button" onClick={handleSave} disabled={updateDeliveryOrder.isPending || !contactId || !deliveryDate || !lineItems.some(li => li.description.trim())} className="h-10 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 text-sm font-semibold text-white shadow-sm hover:opacity-95">
          {updateDeliveryOrder.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  )
}
