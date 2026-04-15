import { useState, useEffect, useRef } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Plus, Trash2, Loader2 } from "lucide-react"
import { useInvoice, useUpdateInvoice, useContacts, useAccounts, useTaxRates, useInvoiceActivity, type InvoiceActivityEvent } from "../../../lib/hooks"
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
  amount: number
  discount: number
  tax_rate: number
  line_type: "goods" | "services"
  tax_code_id: string
}

export default function EditInvoicePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: invoice, isLoading } = useInvoice(id)
  const { data: contacts = [] } = useContacts()
  const { data: accounts = [] } = useAccounts()
  const { data: taxRates = [] } = useTaxRates()
  const updateInvoice = useUpdateInvoice()
  const { data: activity } = useInvoiceActivity(id)
  const populated = useRef(false)

  const [invoiceNumber, setInvoiceNumber] = useState("")
  const [contactId, setContactId] = useState("")
  const [terms, setTerms] = useState("cbd")
  const [invoiceDate, setInvoiceDate] = useState("")
  const [customerPo, setCustomerPo] = useState("")
  const [currency, setCurrency] = useState("MYR")
  const [journalMemo, setJournalMemo] = useState("")
  const [billingLine1, setBillingLine1] = useState("")
  const [billingLine2, setBillingLine2] = useState("")
  const [billingCity, setBillingCity] = useState("")
  const [billingState, setBillingState] = useState("")
  const [billingPostcode, setBillingPostcode] = useState("")
  const [billingCountry, setBillingCountry] = useState("")
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: "", account_id: "", quantity: 1, unit_price: 0, amount: 0, discount: 0, tax_rate: 0, line_type: "goods", tax_code_id: "" },
  ])

  useEffect(() => {
    if (!invoice || populated.current) return
    setInvoiceNumber(invoice.invoice_number ?? "")
    setContactId(String(invoice.contact_id ?? ""))
    setTerms(invoice.terms ?? "cbd")
    setInvoiceDate((invoice.issue_date ?? invoice.invoice_date)?.slice(0, 10) ?? "")
    setCustomerPo(invoice.customer_po ?? "")
    setCurrency(invoice.currency ?? "MYR")
    setJournalMemo(invoice.journal_memo ?? "")
    if (invoice.line_items?.length) {
      setLineItems(invoice.line_items.map((l: any) => ({
        description: l.description ?? "",
        account_id: l.account_id ? String(l.account_id) : "",
        quantity: l.quantity ?? 1,
        unit_price: l.unit_price ?? 0,
        amount: l.amount ?? 0,
        discount: l.discount ?? 0,
        tax_rate: l.tax_rate ?? 0,
        line_type: l.line_type ?? "goods",
        tax_code_id: l.tax_code_id ? String(l.tax_code_id) : "",
      })))
    }
    setBillingLine1(invoice.billing_address_line1 ?? "")
    setBillingLine2(invoice.billing_address_line2 ?? "")
    setBillingCity(invoice.billing_city ?? "")
    setBillingState(invoice.billing_state ?? "")
    setBillingPostcode(invoice.billing_postcode ?? "")
    setBillingCountry(invoice.billing_country ?? "")
    populated.current = true
  }, [invoice])

  const handleContactChange = (v: string) => {
    if (v === "__add_new__") { navigate("/contacts/new"); return }
    setContactId(v)
    const contact = contacts.find((c: any) => c.id === v)
    if (!contact) return
    setBillingLine1(contact.billing_address_line1 ?? "")
    setBillingLine2(contact.billing_address_line2 ?? "")
    setBillingCity(contact.billing_city ?? "")
    setBillingState(contact.billing_state ?? "")
    setBillingPostcode(contact.billing_postcode ?? "")
    setBillingCountry(contact.billing_country ?? "")
    if (contact.default_payment_terms) setTerms(contact.default_payment_terms)
  }

  const updateLineItem = (index: number, field: keyof LineItem, value: string | number) => {
    setLineItems(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      if (field === "tax_code_id") {
        const tc = taxRates.find((t: any) => t.id === value)
        if (tc) updated[index].tax_rate = tc.rate
      }
      if (field === "line_type" && value === "services") {
        updated[index].quantity = 1
      }
      const item = updated[index]
      const lineTotal = item.quantity * item.unit_price
      const afterDiscount = lineTotal - (lineTotal * item.discount) / 100
      const tax = (afterDiscount * item.tax_rate) / 100
      updated[index].amount = afterDiscount + tax
      return updated
    })
  }

  const addLineItem = () => {
    setLineItems(prev => [
      ...prev,
      { description: "", account_id: "", quantity: 1, unit_price: 0, amount: 0, discount: 0, tax_rate: 0, line_type: "goods", tax_code_id: "" },
    ])
  }

  const removeLineItem = (index: number) => {
    setLineItems(prev => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))
  }

  const subTotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
  const totalLineDiscount = lineItems.reduce((sum, item) => {
    const lineTotal = item.quantity * item.unit_price
    return sum + (lineTotal * item.discount) / 100
  }, 0)
  const afterDiscount = subTotal - totalLineDiscount
  const totalTax = lineItems.reduce((sum, item) => {
    const lineTotal = item.quantity * item.unit_price
    const afterLineDiscount = lineTotal - (lineTotal * item.discount) / 100
    return sum + (afterLineDiscount * item.tax_rate) / 100
  }, 0)
  const total = afterDiscount + totalTax
  const appliedToDate = 0
  const balanceDue = total - appliedToDate

  const handleSave = async () => {
    try {
      await updateInvoice.mutateAsync({
        id,
        invoice_number: invoiceNumber,
        contact_id: contactId,
        issue_date: invoiceDate,
        due_date: invoiceDate,
        currency,
        notes: journalMemo || null,
        terms: terms || null,
        billing_address_line1: billingLine1 || null,
        billing_address_line2: billingLine2 || null,
        billing_city: billingCity || null,
        billing_state: billingState || null,
        billing_postcode: billingPostcode || null,
        billing_country: billingCountry || null,
        line_items: lineItems.map(li => ({
          description: li.description,
          account_id: li.account_id || undefined,
          quantity: li.quantity,
          unit_price: li.unit_price,
          tax_rate: li.tax_rate,
          tax_code_id: li.tax_code_id || undefined,
          line_type: li.line_type,
          discount: li.discount,
        })),
      })
      navigate("/sales/invoices")
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

  if (!invoice) {
    return <div className="p-6 text-muted-foreground">Invoice not found.</div>
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <div className="text-xs text-muted-foreground">Sales</div>
        <div className="text-2xl font-semibold tracking-tight text-foreground">Edit Invoice {invoice.invoice_number}</div>
      </div>

      {/* Items Card */}
      <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Invoice #</label>
            <Input
              value={invoiceNumber}
              onChange={e => setInvoiceNumber(e.target.value)}
              placeholder="INV-000000"
              className="h-10 rounded-xl"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Customer</label>
            <Select value={contactId} onValueChange={handleContactChange}>
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue placeholder="Select customer" />
              </SelectTrigger>
              <SelectContent>
                {contacts
                  .filter((c: any) => c.type === "customer" || c.type === "both")
                  .map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                <SelectItem value="__add_new__" className="text-primary font-medium">+ Add New Customer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Terms</label>
            <Select value={terms} onValueChange={setTerms}>
              <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cbd">C.B.D.</SelectItem>
                <SelectItem value="due_on_receipt">Due on Receipt</SelectItem>
                <SelectItem value="net7">Net 7</SelectItem>
                <SelectItem value="net15">Net 15</SelectItem>
                <SelectItem value="net30">Net 30</SelectItem>
                <SelectItem value="net60">Net 60</SelectItem>
                <SelectItem value="net90">Net 90</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Date</label>
            <Input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className="h-10 rounded-xl" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Customer PO</label>
            <Input value={customerPo} onChange={e => setCustomerPo(e.target.value)} placeholder="Optional" className="h-10 rounded-xl" />
          </div>
        </div>

        <div className="mt-6 overflow-x-auto rounded-2xl border border-border">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="w-10 text-center text-muted-foreground">#</TableHead>
                <TableHead className="w-[100px] text-muted-foreground">Type</TableHead>
                <TableHead className="min-w-[200px] text-muted-foreground">Description</TableHead>
                <TableHead className="w-[160px] text-muted-foreground">Account</TableHead>
                <TableHead className="w-[80px] text-muted-foreground">Quantity</TableHead>
                <TableHead className="w-[110px] text-muted-foreground">Unit Price</TableHead>
                <TableHead className="w-[80px] text-muted-foreground">Discount</TableHead>
                <TableHead className="w-[160px] text-muted-foreground">Tax Code</TableHead>
                <TableHead className="w-[80px] text-muted-foreground">Tax %</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineItems.map((item, idx) => (
                <TableRow key={idx} className="border-border">
                  <TableCell className="text-center text-xs text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell>
                    <Select value={item.line_type} onValueChange={v => updateLineItem(idx, "line_type", v)}>
                      <SelectTrigger className="h-9 rounded-lg border-0 bg-transparent shadow-none"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="goods">Goods</SelectItem>
                        <SelectItem value="services">Services</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input value={item.description} onChange={e => updateLineItem(idx, "description", e.target.value)} placeholder="Description" className="h-9 rounded-lg border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-1" />
                  </TableCell>
                  <TableCell>
                    <Select value={item.account_id} onValueChange={v => updateLineItem(idx, "account_id", v)}>
                      <SelectTrigger className="h-9 rounded-lg border-0 bg-transparent shadow-none"><SelectValue placeholder="Account" /></SelectTrigger>
                      <SelectContent>
                        {accounts.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.code} – {a.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {item.line_type === "services" ? (
                      <span className="px-1 text-sm text-muted-foreground">&mdash;</span>
                    ) : (
                      <Input type="number" min={0} value={item.quantity} onChange={e => updateLineItem(idx, "quantity", Number(e.target.value))} className="h-9 rounded-lg border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-1" />
                    )}
                  </TableCell>
                  <TableCell>
                    <Input type="number" min={0} step={0.01} value={item.unit_price} onChange={e => updateLineItem(idx, "unit_price", Number(e.target.value))} className="h-9 rounded-lg border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-1" />
                  </TableCell>
                  <TableCell>
                    <Input type="number" min={0} max={100} value={item.discount} onChange={e => updateLineItem(idx, "discount", Number(e.target.value))} className="h-9 rounded-lg border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-1" placeholder="%" />
                  </TableCell>
                  <TableCell className="w-[160px]">
                    <Select value={item.tax_code_id} onValueChange={v => updateLineItem(idx, "tax_code_id", v === "__none__" ? "" : v)}>
                      <SelectTrigger className="h-9 rounded-lg border-0 bg-transparent shadow-none focus:ring-1 text-xs"><SelectValue placeholder="Tax Code" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No Tax</SelectItem>
                        {taxRates.map((tc: any) => <SelectItem key={tc.id} value={tc.id}>{tc.code} ({tc.rate}%)</SelectItem>)}
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
              <span className="text-muted-foreground">Sub Total</span>
              <span className="font-medium text-foreground">RM {subTotal.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span className="font-medium text-foreground">RM {totalTax.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Discount</span>
              <span className="font-medium text-foreground">RM {totalLineDiscount.toFixed(2)}</span>
            </div>
            <div className="border-t border-border pt-2">
              <div className="flex items-center justify-between text-base font-bold">
                <span className="text-foreground">TOTAL</span>
                <span className="text-foreground">RM {total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 border-t border-border pt-4 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Journal / Memo</label>
            <textarea value={journalMemo} onChange={e => setJournalMemo(e.target.value)} placeholder="Internal memo..." rows={2} className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div className="flex flex-wrap items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Applied to Date:</span>
              <span className="font-medium text-foreground">RM {appliedToDate.toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Balance Due:</span>
              <span className="font-semibold text-foreground">RM {balanceDue.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Billing Address Card */}
      <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <h3 className="mb-4 text-sm font-semibold text-foreground">Billing Address</h3>
        <div className="max-w-lg space-y-3">
          <Input placeholder="Address Line 1" className="h-10 rounded-xl" value={billingLine1} onChange={e => setBillingLine1(e.target.value)} />
          <Input placeholder="Address Line 2" className="h-10 rounded-xl" value={billingLine2} onChange={e => setBillingLine2(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="City" className="h-10 rounded-xl" value={billingCity} onChange={e => setBillingCity(e.target.value)} />
            <Input placeholder="State" className="h-10 rounded-xl" value={billingState} onChange={e => setBillingState(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="Postcode" className="h-10 rounded-xl" value={billingPostcode} onChange={e => setBillingPostcode(e.target.value)} />
            <Input placeholder="Country" className="h-10 rounded-xl" value={billingCountry} onChange={e => setBillingCountry(e.target.value)} />
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

      {/* Payment Terms Card */}
      <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <h3 className="mb-4 text-sm font-semibold text-foreground">Payment Terms</h3>
        <div className="max-w-lg space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Payment Terms</label>
            <Select value={terms} onValueChange={setTerms}>
              <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cbd">C.B.D.</SelectItem>
                <SelectItem value="due_on_receipt">Due on Receipt</SelectItem>
                <SelectItem value="net7">Net 7</SelectItem>
                <SelectItem value="net15">Net 15</SelectItem>
                <SelectItem value="net30">Net 30</SelectItem>
                <SelectItem value="net60">Net 60</SelectItem>
                <SelectItem value="net90">Net 90</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Payment Instructions</label>
            <textarea placeholder="Bank details, payment methods..." rows={4} className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
        </div>
      </Card>

      {/* Additional Info Card */}
      <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <h3 className="mb-4 text-sm font-semibold text-foreground">Additional Info</h3>
        <div className="max-w-lg space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Footer Note</label>
            <textarea placeholder="Appears at the bottom of the invoice..." rows={3} className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Terms & Conditions</label>
            <textarea placeholder="Standard terms and conditions..." rows={4} className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
        </div>
      </Card>

      {/* Activity Timeline */}
      {activity && (
        <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
          <div className="mb-4 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-foreground">Activity</h3>
            <div className="text-xs text-muted-foreground">
              Total {activity.total.toFixed(2)} · Outstanding <span className={activity.outstanding > 0 ? "text-amber-600 font-semibold" : "text-emerald-600 font-semibold"}>{activity.outstanding.toFixed(2)}</span>
            </div>
          </div>
          {activity.events.length === 0 ? (
            <div className="text-sm text-muted-foreground">No activity yet.</div>
          ) : (
            <div className="space-y-3">
              {activity.events.map((ev: InvoiceActivityEvent, idx: number) => (
                <ActivityRow key={`${ev.type}-${ev.ref_id}-${idx}`} event={ev} />
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Save/Cancel Footer */}
      <div className="flex items-center justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => navigate("/sales/invoices")}>Cancel</Button>
        <Button type="button" onClick={handleSave} disabled={updateInvoice.isPending || !contactId || !lineItems.some(li => li.description.trim())} className="h-10 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 text-sm font-semibold text-white shadow-sm hover:opacity-95">
          {updateInvoice.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  )
}

const TYPE_LABELS: Record<string, string> = {
  issued: "Invoice issued",
  credit_note: "Credit Note",
  debit_note: "Debit Note",
  payment: "Payment received",
  refund: "Refund issued",
  journal: "Journal entry",
}

const TYPE_COLORS: Record<string, string> = {
  issued: "bg-blue-100 text-blue-700",
  credit_note: "bg-rose-100 text-rose-700",
  debit_note: "bg-amber-100 text-amber-700",
  payment: "bg-emerald-100 text-emerald-700",
  refund: "bg-orange-100 text-orange-700",
  journal: "bg-slate-100 text-slate-700",
}

function ActivityRow({ event }: { event: InvoiceActivityEvent }) {
  const date = event.ts ? new Date(event.ts).toLocaleDateString() : "—"
  const sign = event.delta > 0 ? "+" : event.delta < 0 ? "−" : ""
  const amount = Math.abs(event.delta).toFixed(2)
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-background/50 p-3">
      <div className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TYPE_COLORS[event.type] ?? "bg-slate-100 text-slate-700"}`}>
        {TYPE_LABELS[event.type] ?? event.type}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-sm font-medium text-foreground truncate">
            {event.ref}
            {event.status && event.status !== "completed" && event.status !== "sent" && (
              <span className="ml-2 text-[10px] uppercase text-muted-foreground">({event.status})</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground shrink-0">{date}</div>
        </div>
        {event.note && <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{event.note}</div>}
        {event.lines && event.lines.length > 0 && (
          <div className="mt-2 space-y-0.5 text-[11px] font-mono">
            {event.lines.map((ln, i) => (
              <div key={i} className="flex justify-between gap-3 text-muted-foreground">
                <span className="truncate">{ln.account_code} – {ln.account_name}</span>
                <span className="shrink-0">
                  {ln.debit > 0 ? `Dr ${ln.debit.toFixed(2)}` : `Cr ${ln.credit.toFixed(2)}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="text-right shrink-0">
        {event.type !== "journal" && (
          <div className={`text-sm font-semibold ${event.delta > 0 ? "text-amber-600" : "text-emerald-600"}`}>
            {sign}{amount}
          </div>
        )}
        <div className="text-[11px] text-muted-foreground">Bal {event.balance.toFixed(2)}</div>
      </div>
    </div>
  )
}
