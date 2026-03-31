import { useState, useRef, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Plus, Trash2, X, ChevronRight } from "lucide-react"
import { useContacts, useAccounts, useCreateSalesOrder, useCreateContact } from "../../../lib/hooks"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table"

interface LineItem {
  description: string
  account_id: string
  quantity: number
  unit_price: number
  discount: number
  tax_rate: number
}

function computeLineAmount(item: LineItem, taxInclusive: boolean) {
  const lineTotal = item.quantity * item.unit_price
  const afterDiscount = lineTotal - (lineTotal * item.discount) / 100
  const tax = taxInclusive ? 0 : (afterDiscount * item.tax_rate) / 100
  return afterDiscount + tax
}

// ─── Add Contact Modal ───────────────────────────────────────────────────────
function AddContactModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const createContact = useCreateContact()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [company, setCompany] = useState("")
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) { setName(""); setEmail(""); setPhone(""); setCompany("") }
  }, [open])

  if (!open) return null

  const handleSave = () => {
    if (!name.trim()) return
    createContact.mutate(
      { name, email: email || undefined, phone: phone || undefined, company: company || undefined, type: "customer" },
      {
        onSuccess: (data: { id: string }) => {
          onCreated(data.id)
          onClose()
        },
      }
    )
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={e => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <div className="text-base font-semibold text-foreground">Add New Contact</div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Name *</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Contact name" className="h-10 rounded-xl" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Company</label>
            <Input value={company} onChange={e => setCompany(e.target.value)} placeholder="Company name" className="h-10 rounded-xl" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Email</label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" className="h-10 rounded-xl" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Phone</label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+60 12-345 6789" className="h-10 rounded-xl" />
          </div>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} className="h-9 rounded-xl px-4 text-xs">Cancel</Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!name.trim() || createContact.isPending}
            className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-4 text-xs font-semibold text-white"
          >
            {createContact.isPending ? "Saving..." : "Save Contact"}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function NewSalesOrderPage() {
  const navigate = useNavigate()
  const { data: contacts = [] } = useContacts()
  const { data: accounts = [] } = useAccounts()
  const createSalesOrder = useCreateSalesOrder()

  const [contactId, setContactId] = useState("")
  const [showAddContact, setShowAddContact] = useState(false)

  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [deliveryDate, setDeliveryDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 14); return d.toISOString().slice(0, 10)
  })
  const [reference, setReference] = useState("")
  const [currency, setCurrency] = useState("MYR")
  const [taxInclusive, setTaxInclusive] = useState(false)

  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: "", account_id: "", quantity: 1, unit_price: 0, discount: 0, tax_rate: 0 },
  ])

  const [discountGiven, setDiscountGiven] = useState(0)
  const [roundingAdjustment, setRoundingAdjustment] = useState(false)
  const [notes, setNotes] = useState("")
  const [terms, setTerms] = useState("")
  const [quickShareEmail, setQuickShareEmail] = useState(false)

  const updateLineItem = (index: number, field: keyof LineItem, value: string | number) => {
    setLineItems(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  const addLineItem = () =>
    setLineItems(prev => [...prev, { description: "", account_id: "", quantity: 1, unit_price: 0, discount: 0, tax_rate: 0 }])

  const removeLineItem = (index: number) =>
    setLineItems(prev => prev.length <= 1 ? prev : prev.filter((_, i) => i !== index))

  const subTotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
  const totalLineDiscount = lineItems.reduce((sum, item) => {
    const lt = item.quantity * item.unit_price
    return sum + (lt * item.discount) / 100
  }, 0)
  const rawTotal = subTotal - totalLineDiscount - discountGiven
  const roundedTotal = roundingAdjustment ? Math.round(rawTotal * 20) / 20 : rawTotal
  const roundingDiff = roundedTotal - rawTotal

  const selectedContact = contacts.find(c => c.id === contactId)

  const handleSave = async () => {
    try {
      await createSalesOrder.mutateAsync({
        contact_id: contactId,
        issue_date: orderDate,
        delivery_date: deliveryDate,
        reference: reference || null,
        currency,
        notes: notes || null,
        line_items: lineItems.map(item => ({
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          tax_rate: item.tax_rate,
          discount: item.discount,
          account_id: item.account_id || null,
        })),
      })
      navigate("/sales/orders")
    } catch {
      // mutation handles errors
    }
  }

  return (
    <>
      <AddContactModal
        open={showAddContact}
        onClose={() => setShowAddContact(false)}
        onCreated={id => setContactId(id)}
      />

      <div className="mx-auto max-w-5xl space-y-0 pb-20">
        {/* ── Breadcrumb ── */}
        <div className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="cursor-pointer hover:text-foreground" onClick={() => navigate("/sales/orders")}>Sale Orders</span>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground font-medium">New</span>
        </div>

        {/* ── Customer & Header Fields ── */}
        <div className="rounded-2xl border border-border bg-card shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_4px_16px_rgba(2,6,23,0.06)]">
          {/* Customer row */}
          <div className="border-b border-border px-6 py-5">
            <div className="flex flex-wrap items-end gap-6">
              {/* Customer selector */}
              <div className="min-w-[220px] flex-1">
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Customer</label>
                <div className="flex items-center gap-2">
                  <Select value={contactId} onValueChange={setContactId}>
                    <SelectTrigger className="h-10 rounded-xl flex-1">
                      <SelectValue placeholder="Select a customer..." />
                    </SelectTrigger>
                    <SelectContent>
                      {contacts
                        .filter(c => c.type === "customer" || c.type === "both")
                        .map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <button
                    type="button"
                    onClick={() => setShowAddContact(true)}
                    className="flex h-10 items-center gap-1.5 rounded-xl border border-dashed border-border px-3 text-xs font-medium text-muted-foreground hover:border-blue-400 hover:text-blue-500 transition-colors whitespace-nowrap"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Contact
                  </button>
                </div>
                {selectedContact && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    {selectedContact.email && <span>{selectedContact.email}</span>}
                    {selectedContact.phone && <span className="ml-3">{selectedContact.phone}</span>}
                  </div>
                )}
              </div>

              {/* Date */}
              <div className="w-40">
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Date</label>
                <Input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} className="h-10 rounded-xl" />
              </div>

              {/* Delivery Date */}
              <div className="w-44">
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Delivery Date</label>
                <Input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} className="h-10 rounded-xl" />
              </div>

              {/* Reference */}
              <div className="w-40">
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Reference</label>
                <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="e.g. PO-001" className="h-10 rounded-xl" />
              </div>
            </div>
          </div>

          {/* Currency + Tax toggle */}
          <div className="border-b border-border px-6 py-3 flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-muted-foreground">Currency</label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="h-8 w-24 rounded-lg text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["MYR", "USD", "SGD", "EUR", "GBP"].map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <button
              type="button"
              onClick={() => setTaxInclusive(!taxInclusive)}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${taxInclusive ? "bg-blue-500" : "bg-muted-foreground/30"}`}>
                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${taxInclusive ? "translate-x-4" : "translate-x-0.5"}`} />
              </span>
              {taxInclusive ? "Tax Inclusive" : "Tax Exclusive"}
            </button>
          </div>

          {/* ── Line Items ── */}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="w-9 text-center text-xs text-muted-foreground">#</TableHead>
                  <TableHead className="min-w-[220px] text-xs text-muted-foreground">Rate (Description)</TableHead>
                  <TableHead className="w-[170px] text-xs text-muted-foreground">Account</TableHead>
                  <TableHead className="w-[80px] text-xs text-muted-foreground">Qty</TableHead>
                  <TableHead className="w-[110px] text-xs text-muted-foreground">Std Price</TableHead>
                  <TableHead className="w-[110px] text-right text-xs text-muted-foreground">Amount</TableHead>
                  <TableHead className="w-[80px] text-xs text-muted-foreground">Disc %</TableHead>
                  <TableHead className="w-[80px] text-xs text-muted-foreground">Tax %</TableHead>
                  <TableHead className="w-9" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineItems.map((item, idx) => (
                  <TableRow key={idx} className="border-border hover:bg-muted/30">
                    <TableCell className="text-center text-xs text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell>
                      <Input
                        value={item.description}
                        onChange={e => updateLineItem(idx, "description", e.target.value)}
                        placeholder="Description of goods / services"
                        className="h-9 rounded-lg border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-1"
                      />
                    </TableCell>
                    <TableCell>
                      <Select value={item.account_id} onValueChange={v => updateLineItem(idx, "account_id", v)}>
                        <SelectTrigger className="h-9 rounded-lg border-0 bg-transparent text-xs shadow-none">
                          <SelectValue placeholder="Account" />
                        </SelectTrigger>
                        <SelectContent>
                          {accounts
                            .filter(a => a.type === "revenue" || a.type === "income")
                            .map(a => (
                              <SelectItem key={a.id} value={a.id}>{a.code} – {a.name}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number" min={0}
                        value={item.quantity}
                        onChange={e => updateLineItem(idx, "quantity", Number(e.target.value))}
                        className="h-9 rounded-lg border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-1"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number" min={0} step={0.01}
                        value={item.unit_price}
                        onChange={e => updateLineItem(idx, "unit_price", Number(e.target.value))}
                        className="h-9 rounded-lg border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-1"
                      />
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium text-foreground">
                      {computeLineAmount(item, taxInclusive).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number" min={0} max={100}
                        value={item.discount}
                        onChange={e => updateLineItem(idx, "discount", Number(e.target.value))}
                        className="h-9 rounded-lg border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-1"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number" min={0}
                        value={item.tax_rate}
                        onChange={e => updateLineItem(idx, "tax_rate", Number(e.target.value))}
                        className="h-9 rounded-lg border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-1"
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

          {/* Add item row */}
          <div className="border-t border-border px-6 py-3 flex items-center gap-3">
            <Button
              type="button" onClick={addLineItem}
              className="h-8 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white shadow-sm hover:opacity-95"
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Item
            </Button>
          </div>

          {/* ── Totals ── */}
          <div className="border-t border-border px-6 py-5 flex justify-end">
            <div className="w-full max-w-sm space-y-2.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Sub Total</span>
                <span className="font-medium text-foreground">{currency} {subTotal.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Discount Given</span>
                <Input
                  type="number" min={0} step={0.01}
                  value={discountGiven}
                  onChange={e => setDiscountGiven(Number(e.target.value))}
                  className="h-8 w-28 rounded-lg text-right text-sm"
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Rounding Adjustment</span>
                  <button
                    type="button"
                    onClick={() => setRoundingAdjustment(!roundingAdjustment)}
                    className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${roundingAdjustment ? "bg-blue-500" : "bg-muted-foreground/30"}`}
                  >
                    <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${roundingAdjustment ? "translate-x-3.5" : "translate-x-0.5"}`} />
                  </button>
                </div>
                <span className="font-medium text-foreground">
                  {roundingDiff >= 0 ? "+" : ""}{roundingDiff.toFixed(2)}
                </span>
              </div>
              <div className="border-t border-border pt-2.5">
                <div className="flex items-center justify-between text-base font-bold">
                  <span className="text-foreground">TOTAL</span>
                  <span className="text-foreground">{currency} {roundedTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Notes & Terms ── */}
          <div className="border-t border-border px-6 py-5 grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Notes</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder="Notes to customer (visible on document)"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Terms & Conditions</label>
              <textarea
                value={terms}
                onChange={e => setTerms(e.target.value)}
                rows={3}
                placeholder="Standard terms and conditions..."
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* ── Footer Actions ── */}
          <div className="border-t border-border px-6 py-4 flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={quickShareEmail}
                onChange={e => setQuickShareEmail(e.target.checked)}
                className="h-4 w-4 rounded border-border accent-blue-500"
              />
              QuickShare via Email
            </label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate("/sales/orders")}
                className="h-10 rounded-xl px-5 text-sm font-medium"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={!contactId || createSalesOrder.isPending}
                className="h-10 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 text-sm font-semibold text-white shadow-sm hover:opacity-95"
              >
                {createSalesOrder.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
