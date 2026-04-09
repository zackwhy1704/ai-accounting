import { useState, useEffect, useRef } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Plus, Trash2, Loader2 } from "lucide-react"
import { useInvoice, useUpdateInvoice, useContacts, useAccounts, useTaxRates } from "../../../lib/hooks"
import { getContactPrefs } from "../../../lib/contact-prefs"
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

const TABS = [
  { key: "billing", label: "Billing & Shipping" },
  { key: "general", label: "General Info" },
  { key: "items", label: "Items" },
  { key: "payment", label: "Payment Terms" },
  { key: "additional", label: "Additional Info" },
] as const

type TabKey = (typeof TABS)[number]["key"]

export default function EditInvoicePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: invoice, isLoading } = useInvoice(id)
  const { data: contacts = [] } = useContacts()
  const { data: accounts = [] } = useAccounts()
  const { data: taxRates = [] } = useTaxRates()
  const updateInvoice = useUpdateInvoice()
  const populated = useRef(false)

  const [activeTab, setActiveTab] = useState<TabKey>("items")
  const [invoiceNumber, setInvoiceNumber] = useState("")
  const [contactId, setContactId] = useState("")
  const [lhdnName, setLhdnName] = useState("")
  const [terms, setTerms] = useState("cbd")
  const [taxInclusive, setTaxInclusive] = useState(false)
  const [invoiceDate, setInvoiceDate] = useState("")
  const [customerPo, setCustomerPo] = useState("")
  const [digitalRef, setDigitalRef] = useState("")
  const [discountGiven, setDiscountGiven] = useState(0)
  const [roundingAdjustment, setRoundingAdjustment] = useState(false)
  const [roundingAmount, setRoundingAmount] = useState(0)
  const [journalMemo, setJournalMemo] = useState("")
  const [quickShareEmail, setQuickShareEmail] = useState(false)
  const [billingLine1, setBillingLine1] = useState("")
  const [billingLine2, setBillingLine2] = useState("")
  const [billingCity, setBillingCity] = useState("")
  const [billingState, setBillingState] = useState("")
  const [billingPostcode, setBillingPostcode] = useState("")
  const [billingCountry, setBillingCountry] = useState("")
  const [shippingLine1, setShippingLine1] = useState("")
  const [shippingLine2, setShippingLine2] = useState("")
  const [shippingCity, setShippingCity] = useState("")
  const [shippingState, setShippingState] = useState("")
  const [shippingPostcode, setShippingPostcode] = useState("")
  const [shippingCountry, setShippingCountry] = useState("")
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: "", account_id: "", quantity: 1, unit_price: 0, amount: 0, discount: 0, tax_rate: 0, line_type: "goods", tax_code_id: "" },
  ])

  useEffect(() => {
    if (!invoice || populated.current) return
    setInvoiceNumber(invoice.invoice_number ?? "")
    setContactId(String(invoice.contact_id ?? ""))
    setLhdnName(invoice.lhdn_name ?? "")
    setTerms(invoice.terms ?? "cbd")
    setTaxInclusive(invoice.tax_inclusive ?? true)
    setInvoiceDate(invoice.invoice_date?.slice(0, 10) ?? "")
    setCustomerPo(invoice.customer_po ?? "")
    setDigitalRef(invoice.digital_ref ?? "")
    setDiscountGiven(invoice.discount_given ?? 0)
    setRoundingAdjustment(invoice.rounding_adjustment ?? false)
    setRoundingAmount(invoice.rounding_amount ?? 0)
    setJournalMemo(invoice.journal_memo ?? "")
    setQuickShareEmail(invoice.quick_share_email ?? false)
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
    setShippingLine1(invoice.shipping_address_line1 ?? "")
    setShippingLine2(invoice.shipping_address_line2 ?? "")
    setShippingCity(invoice.shipping_city ?? "")
    setShippingState(invoice.shipping_state ?? "")
    setShippingPostcode(invoice.shipping_postcode ?? "")
    setShippingCountry(invoice.shipping_country ?? "")
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
    setShippingLine1(contact.shipping_address_line1 ?? "")
    setShippingLine2(contact.shipping_address_line2 ?? "")
    setShippingCity(contact.shipping_city ?? "")
    setShippingState(contact.shipping_state ?? "")
    setShippingPostcode(contact.shipping_postcode ?? "")
    setShippingCountry(contact.shipping_country ?? "")
    if (contact.default_payment_terms) setTerms(contact.default_payment_terms)
    const prefs = getContactPrefs(v)
    if (prefs.tax_inclusive !== undefined) setTaxInclusive(prefs.tax_inclusive)
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
      const tax = taxInclusive ? 0 : (afterDiscount * item.tax_rate) / 100
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
  const afterDiscount = subTotal - totalLineDiscount - discountGiven
  const totalTax = taxInclusive ? 0 : lineItems.reduce((sum, item) => {
    const lineTotal = item.quantity * item.unit_price
    const afterLineDiscount = lineTotal - (lineTotal * item.discount) / 100
    return sum + (afterLineDiscount * item.tax_rate) / 100
  }, 0)
  const roundingDiff = roundingAdjustment ? roundingAmount : 0
  const total = afterDiscount + totalTax + roundingDiff
  const appliedToDate = 0
  const balanceDue = total - appliedToDate

  const handleSave = async () => {
    try {
      await updateInvoice.mutateAsync({
        id,
        contact_id: contactId,
        issue_date: invoiceDate,
        due_date: invoiceDate,
        currency: "MYR",
        notes: journalMemo || null,
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="text-xs text-muted-foreground">Sales</div>
        <div className="text-2xl font-semibold tracking-tight text-foreground">Edit Invoice {invoice.invoice_number}</div>
      </div>

      <div className="flex items-center gap-6 border-b border-border">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`pb-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "border-b-2 border-blue-500 text-blue-600"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "items" && (
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
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Company Name</label>
              <Input value={lhdnName} onChange={e => setLhdnName(e.target.value)} placeholder="Registered company name" className="h-10 rounded-xl" />
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
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Digital Ref</label>
              <Input value={digitalRef} onChange={e => setDigitalRef(e.target.value)} placeholder="Digital reference" className="h-10 rounded-xl" />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTaxInclusive(!taxInclusive)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${taxInclusive ? "bg-blue-500" : "bg-gray-300"}`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${taxInclusive ? "translate-x-4" : "translate-x-0.5"}`} />
            </button>
            <span className="text-xs font-medium text-muted-foreground">{taxInclusive ? "Tax Inclusive" : "Tax Exclusive"}</span>
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
                  <TableHead className="w-[110px] text-right text-muted-foreground">Amount</TableHead>
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
                    <TableCell className="text-right text-sm font-medium text-foreground">{item.amount.toFixed(2)}</TableCell>
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
                <span className="text-muted-foreground">Discount Given</span>
                <Input type="number" min={0} step={0.01} value={discountGiven} onChange={e => setDiscountGiven(Number(e.target.value))} className="h-8 w-28 rounded-lg text-right text-sm" placeholder="RM" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span className="font-medium text-foreground">RM {totalTax.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Rounding Adjustment</span>
                  <button type="button" onClick={() => setRoundingAdjustment(!roundingAdjustment)} className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${roundingAdjustment ? "bg-blue-500" : "bg-gray-300"}`}>
                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${roundingAdjustment ? "translate-x-3.5" : "translate-x-0.5"}`} />
                  </button>
                </div>
                {roundingAdjustment ? (
                  <Input type="number" step={0.01} value={roundingAmount} onChange={e => setRoundingAmount(Number(e.target.value))} className="h-8 w-28 rounded-lg text-right text-sm" placeholder="RM" />
                ) : (
                  <span className="font-medium text-foreground">0.00</span>
                )}
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
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={quickShareEmail} onChange={e => setQuickShareEmail(e.target.checked)} className="h-4 w-4 rounded border-border" />
                QuickShare via Email
              </label>
              <div className="flex items-center gap-3">
                <Button type="button" variant="outline" onClick={() => navigate("/sales/invoices")}>Cancel</Button>
                <Button type="button" onClick={handleSave} disabled={updateInvoice.isPending || !contactId || !lineItems.some(li => li.description.trim())} className="h-10 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 text-sm font-semibold text-white shadow-sm hover:opacity-95">
                  {updateInvoice.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {activeTab === "billing" && (
        <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <h3 className="mb-4 text-sm font-semibold text-foreground">Billing Address</h3>
              <div className="space-y-3">
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
            </div>
            <div>
              <h3 className="mb-4 text-sm font-semibold text-foreground">Shipping Address</h3>
              <div className="space-y-3">
                <Input placeholder="Address Line 1" className="h-10 rounded-xl" value={shippingLine1} onChange={e => setShippingLine1(e.target.value)} />
                <Input placeholder="Address Line 2" className="h-10 rounded-xl" value={shippingLine2} onChange={e => setShippingLine2(e.target.value)} />
                <div className="grid grid-cols-2 gap-3">
                  <Input placeholder="City" className="h-10 rounded-xl" value={shippingCity} onChange={e => setShippingCity(e.target.value)} />
                  <Input placeholder="State" className="h-10 rounded-xl" value={shippingState} onChange={e => setShippingState(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input placeholder="Postcode" className="h-10 rounded-xl" value={shippingPostcode} onChange={e => setShippingPostcode(e.target.value)} />
                  <Input placeholder="Country" className="h-10 rounded-xl" value={shippingCountry} onChange={e => setShippingCountry(e.target.value)} />
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {activeTab === "general" && (
        <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
          <div className="max-w-lg space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Title</label>
              <Input placeholder="Invoice title" className="h-10 rounded-xl" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Notes</label>
              <textarea placeholder="Internal notes..." rows={3} className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </div>
        </Card>
      )}

      {activeTab === "payment" && (
        <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
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
      )}

      {activeTab === "additional" && (
        <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
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
      )}
    </div>
  )
}
