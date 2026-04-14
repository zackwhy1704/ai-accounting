import { useState, useRef, useEffect, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { Plus, Trash2 } from "lucide-react"
import { useContacts, useAccounts, useCreateQuotation, useTaxRates } from "../../../lib/hooks"
import { getContactPrefs } from "../../../lib/contact-prefs"
import { useQuery } from "@tanstack/react-query"
import api from "../../../lib/api"
import { useTheme } from "../../../lib/theme"
import { Card } from "../../../components/ui/card"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table"

interface LineItem {
  line_type: "goods" | "services"
  description: string
  account_id: string
  quantity: number
  unit_price: number
  amount: number
  discount: number
  tax_rate: number
  tax_code_id: string
}

function emptyLine(): LineItem {
  return { line_type: "goods", description: "", account_id: "", quantity: 1, unit_price: 0, amount: 0, discount: 0, tax_rate: 0, tax_code_id: "" }
}

export default function NewQuotationPage() {
  const navigate = useNavigate()
  const { t } = useTheme()
  const { data: contacts = [] } = useContacts()
  const { data: accounts = [] } = useAccounts()
  const { data: taxRates = [] } = useTaxRates()
  const createQuotation = useCreateQuotation()

  const [contactId, setContactId] = useState("")
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [expiryDate, setExpiryDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 30)
    return d.toISOString().slice(0, 10)
  })
  const [reference, setReference] = useState("")
  const [currency, setCurrency] = useState("MYR")
  const [taxInclusive, setTaxInclusive] = useState(false)
  const [paymentTerms, setPaymentTerms] = useState("net30")
  const [productSearch, setProductSearch] = useState("")
  const [productDropdownOpen, setProductDropdownOpen] = useState(false)
  const productInputRef = useRef<HTMLInputElement>(null)
  const attachFileRef = useRef<HTMLInputElement>(null)
  const [attachments, setAttachments] = useState<File[]>([])

  const [billingLine1, setBillingLine1] = useState("")
  const [billingLine2, setBillingLine2] = useState("")
  const [billingCity, setBillingCity] = useState("")
  const [billingState, setBillingState] = useState("")
  const [billingPostcode, setBillingPostcode] = useState("")
  const [billingCountry, setBillingCountry] = useState("")
  const selectedContact = useMemo(() => contacts.find((c: any) => c.id === contactId), [contacts, contactId])

  const handleContactSelect = (id: string) => {
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
      if (contact.default_payment_terms) setPaymentTerms(contact.default_payment_terms)
    }
    const prefs = getContactPrefs(id)
    if (prefs.currency) setCurrency(prefs.currency)
    if (prefs.tax_inclusive !== undefined) setTaxInclusive(prefs.tax_inclusive)
  }

  useEffect(() => {
    if (!productDropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (productInputRef.current && !productInputRef.current.closest(".relative")?.contains(e.target as Node)) {
        setProductDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [productDropdownOpen])

  const { data: products = [] } = useQuery<{ id: string; name: string; unit_price: number; account_id: string | null }[]>({
    queryKey: ["products"],
    queryFn: () => api.get("/products").then(r => r.data),
    staleTime: 5 * 60_000,
  })

  const [notes, setNotes] = useState("")
  const [paymentInstructions, setPaymentInstructions] = useState("")
  const [footerNote, setFooterNote] = useState("")
  const [terms, setTerms] = useState("")
  const [lineItems, setLineItems] = useState<LineItem[]>([emptyLine()])

  const activeTaxRates = useMemo(() => taxRates.filter(tr => tr.is_active), [taxRates])

  const updateLineItem = (index: number, field: keyof LineItem, value: string | number) => {
    setLineItems(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      if (field === "tax_code_id") {
        const tc = activeTaxRates.find(tr => tr.id === value)
        if (tc) updated[index].tax_rate = tc.rate
        else updated[index].tax_rate = 0
      }
      if (field === "line_type" && value === "services") {
        updated[index].quantity = 1
      }
      const item = updated[index]
      const lineTotal = item.line_type === "services" ? item.unit_price : item.quantity * item.unit_price
      const afterDiscount = lineTotal - (lineTotal * item.discount) / 100
      const tax = taxInclusive ? 0 : (afterDiscount * item.tax_rate) / 100
      updated[index].amount = afterDiscount + tax
      return updated
    })
  }

  const addLineItem = () => setLineItems(prev => [...prev, emptyLine()])

  const removeLineItem = (index: number) => {
    setLineItems(prev => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))
  }

  const subTotal = lineItems.reduce((sum, item) => {
    return sum + (item.line_type === "services" ? item.unit_price : item.quantity * item.unit_price)
  }, 0)
  const totalDiscount = lineItems.reduce((sum, item) => {
    const lineTotal = item.line_type === "services" ? item.unit_price : item.quantity * item.unit_price
    return sum + (lineTotal * item.discount) / 100
  }, 0)
  const totalTax = taxInclusive ? 0 : lineItems.reduce((sum, item) => {
    const lineTotal = item.line_type === "services" ? item.unit_price : item.quantity * item.unit_price
    const afterLineDiscount = lineTotal - (lineTotal * item.discount) / 100
    return sum + (afterLineDiscount * item.tax_rate) / 100
  }, 0)
  const total = subTotal - totalDiscount + totalTax

  const handleSave = async () => {
    if (!contactId) return
    try {
      await createQuotation.mutateAsync({
        contact_id: contactId,
        issue_date: issueDate,
        expiry_date: expiryDate,
        reference: reference || undefined,
        currency,
        notes: notes || undefined,
        terms: [paymentInstructions, footerNote, terms].filter(Boolean).join("\n\n") || undefined,
        billing_address_line1: billingLine1 || null,
        billing_address_line2: billingLine2 || null,
        billing_city: billingCity || null,
        billing_state: billingState || null,
        billing_postcode: billingPostcode || null,
        billing_country: billingCountry || null,
        line_items: lineItems.map(li => ({
          line_type: li.line_type,
          description: li.description,
          quantity: li.line_type === "services" ? 1 : li.quantity,
          unit_price: li.unit_price,
          tax_rate: li.tax_rate,
          tax_code_id: li.tax_code_id || undefined,
          discount: li.discount,
          account_id: li.account_id || undefined,
        })),
      })
      navigate("/sales/quotations")
    } catch {
      // error handled by mutation
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="text-xs text-muted-foreground">{t("quotations.category")}</div>
        <div className="text-2xl font-semibold tracking-tight text-foreground">{t("quotations.new")}</div>
      </div>

      {/* Items Card */}
      <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{t("quotations.customer")}</label>
            <Select value={contactId} onValueChange={handleContactSelect}>
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue placeholder="Select customer" />
              </SelectTrigger>
              <SelectContent>
                {contacts
                  .filter(c => c.type === "customer" || c.type === "both")
                  .map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                <SelectItem value="__add_new__" className="text-primary font-medium">+ Add New Customer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{t("common.date")}</label>
            <Input
              type="date"
              value={issueDate}
              onChange={e => setIssueDate(e.target.value)}
              className="h-10 rounded-xl"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Expiry Date</label>
            <Input
              type="date"
              value={expiryDate}
              onChange={e => setExpiryDate(e.target.value)}
              className="h-10 rounded-xl"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Reference</label>
            <Input
              value={reference}
              onChange={e => setReference(e.target.value)}
              placeholder="Reference #"
              className="h-10 rounded-xl"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div className="w-36">
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Currency</label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Select currency" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MYR">MYR</SelectItem>
                <SelectItem value="SGD">SGD</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
                <SelectItem value="GBP">GBP</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 pt-5">
            <button
              type="button"
              onClick={() => setTaxInclusive(!taxInclusive)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                taxInclusive ? "bg-blue-500" : "bg-gray-300"
              }`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                taxInclusive ? "translate-x-4" : "translate-x-0.5"
              }`} />
            </button>
            <span className="text-xs font-medium text-muted-foreground">
              {taxInclusive ? "Tax Inclusive" : "Tax Exclusive"}
            </span>
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
                <TableHead className="w-[80px] text-muted-foreground">Qty</TableHead>
                <TableHead className="w-[110px] text-muted-foreground">Unit Price</TableHead>
                <TableHead className="w-[80px] text-muted-foreground">Disc %</TableHead>
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
                      <SelectTrigger className="h-9 rounded-lg border-0 bg-transparent shadow-none text-xs">
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
                    <Select value={item.account_id} onValueChange={v => updateLineItem(idx, "account_id", v)}>
                      <SelectTrigger className="h-9 rounded-lg border-0 bg-transparent shadow-none">
                        <SelectValue placeholder="Account" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map(a => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.code} – {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  {item.line_type === "services" ? (
                    <TableCell className="text-center text-xs text-muted-foreground">—</TableCell>
                  ) : (
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        value={item.quantity}
                        onChange={e => updateLineItem(idx, "quantity", Number(e.target.value))}
                        className="h-9 rounded-lg px-2 text-sm focus-visible:ring-1"
                      />
                    </TableCell>
                  )}
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
                    />
                  </TableCell>
                  <TableCell className="w-[160px]">
                    <Select value={item.tax_code_id} onValueChange={v => updateLineItem(idx, "tax_code_id", v === "__none__" ? "" : v)}>
                      <SelectTrigger className="h-9 rounded-lg border-0 bg-transparent shadow-none focus:ring-1 text-xs">
                        <SelectValue placeholder="Tax Code" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No Tax</SelectItem>
                        {activeTaxRates.map(tr => (
                          <SelectItem key={tr.id} value={tr.id}>
                            {tr.code} ({tr.rate}%)
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
                    <button type="button" onClick={() => removeLineItem(idx)} className="text-muted-foreground hover:text-rose-500">
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

          <div className="relative">
            <Input
              ref={productInputRef}
              value={productSearch}
              onChange={e => { setProductSearch(e.target.value); setProductDropdownOpen(true) }}
              onFocus={() => setProductDropdownOpen(true)}
              placeholder="Add Product..."
              className="h-9 w-48 rounded-xl pl-3 pr-3 text-xs"
            />
            {productDropdownOpen && (
              <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-xl border border-border bg-card shadow-lg py-1">
                {products
                  .filter(p => !productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase()))
                  .slice(0, 10)
                  .map(p => (
                    <button
                      key={p.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-xs hover:bg-muted/60 flex items-center justify-between"
                      onMouseDown={e => {
                        e.preventDefault()
                        setLineItems(prev => [...prev, {
                          line_type: "goods",
                          description: p.name,
                          account_id: p.account_id ?? "",
                          quantity: 1,
                          unit_price: p.unit_price,
                          amount: p.unit_price,
                          discount: 0,
                          tax_rate: 0,
                          tax_code_id: "",
                        }])
                        setProductSearch("")
                        setProductDropdownOpen(false)
                      }}
                    >
                      <span className="truncate">{p.name}</span>
                      <span className="ml-2 shrink-0 text-muted-foreground">{p.unit_price.toFixed(2)}</span>
                    </button>
                  ))}
                {products.filter(p => !productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase())).length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">No products found</div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <div className="w-full max-w-xs space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Sub Total</span>
              <span className="font-medium text-foreground">{currency} {subTotal.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span className="font-medium text-foreground">{currency} {totalTax.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Discount</span>
              <span className="font-medium text-foreground">{currency} {totalDiscount.toFixed(2)}</span>
            </div>
            <div className="border-t border-border pt-2">
              <div className="flex items-center justify-between text-base font-semibold">
                <span className="text-foreground">TOTAL</span>
                <span className="text-foreground">{currency} {total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Billing Address Card */}
      <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <h3 className="mb-4 text-sm font-semibold text-foreground">Billing Address</h3>
        {selectedContact && (
          <div className="mb-4 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Auto-filled from contact: <span className="font-medium text-foreground">{selectedContact.name}</span>
          </div>
        )}
        <div className="max-w-lg space-y-3">
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
      </Card>

      {/* General Info Card */}
      <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <h3 className="mb-4 text-sm font-semibold text-foreground">General Info</h3>
        <div className="max-w-lg space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal notes..." rows={3}
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
        </div>
      </Card>

      {/* Payment Terms Card */}
      <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <h3 className="mb-4 text-sm font-semibold text-foreground">Payment Terms</h3>
        <div className="max-w-lg space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Payment Terms</label>
            <Select value={paymentTerms} onValueChange={setPaymentTerms}>
              <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
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
            <textarea value={paymentInstructions} onChange={e => setPaymentInstructions(e.target.value)}
              placeholder="Bank details, payment methods..." rows={4}
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
        </div>
      </Card>

      {/* Additional Info Card */}
      <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <h3 className="mb-4 text-sm font-semibold text-foreground">Additional Info</h3>
        <div className="max-w-lg space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Footer Note</label>
            <textarea value={footerNote} onChange={e => setFooterNote(e.target.value)}
              placeholder="Appears at the bottom of the quotation..." rows={3}
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Terms & Conditions</label>
            <textarea value={terms} onChange={e => setTerms(e.target.value)}
              placeholder="Standard terms and conditions..." rows={4}
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
        </div>
      </Card>

      {/* Attachments Card */}
      <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <h3 className="mb-4 text-sm font-semibold text-foreground">Attachments</h3>
        <input ref={attachFileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" className="hidden"
          onChange={e => { if (e.target.files) setAttachments(prev => [...prev, ...Array.from(e.target.files!)]) }} />
        <div
          className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border px-6 py-12 text-center cursor-pointer hover:bg-muted/30 transition-colors"
          onClick={() => attachFileRef.current?.click()}
        >
          <Plus className="h-6 w-6 text-muted-foreground" />
          <div className="mt-4 text-sm font-medium text-foreground">Drop files here or click to upload</div>
          <div className="mt-1 text-xs text-muted-foreground">PDF, JPG, PNG up to 10MB</div>
        </div>
        {attachments.length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {attachments.map((f, i) => (
              <li key={i} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-xs">
                <span className="truncate text-foreground">{f.name}</span>
                <button type="button" onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))} className="ml-3 text-muted-foreground hover:text-rose-500">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Save/Cancel Footer */}
      <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={() => navigate("/sales/quotations")}>Cancel</Button>
        <Button
          type="button"
          onClick={handleSave}
          disabled={!contactId || createQuotation.isPending}
          className="h-10 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 text-sm font-semibold text-white shadow-sm hover:opacity-95"
        >
          {createQuotation.isPending ? "Saving..." : t("form.save") || "Save"}
        </Button>
      </div>
    </div>
  )
}
