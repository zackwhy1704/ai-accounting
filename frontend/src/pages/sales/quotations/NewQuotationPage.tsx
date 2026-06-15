import { useState, useRef, useMemo } from "react"
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
import { SearchableSelect } from "../../../components/ui/searchable-select"
import { LineItemsEditor, useLineItems } from "../../../components/line-items"

export default function NewQuotationPage() {
  const navigate = useNavigate()
  const { t } = useTheme()
  const { data: contacts = [] } = useContacts()
  const { data: accounts = [] } = useAccounts()
  const { data: taxRates = [] } = useTaxRates()
  const createQuotation = useCreateQuotation()

  const [contactId, setContactId] = useState("")
  const [quotationNumber, setQuotationNumber] = useState("")
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [expiryDate, setExpiryDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 30)
    return d.toISOString().slice(0, 10)
  })
  const [reference, setReference] = useState("")
  const [currency, setCurrency] = useState("MYR")
  const [paymentTerms, setPaymentTerms] = useState("net30")
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
  }

  const { data: products = [] } = useQuery<{ id: string; name: string; unit_price: number; account_id: string | null }[]>({
    queryKey: ["products"],
    queryFn: () => api.get("/products").then(r => r.data),
    staleTime: 5 * 60_000,
  })

  const [notes, setNotes] = useState("")
  const [paymentInstructions, setPaymentInstructions] = useState("")
  const [footerNote, setFooterNote] = useState("")
  const [terms, setTerms] = useState("")

  const activeTaxRates = useMemo(() => taxRates.filter(tr => tr.is_active), [taxRates])

  const { lineItems, setLineItems, updateLine, addLine, removeLine, subTotal, totalDiscount, totalTax, total } = useLineItems({
    servicesUsesUnitPriceOnly: true,
    taxRates: activeTaxRates,
    resetTaxRateWhenNoMatch: true,
  })

  const linesValid = lineItems.length > 0 && lineItems.every(li => li.account_id)

  const handleSave = async () => {
    if (!contactId) return
    try {
      await createQuotation.mutateAsync({
        contact_id: contactId,
        quotation_number: quotationNumber || undefined,
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
        line_items: lineItems.map(li => {
          const qty = li.line_type === "services" ? 1 : li.quantity
          return {
            line_type: li.line_type,
            description: li.description,
            quantity: qty,
            unit_price: li.unit_price,
            tax_rate: li.tax_rate,
            tax_code_id: li.tax_code_id || undefined,
            discount: li.discount,
            discount_mode: li.discount_mode,
            account_id: li.account_id || undefined,
          }
        }),
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
            <SearchableSelect
              value={contactId}
              onChange={handleContactSelect}
              placeholder="Search or select customer"
              options={contacts
                .filter(c => c.type === "customer" || c.type === "both")
                .map(c => ({ value: c.id, label: c.name, hint: c.email ?? "" }))}
              footerAction={{ label: "+ Add New Customer", onClick: () => navigate("/contacts/new") }}
            />
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

        <div className="mt-4 flex flex-wrap items-end gap-4">
          <div className="w-48">
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Quotation Number</label>
            <Input
              value={quotationNumber}
              onChange={e => setQuotationNumber(e.target.value)}
              placeholder="Auto-generated"
              className="h-10 rounded-xl"
            />
          </div>
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
        </div>

        <LineItemsEditor
          items={lineItems}
          updateLine={updateLine}
          addLine={addLine}
          removeLine={removeLine}
          onAddProductLine={line => setLineItems(prev => [...prev, line])}
          accounts={accounts as any}
          taxRates={activeTaxRates as any}
          currency={currency}
          descriptionHeadClassName="min-w-[200px]"
          accountTriggerClassName="h-9 rounded-lg border-0 bg-transparent shadow-none text-xs"
          taxCodeCellClassName="w-[160px]"
          taxRateCellClassName="w-[80px]"
          products={products}
          showProductSearch
          controlsClassName="mt-3"
          discountToggleTitle
        />

        <div className="mt-6 flex justify-end">
          <div className="w-full max-w-xs space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Sub Total</span>
              <span className="font-medium text-foreground">{currency} {subTotal.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Discount</span>
              <span className="font-medium text-foreground">- {currency} {totalDiscount.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span className="font-medium text-foreground">{currency} {totalTax.toFixed(2)}</span>
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
          disabled={!contactId || createQuotation.isPending || !linesValid}
          className="h-10 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 text-sm font-semibold text-white shadow-sm hover:opacity-95"
        >
          {createQuotation.isPending ? "Saving..." : t("form.save") || "Save"}
        </Button>
      </div>
    </div>
  )
}
