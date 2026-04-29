import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Plus, Trash2 } from "lucide-react"
import { useContacts, useAccounts, useCreateInvoice, useTaxRates } from "../../../lib/hooks"
import { useTheme } from "../../../lib/theme"
import { getContactPrefs } from "../../../lib/contact-prefs"
import { Card } from "../../../components/ui/card"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select"
import { SearchableSelect } from "../../../components/ui/searchable-select"
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

export default function NewInvoicePage() {
  const navigate = useNavigate()
  const { t } = useTheme()
  const { data: contacts = [] } = useContacts()
  const { data: accounts = [] } = useAccounts()
  const createInvoice = useCreateInvoice()
  const { data: taxRates = [] } = useTaxRates()

  const [invoiceNumber, setInvoiceNumber] = useState(() => `INV-${Date.now().toString().slice(-6)}`)
  const [contactId, setContactId] = useState("")
  const [terms, setTerms] = useState("cbd")
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [customerPo, setCustomerPo] = useState("")

  const [billingLine1, setBillingLine1] = useState("")
  const [billingLine2, setBillingLine2] = useState("")
  const [billingCity, setBillingCity] = useState("")
  const [billingState, setBillingState] = useState("")
  const [billingPostcode, setBillingPostcode] = useState("")
  const [billingCountry, setBillingCountry] = useState("")

  const handleContactChange = (id: string) => {
    if (id === "__add_new__") { navigate("/contacts/new"); return }
    setContactId(id)
    const contact = contacts.find((c: any) => c.id === id) as any
    if (contact) {
      setBillingLine1(contact.billing_address_line1 ?? "")
      setBillingLine2(contact.billing_address_line2 ?? "")
      setBillingCity(contact.billing_city ?? "")
      setBillingState(contact.billing_state ?? "")
      setBillingPostcode(contact.billing_postcode ?? "")
      setBillingCountry(contact.billing_country ?? "")
      if (contact.default_payment_terms) setTerms(contact.default_payment_terms)
    }
    const prefs = getContactPrefs(id)
    if (prefs.currency) setCurrency(prefs.currency)
  }

  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: "", account_id: "", quantity: 1, unit_price: 0, amount: 0, discount: 0, tax_rate: 0, line_type: "goods", tax_code_id: "" },
  ])


  const [currency, setCurrency] = useState("MYR")
  const [journalMemo, setJournalMemo] = useState("")

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
      await createInvoice.mutateAsync({
        contact_id: contactId,
        invoice_number: invoiceNumber || undefined,
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

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="text-xs text-muted-foreground">{t("invoices.category") || "Sales"}</div>
        <div className="text-2xl font-semibold tracking-tight text-foreground">{t("invoices.new") || "New Invoice"}</div>
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
            <SearchableSelect
              value={contactId}
              onChange={handleContactChange}
              placeholder="Search or select customer"
              options={contacts
                .filter((c: any) => c.type === "customer" || c.type === "both")
                .map((c: any) => ({ value: c.id, label: c.name, hint: c.email ?? "" }))}
              footerAction={{ label: "+ Add New Customer", onClick: () => navigate("/contacts/new") }}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Terms</label>
            <Select value={terms} onValueChange={setTerms}>
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue />
              </SelectTrigger>
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
            <Input
              type="date"
              value={invoiceDate}
              onChange={e => setInvoiceDate(e.target.value)}
              className="h-10 rounded-xl"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Customer PO</label>
            <Input
              value={customerPo}
              onChange={e => setCustomerPo(e.target.value)}
              placeholder="Optional"
              className="h-10 rounded-xl"
            />
          </div>

        </div>

        <div className="mt-6 rounded-2xl border border-border">
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
                      <SelectTrigger className="h-9 rounded-lg border-0 bg-transparent shadow-none">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="goods">Goods</SelectItem>
                        <SelectItem value="services">Services</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      value={item.description}
                      onChange={e => updateLineItem(idx, "description", e.target.value)}
                      placeholder="Description"
                      className="h-9 rounded-lg border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-1"
                    />
                  </TableCell>
                  <TableCell>
                    <SearchableSelect
                      value={item.account_id}
                      onChange={v => updateLineItem(idx, "account_id", v)}
                      placeholder="Account"
                      triggerClassName="h-9 rounded-lg border-0 bg-transparent shadow-none text-xs"
                      options={accounts.map((a: any) => ({ value: a.id, label: `${a.code} – ${a.name}`, hint: a.code }))}
                    />
                  </TableCell>
                  <TableCell>
                    {item.line_type === "services" ? (
                      <span className="px-1 text-sm text-muted-foreground">&mdash;</span>
                    ) : (
                      <Input
                        type="number"
                        min={0}
                        value={item.quantity}
                        onChange={e => updateLineItem(idx, "quantity", Number(e.target.value))}
                        className="h-9 rounded-lg border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-1"
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={item.unit_price}
                      onChange={e => updateLineItem(idx, "unit_price", Number(e.target.value))}
                      className="h-9 rounded-lg border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-1"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={item.discount}
                      onChange={e => updateLineItem(idx, "discount", Number(e.target.value))}
                      className="h-9 rounded-lg border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-1"
                      placeholder="%"
                    />
                  </TableCell>
                  <TableCell className="w-[160px]">
                    <Select value={item.tax_code_id} onValueChange={v => updateLineItem(idx, "tax_code_id", v === "__none__" ? "" : v)}>
                      <SelectTrigger className="h-9 rounded-lg border-0 bg-transparent shadow-none focus:ring-1 text-xs">
                        <SelectValue placeholder="Tax Code" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No Tax</SelectItem>
                        {taxRates.map((tc: any) => (
                          <SelectItem key={tc.id} value={tc.id}>
                            {tc.code} ({tc.rate}%)
                          </SelectItem>
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
                    <button
                      type="button"
                      onClick={() => removeLineItem(idx)}
                      className="text-muted-foreground hover:text-rose-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={addLineItem}
            className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white shadow-sm hover:opacity-95"
          >
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
            <textarea
              value={journalMemo}
              onChange={e => setJournalMemo(e.target.value)}
              placeholder="Internal memo..."
              rows={2}
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
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

          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Invoice Delivery Status:</span>
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
              Not Sent
            </span>
          </div>
        </div>
      </Card>

      {/* Billing & Shipping Card */}
      <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <h3 className="mb-4 text-sm font-semibold text-foreground">Billing & Shipping</h3>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <h3 className="mb-4 text-sm font-semibold text-foreground">Billing Address</h3>
            <div className="space-y-3">
              <Input placeholder="Address Line 1" value={billingLine1} onChange={e => setBillingLine1(e.target.value)} className="h-10 rounded-xl" />
              <Input placeholder="Address Line 2" value={billingLine2} onChange={e => setBillingLine2(e.target.value)} className="h-10 rounded-xl" />
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="City" value={billingCity} onChange={e => setBillingCity(e.target.value)} className="h-10 rounded-xl" />
                <Input placeholder="State" value={billingState} onChange={e => setBillingState(e.target.value)} className="h-10 rounded-xl" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="Postcode" value={billingPostcode} onChange={e => setBillingPostcode(e.target.value)} className="h-10 rounded-xl" />
                <Input placeholder="Country" value={billingCountry} onChange={e => setBillingCountry(e.target.value)} className="h-10 rounded-xl" />
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
            <textarea
              placeholder="Internal notes..."
              rows={3}
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
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
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue />
              </SelectTrigger>
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
            <textarea
              placeholder="Bank details, payment methods..."
              rows={4}
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
      </Card>

      {/* Additional Info Card */}
      <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <h3 className="mb-4 text-sm font-semibold text-foreground">Additional Info</h3>
        <div className="max-w-lg space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Footer Note</label>
            <textarea
              placeholder="Appears at the bottom of the invoice..."
              rows={3}
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Terms & Conditions</label>
            <textarea
              placeholder="Standard terms and conditions..."
              rows={4}
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
      </Card>

      {/* Save/Cancel Footer */}
      <div className="flex items-center justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => navigate("/sales/invoices")}>Cancel</Button>
        <Button
          type="button"
          onClick={handleSave}
          disabled={createInvoice.isPending || !contactId || !lineItems.some(li => li.description.trim())}
          className="h-10 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 text-sm font-semibold text-white shadow-sm hover:opacity-95"
        >
          {createInvoice.isPending ? "Saving..." : t("form.save") || "Save"}
        </Button>
      </div>
    </div>
  )
}
