import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useToast } from "../../../components/ui/toast"
import { useContacts, useAccounts, useInvoices, useCreateDebitNote, useTaxRates } from "../../../lib/hooks"
import { getContactPrefs } from "../../../lib/contact-prefs"
import { Card } from "../../../components/ui/card"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select"
import { SearchableSelect } from "../../../components/ui/searchable-select"
import { LineItemsEditor } from "../../../components/line-items/LineItemsEditor"
import type { LineItem } from "../../../components/line-items/types"

function emptyLine(): LineItem {
  return {
    line_type: "goods",
    description: "",
    account_id: "",
    quantity: 1,
    unit_price: 0,
    discount: 0,
    discount_mode: "percent",
    tax_rate: 0,
    tax_code_id: "",
    amount: 0,
  }
}

function lineDiscountAmount(item: LineItem): number {
  const lineTotal = item.quantity * item.unit_price
  return item.discount_mode === "amount"
    ? Math.min(item.discount, lineTotal)
    : (lineTotal * item.discount) / 100
}

export default function NewDebitNotePage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data: contacts = [] } = useContacts()
  const { data: accounts = [] } = useAccounts()
  const { data: invoices = [] } = useInvoices()
  const createDebitNote = useCreateDebitNote()
  const { data: taxRates = [] } = useTaxRates()

  const [debitNoteNumber, setDebitNoteNumber] = useState("")
  const [customerId, setCustomerId] = useState("")
  const [linkedInvoiceId, setLinkedInvoiceId] = useState("")
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [reference, setReference] = useState("")
  const [currency, setCurrency] = useState("MYR")
  const [lines, setLines] = useState<LineItem[]>([emptyLine()])

  const [billingLine1, setBillingLine1] = useState("")
  const [billingLine2, setBillingLine2] = useState("")
  const [billingCity, setBillingCity] = useState("")
  const [billingState, setBillingState] = useState("")
  const [billingPostcode, setBillingPostcode] = useState("")
  const [billingCountry, setBillingCountry] = useState("")

  const [sameAsShipping, setSameAsShipping] = useState(true)
  const [shippingLine1, setShippingLine1] = useState("")
  const [shippingLine2, setShippingLine2] = useState("")
  const [shippingCity, setShippingCity] = useState("")
  const [shippingState, setShippingState] = useState("")
  const [shippingPostcode, setShippingPostcode] = useState("")
  const [shippingCountry, setShippingCountry] = useState("")

  const syncShipping = (field: string, value: string) => {
    if (!sameAsShipping) return
    switch (field) {
      case "line1": setShippingLine1(value); break
      case "line2": setShippingLine2(value); break
      case "city": setShippingCity(value); break
      case "state": setShippingState(value); break
      case "postcode": setShippingPostcode(value); break
      case "country": setShippingCountry(value); break
    }
  }

  const customers = contacts.filter((c: any) => c.type === "customer" || c.type === "both")

  const handleCustomerChange = (v: string) => {
    if (v === "__add_new__") { navigate("/contacts/new"); return }
    setCustomerId(v)
    setLinkedInvoiceId("")
    const contact = contacts.find((c: any) => c.id === v) as any
    if (contact) {
      const l1 = contact.billing_address_line1 ?? ""
      const l2 = contact.billing_address_line2 ?? ""
      const city = contact.billing_city ?? ""
      const state = contact.billing_state ?? ""
      const postcode = contact.billing_postcode ?? ""
      const country = contact.billing_country ?? ""
      setBillingLine1(l1); setBillingLine2(l2); setBillingCity(city)
      setBillingState(state); setBillingPostcode(postcode); setBillingCountry(country)
      if (sameAsShipping) {
        setShippingLine1(l1); setShippingLine2(l2); setShippingCity(city)
        setShippingState(state); setShippingPostcode(postcode); setShippingCountry(country)
      }
    }
    const prefs = getContactPrefs(v)
    if (prefs.currency) setCurrency(prefs.currency)
  }

  const filteredInvoices = customerId
    ? invoices.filter((inv: any) => inv.contact_id === customerId)
    : invoices

  const updateLine = (idx: number, field: keyof LineItem, value: string | number) => {
    setLines(prev => {
      const updated = [...prev]
      const line = { ...updated[idx], [field]: value }
      if (field === "tax_code_id") {
        const tc = taxRates.find((t: any) => t.id === value)
        if (tc) line.tax_rate = tc.rate
      }
      updated[idx] = line
      return updated
    })
  }

  const addLine = () => setLines(prev => [...prev, emptyLine()])
  const removeLine = (idx: number) => {
    setLines(prev => prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx))
  }

  const subTotal = lines.reduce((sum, l) => sum + l.quantity * l.unit_price, 0)
  const totalDiscount = lines.reduce((sum, l) => sum + lineDiscountAmount(l), 0)
  const totalTax = lines.reduce((sum, l) => sum + (l.quantity * l.unit_price - lineDiscountAmount(l)) * (l.tax_rate / 100), 0)
  const total = subTotal - totalDiscount + totalTax

  const isFormValid = !!customerId && lines.some(l => l.description.trim() !== "") && lines.every(l => l.account_id)

  const handleSave = () => {
    if (!isFormValid) return
    createDebitNote.mutate(
      {
        contact_id: customerId,
        debit_note_number: debitNoteNumber || undefined,
        invoice_id: linkedInvoiceId || undefined,
        issue_date: date,
        reference,
        notes: null,
        billing_address_line1: billingLine1 || null,
        billing_address_line2: billingLine2 || null,
        billing_city: billingCity || null,
        billing_state: billingState || null,
        billing_postcode: billingPostcode || null,
        billing_country: billingCountry || null,
        shipping_address_line1: shippingLine1 || null,
        shipping_address_line2: shippingLine2 || null,
        shipping_city: shippingCity || null,
        shipping_state: shippingState || null,
        shipping_postcode: shippingPostcode || null,
        shipping_country: shippingCountry || null,
        line_items: lines.map(l => ({
          description: l.description,
          line_type: l.line_type,
          account_id: l.account_id || undefined,
          quantity: l.quantity,
          unit_price: l.unit_price,
          discount: l.discount,
          discount_mode: l.discount_mode,
          tax_rate: l.tax_rate,
          tax_code_id: l.tax_code_id || undefined,
        })),
      } as any,
      {
        onSuccess: () => navigate("/sales/debit-notes"),
        onError: (err: any) => toast(err?.response?.data?.detail ?? "Failed to save debit note", "warning"),
      }
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Sales</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">New Debit Note</div>
        <div className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Create a debit note to increase the original invoice amount.
        </div>
      </div>

      <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Debit Note #</label>
              <Input
                value={debitNoteNumber}
                onChange={e => setDebitNoteNumber(e.target.value)}
                placeholder="DN-000000"
                className="mt-1.5 h-10 rounded-xl"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Customer</label>
              <SearchableSelect
                value={customerId}
                onChange={handleCustomerChange}
                placeholder="Search or select customer"
                options={customers.map((c: any) => ({ value: c.id, label: c.name, hint: (c as any).email ?? "" }))}
                footerAction={{ label: "+ Add New Customer", onClick: () => navigate("/contacts/new") }}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Linked Invoice</label>
              <Select value={linkedInvoiceId} onValueChange={setLinkedInvoiceId}>
                <SelectTrigger className="mt-1.5 h-10 rounded-xl">
                  <SelectValue placeholder="Select invoice" />
                </SelectTrigger>
                <SelectContent>
                  {filteredInvoices.map((inv: any) => (
                    <SelectItem key={inv.id} value={inv.id}>
                      {inv.invoice_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Date</label>
              <Input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="mt-1.5 h-10 rounded-xl"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Reference</label>
              <Input
                value={reference}
                onChange={e => setReference(e.target.value)}
                placeholder="Enter reference"
                className="mt-1.5 h-10 rounded-xl"
              />
            </div>
          </div>

          {/* Billing & Shipping Address */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-border p-4">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Billing Address</div>
              <div className="flex flex-col gap-2">
                <Input value={billingLine1} onChange={e => { setBillingLine1(e.target.value); syncShipping("line1", e.target.value) }} placeholder="Address Line 1" className="h-9 rounded-lg" />
                <Input value={billingLine2} onChange={e => { setBillingLine2(e.target.value); syncShipping("line2", e.target.value) }} placeholder="Address Line 2" className="h-9 rounded-lg" />
                <div className="grid grid-cols-2 gap-2">
                  <Input value={billingCity} onChange={e => { setBillingCity(e.target.value); syncShipping("city", e.target.value) }} placeholder="City" className="h-9 rounded-lg" />
                  <Input value={billingState} onChange={e => { setBillingState(e.target.value); syncShipping("state", e.target.value) }} placeholder="State" className="h-9 rounded-lg" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input value={billingPostcode} onChange={e => { setBillingPostcode(e.target.value); syncShipping("postcode", e.target.value) }} placeholder="Postcode" className="h-9 rounded-lg" />
                  <Input value={billingCountry} onChange={e => { setBillingCountry(e.target.value); syncShipping("country", e.target.value) }} placeholder="Country" className="h-9 rounded-lg" />
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Shipping Address</div>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sameAsShipping}
                    onChange={e => {
                      setSameAsShipping(e.target.checked)
                      if (e.target.checked) {
                        setShippingLine1(billingLine1); setShippingLine2(billingLine2)
                        setShippingCity(billingCity); setShippingState(billingState)
                        setShippingPostcode(billingPostcode); setShippingCountry(billingCountry)
                      }
                    }}
                    className="h-3.5 w-3.5 rounded"
                  />
                  <span className="text-[11px] text-muted-foreground">Same as billing</span>
                </label>
              </div>
              <div className="flex flex-col gap-2">
                <Input value={shippingLine1} onChange={e => { setSameAsShipping(false); setShippingLine1(e.target.value) }} placeholder="Address Line 1" className="h-9 rounded-lg" />
                <Input value={shippingLine2} onChange={e => { setSameAsShipping(false); setShippingLine2(e.target.value) }} placeholder="Address Line 2" className="h-9 rounded-lg" />
                <div className="grid grid-cols-2 gap-2">
                  <Input value={shippingCity} onChange={e => { setSameAsShipping(false); setShippingCity(e.target.value) }} placeholder="City" className="h-9 rounded-lg" />
                  <Input value={shippingState} onChange={e => { setSameAsShipping(false); setShippingState(e.target.value) }} placeholder="State" className="h-9 rounded-lg" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input value={shippingPostcode} onChange={e => { setSameAsShipping(false); setShippingPostcode(e.target.value) }} placeholder="Postcode" className="h-9 rounded-lg" />
                  <Input value={shippingCountry} onChange={e => { setSameAsShipping(false); setShippingCountry(e.target.value) }} placeholder="Country" className="h-9 rounded-lg" />
                </div>
              </div>
            </div>
          </div>

          <LineItemsEditor
            items={lines}
            updateLine={updateLine}
            addLine={addLine}
            removeLine={removeLine}
            accounts={accounts as any[]}
            taxRates={taxRates as any[]}
            currency={currency}
            quantityHeading="Quantity"
            servicesQtyStyle="span"
            discountToggleTitle
          />

          <div className="flex justify-end">
            <div className="w-full max-w-sm flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Sub Total</span>
                <span className="text-foreground">{subTotal.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Discount</span>
                <span className="text-foreground">- {totalDiscount.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Tax</span>
                <span className="text-foreground">{totalTax.toFixed(2)}</span>
              </div>
              <div className="border-t border-border pt-2 flex items-center justify-between text-sm font-semibold">
                <span className="text-foreground">TOTAL</span>
                <span className="text-foreground">{total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-end">
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" onClick={() => navigate("/sales/debit-notes")}>Cancel</Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={createDebitNote.isPending || !isFormValid}
            className="h-9 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 text-xs font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  )
}
