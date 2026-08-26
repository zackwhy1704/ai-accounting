import { useEffect, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useContacts, useContactSearch, useAccounts, useCreateInvoice, useInvoice, useTaxRates, useProductSearch } from "../../../lib/hooks"
import { useTheme } from "../../../lib/theme"
import { getContactPrefs } from "../../../lib/contact-prefs"
import { Card } from "../../../components/ui/card"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select"
import { SearchableSelect } from "../../../components/ui/searchable-select"
import { LineItemsEditor, useLineItems } from "../../../components/line-items"
import { useQuery } from "@tanstack/react-query"
import api from "../../../lib/api"

export default function NewInvoicePage() {
  const navigate = useNavigate()
  const { t } = useTheme()
  const [searchParams] = useSearchParams()
  const copyFromId = searchParams.get("copy") ?? undefined
  const { data: sourceInvoice } = useInvoice(copyFromId)
  const populatedCopy = useRef(false)
  const { data: contacts = [] } = useContacts()
  const [contactQuery, setContactQuery] = useState("")
  const { data: searchedContacts = [] } = useContactSearch(contactQuery)
  const { data: accounts = [] } = useAccounts()
  const createInvoice = useCreateInvoice()
  const { data: taxRates = [] } = useTaxRates()
  const [productQuery, setProductQuery] = useState("")
  const { data: searchedProducts = [] } = useProductSearch(productQuery)
  const productOptions = (searchedProducts as any[]).map(p => ({ id: p.id, name: p.name, unit_price: p.unit_price, account_id: p.income_account_id ?? null }))

  const [invoiceNumber, setInvoiceNumber] = useState("")
  const [contactId, setContactId] = useState("")
  const [terms, setTerms] = useState("cbd")
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [customerPo, setCustomerPo] = useState("")
  const isFutureDated = invoiceDate > new Date().toISOString().slice(0, 10)

  const [billingLine1, setBillingLine1] = useState("")
  const [billingLine2, setBillingLine2] = useState("")
  const [billingCity, setBillingCity] = useState("")
  const [billingState, setBillingState] = useState("")
  const [billingPostcode, setBillingPostcode] = useState("")
  const [billingCountry, setBillingCountry] = useState("")

  const handleContactChange = (id: string) => {
    if (id === "__add_new__") { navigate("/contacts/new"); return }
    setContactId(id)
    const contact = ([...contacts, ...searchedContacts] as any[]).find((c: any) => c.id === id) as any
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

  const [currency, setCurrency] = useState("MYR")
  const [journalMemo, setJournalMemo] = useState("")
  const [projectId, setProjectId] = useState("")
  const [departmentId, setDepartmentId] = useState("")

  const { data: projects = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["dimensions", "projects"],
    queryFn: () => api.get("/dimensions/projects").then(r => r.data),
  })
  const { data: departments = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["dimensions", "departments"],
    queryFn: () => api.get("/dimensions/departments").then(r => r.data),
  })

  // Product picked from the quick-add: apply the contact's tier price when one exists
  const addProductLine = async (line: any) => {
    let resolved = line
    if (line.product_id && contactId) {
      try {
        const r = await api.get("/pricing/resolve", { params: { product_id: line.product_id, contact_id: contactId } })
        if (r.data?.source === "price_level") {
          resolved = { ...line, unit_price: r.data.unit_price, amount: r.data.unit_price * (line.quantity || 1) }
        }
      } catch { /* fall back to the standard price */ }
    }
    setLineItems(prev => [...prev, resolved])
  }

  const { lineItems, setLineItems, updateLine, addLine, removeLine, subTotal, totalDiscount: totalLineDiscount, totalTax, total } = useLineItems({
    taxRates,
  })

  // Duplicate flow: ?copy=<invoice_id> pre-fills this draft from the source
  // invoice's header + line items (new number/date, status stays draft).
  useEffect(() => {
    if (!sourceInvoice || populatedCopy.current) return
    populatedCopy.current = true
    setContactId(String(sourceInvoice.contact_id ?? ""))
    setTerms(sourceInvoice.terms ?? "cbd")
    setCustomerPo(sourceInvoice.customer_po ?? "")
    setCurrency(sourceInvoice.currency ?? "MYR")
    setJournalMemo(sourceInvoice.journal_memo ?? "")
    setBillingLine1(sourceInvoice.billing_address_line1 ?? "")
    setBillingLine2(sourceInvoice.billing_address_line2 ?? "")
    setBillingCity(sourceInvoice.billing_city ?? "")
    setBillingState(sourceInvoice.billing_state ?? "")
    setBillingPostcode(sourceInvoice.billing_postcode ?? "")
    setBillingCountry(sourceInvoice.billing_country ?? "")
    if (sourceInvoice.line_items?.length) {
      setLineItems(sourceInvoice.line_items.map((l: any) => ({
        description: l.description ?? "",
        account_id: l.account_id ? String(l.account_id) : "",
        quantity: l.quantity ?? 1,
        unit_price: l.unit_price ?? 0,
        amount: l.amount ?? 0,
        discount: l.discount ?? 0,
        discount_mode: (l.discount_mode === "amount" ? "amount" : "percent") as "percent" | "amount",
        tax_rate: l.tax_rate ?? 0,
        line_type: l.line_type ?? "goods",
        tax_code_id: l.tax_code_id ? String(l.tax_code_id) : "",
      })))
    }
  }, [sourceInvoice, setLineItems])

  const appliedToDate = 0
  const balanceDue = total - appliedToDate

  const linesValid = lineItems.length > 0 && lineItems.every(li => li.account_id)

  const handleSave = async () => {
    try {
      await createInvoice.mutateAsync({
        contact_id: contactId,
        invoice_number: invoiceNumber || undefined,
        issue_date: invoiceDate,
        due_date: invoiceDate,
        currency,
        notes: journalMemo || null,
        project_id: projectId || null,
        department_id: departmentId || null,
        terms: terms || null,
        billing_address_line1: billingLine1 || null,
        billing_address_line2: billingLine2 || null,
        billing_city: billingCity || null,
        billing_state: billingState || null,
        billing_postcode: billingPostcode || null,
        billing_country: billingCountry || null,
        line_items: lineItems.map(li => ({
          product_id: li.product_id || undefined,
          description: li.description,
          account_id: li.account_id || undefined,
          quantity: li.quantity,
          unit_price: li.unit_price,
          tax_rate: li.tax_rate,
          tax_code_id: li.tax_code_id || undefined,
          line_type: li.line_type,
          discount: li.discount,
          discount_mode: li.discount_mode,
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
              onQueryChange={setContactQuery}
              options={(() => {
                // Server-searched results, plus the currently-selected contact so
                // it stays visible even when not in the latest search page.
                const merged = new Map<string, any>()
                for (const c of searchedContacts as any[]) merged.set(c.id, c)
                for (const c of contacts as any[]) if (c.id === contactId) merged.set(c.id, c)
                return Array.from(merged.values())
                  .filter((c: any) => c.type === "customer" || c.type === "both")
                  .map((c: any) => ({ value: c.id, label: c.name, hint: c.email ?? "" }))
              })()}
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

        {currency !== "MYR" && (
          <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-700">
            ⚠ This invoice is in {currency}. Foreign-currency GL conversion and FX gain/loss are not yet enabled — amounts post to the ledger at face value. Use your base currency (MYR) for accurate reporting until multi-currency is released.
          </div>
        )}

        {isFutureDated && (
          <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-700">
            ⚠ This invoice is dated in the future ({invoiceDate}). It won't appear in reports covering today's date until then, and it can't be submitted to MyInvois until its date arrives. Double-check the date if this wasn't intentional.
          </div>
        )}

        <LineItemsEditor
          items={lineItems}
          updateLine={updateLine}
          addLine={addLine}
          removeLine={removeLine}
          accounts={accounts as any}
          taxRates={taxRates as any}
          currency={currency}
          quantityHeading="Quantity"
          descriptionHeadClassName="min-w-[200px]"
          discountHeadClassName="w-[80px]"
          accountTriggerClassName="h-9 rounded-lg border-0 bg-transparent shadow-none text-xs"
          servicesQtyStyle="span"
          taxCodeCellClassName="w-[160px]"
          taxRateCellClassName="w-[80px]"
          controlsClassName="mt-3 flex flex-wrap items-center gap-3"
          discountToggleTitle
          products={productOptions}
          showProductSearch
          onProductSearch={setProductQuery}
          onAddProductLine={line => { void addProductLine(line) }}
        />

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
          {(projects.length > 0 || departments.length > 0) && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {projects.length > 0 && (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Project</label>
                  <select value={projectId} onChange={e => setProjectId(e.target.value)} className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm">
                    <option value="">No project</option>
                    {projects.map(pj => <option key={pj.id} value={pj.id}>{pj.name}</option>)}
                  </select>
                </div>
              )}
              {departments.length > 0 && (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Department</label>
                  <select value={departmentId} onChange={e => setDepartmentId(e.target.value)} className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm">
                    <option value="">No department</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}
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
          disabled={createInvoice.isPending || !contactId || !lineItems.some(li => li.description.trim()) || !linesValid}
          className="h-10 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 text-sm font-semibold text-white shadow-sm hover:opacity-95"
        >
          {createInvoice.isPending ? "Saving..." : t("form.save") || "Save"}
        </Button>
      </div>
    </div>
  )
}
