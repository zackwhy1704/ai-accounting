import { useState, useEffect, useRef, useMemo } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { useContacts, useAccounts, useCreateBill, useTaxRates, usePurchaseOrder } from "../../lib/hooks"
import { getContactPrefs, saveContactPref } from "../../lib/contact-prefs"
import { useQuery } from "@tanstack/react-query"
import api from "../../lib/api"
import { useToast } from "../../components/ui/toast"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"
import { SearchableSelect } from "../../components/ui/searchable-select"
import { LineItemsEditor, useLineItems } from "../../components/line-items"

export default function NewBillPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { toast } = useToast()
  const { data: contacts = [] } = useContacts()
  const { data: accounts = [] } = useAccounts()
  const { data: taxRates = [] } = useTaxRates()
  const createBill = useCreateBill()

  const fromPoId = searchParams.get("from_po")
  const { data: sourcePO } = usePurchaseOrder(fromPoId ?? undefined)

  const [contactId, setContactId] = useState("")
  const [billNumber, setBillNumber] = useState("")
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [dueDate, setDueDate] = useState("")
  const [currency, setCurrency] = useState("MYR")
  const [notes, setNotes] = useState("")

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

  const activeTaxRates = useMemo(() => taxRates.filter((tr: any) => tr.is_active), [taxRates])

  const { lineItems, setLineItems, updateLine, addLine, removeLine, subTotal, totalDiscount, totalTax, total } = useLineItems({
    servicesUsesUnitPriceOnly: true,
    taxRates: activeTaxRates,
    resetTaxRateWhenNoMatch: true,
  })
  const populated = useRef(false)

  const { data: products = [] } = useQuery<{ id: string; name: string; unit_price: number; account_id: string | null }[]>({
    queryKey: ["products"],
    queryFn: () => api.get("/products").then(r => r.data),
    staleTime: 5 * 60_000,
  })

  useEffect(() => {
    if (!sourcePO || populated.current) return
    populated.current = true
    const poContactId = String(sourcePO.contact_id ?? "")
    setContactId(poContactId)
    setCurrency(sourcePO.currency ?? "MYR")
    setNotes(sourcePO.notes ?? "")
    // Auto-fill billing/shipping address from contact
    const contact = contacts.find((c: any) => c.id === poContactId) as any
    if (contact) {
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
    }
    const prefs = getContactPrefs(poContactId)
    if (prefs.currency) setCurrency(prefs.currency)
    if (sourcePO.line_items?.length) {
      setLineItems(sourcePO.line_items.map((li: any) => ({
        line_type: "goods" as const,
        description: li.description ?? "",
        account_id: li.account_id ? String(li.account_id) : "",
        quantity: li.quantity ?? 1,
        unit_price: li.unit_price ?? 0,
        discount: li.discount ?? 0,
        discount_mode: (li.discount_mode ?? "percent") as "percent" | "amount",
        tax_rate: li.tax_rate ?? 0,
        tax_code_id: li.tax_code_id ? String(li.tax_code_id) : "",
        amount: li.amount ?? 0,
      })))
    }
  }, [sourcePO, contacts])

  const handleContactChange = (v: string) => {
    setContactId(v)
    const contact = contacts.find((c: any) => c.id === v) as any
    if (contact) {
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
    }
    const prefs = getContactPrefs(v)
    if (prefs.currency) setCurrency(prefs.currency)
  }

  const suppliers = useMemo(
    () => contacts.filter((c: any) => c.type === "vendor" || c.type === "supplier" || c.type === "both"),
    [contacts]
  )

  const handleSave = async () => {
    if (!contactId) { toast("Please select a supplier", "warning"); return }
    if (!issueDate) { toast("Please enter a bill date", "warning"); return }
    try {
      await createBill.mutateAsync({
        contact_id: contactId,
        bill_number: billNumber || undefined,
        issue_date: new Date(issueDate).toISOString(),
        due_date: dueDate ? new Date(dueDate).toISOString() : new Date(issueDate).toISOString(),
        currency,
        notes: notes || null,
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
        line_items: lineItems.map((item, i) => {
          const qty = item.line_type === "services" ? 1 : item.quantity
          return {
            description: item.description,
            account_id: item.account_id || undefined,
            quantity: qty,
            unit_price: item.unit_price,
            tax_rate: item.tax_rate,
            tax_code_id: item.tax_code_id || undefined,
            discount: item.discount,
            discount_mode: item.discount_mode,
            amount: item.amount,
            sort_order: i,
          }
        }),
      } as any)
      toast("Bill created", "success")
      navigate("/purchases/bills")
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      toast(typeof detail === "string" ? detail : "Failed to create bill", "warning")
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="text-xs text-muted-foreground">Purchases &rsaquo; Bills</div>
        <div className="text-2xl font-semibold tracking-tight text-foreground">
          {fromPoId ? `New Bill (from PO ${sourcePO?.po_number ?? "..."})` : "New Bill"}
        </div>
      </div>

      <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Supplier *</label>
            <SearchableSelect
              value={contactId}
              onChange={handleContactChange}
              placeholder="Search or select supplier"
              options={suppliers.map((c: any) => ({ value: c.id, label: c.name, hint: c.email ?? "" }))}
              footerAction={{ label: "+ Add New Supplier", onClick: () => navigate("/contacts/new") }}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Bill Date *</label>
            <Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className="h-10 rounded-xl" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Due Date</label>
            <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="h-10 rounded-xl" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Bill Number</label>
            <Input value={billNumber} onChange={e => setBillNumber(e.target.value)} placeholder="Auto-generated (BILL-0001)" className="h-10 rounded-xl" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Currency</label>
            <Select value={currency} onValueChange={v => { setCurrency(v); if (contactId) saveContactPref(contactId, "currency", v) }}>
              <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Select currency" /></SelectTrigger>
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

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border p-4">
            <div className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Billing Address</div>
            <div className="space-y-2">
              <Input value={billingLine1} onChange={e => setBillingLine1(e.target.value)} placeholder="Address Line 1" className="h-9 rounded-lg text-sm" />
              <Input value={billingLine2} onChange={e => setBillingLine2(e.target.value)} placeholder="Address Line 2" className="h-9 rounded-lg text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <Input value={billingCity} onChange={e => setBillingCity(e.target.value)} placeholder="City" className="h-9 rounded-lg text-sm" />
                <Input value={billingState} onChange={e => setBillingState(e.target.value)} placeholder="State" className="h-9 rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input value={billingPostcode} onChange={e => setBillingPostcode(e.target.value)} placeholder="Postcode" className="h-9 rounded-lg text-sm" />
                <Input value={billingCountry} onChange={e => setBillingCountry(e.target.value)} placeholder="Country" className="h-9 rounded-lg text-sm" />
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border p-4">
            <div className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Shipping Address</div>
            <div className="space-y-2">
              <Input value={shippingLine1} onChange={e => setShippingLine1(e.target.value)} placeholder="Address Line 1" className="h-9 rounded-lg text-sm" />
              <Input value={shippingLine2} onChange={e => setShippingLine2(e.target.value)} placeholder="Address Line 2" className="h-9 rounded-lg text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <Input value={shippingCity} onChange={e => setShippingCity(e.target.value)} placeholder="City" className="h-9 rounded-lg text-sm" />
                <Input value={shippingState} onChange={e => setShippingState(e.target.value)} placeholder="State" className="h-9 rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input value={shippingPostcode} onChange={e => setShippingPostcode(e.target.value)} placeholder="Postcode" className="h-9 rounded-lg text-sm" />
                <Input value={shippingCountry} onChange={e => setShippingCountry(e.target.value)} placeholder="Country" className="h-9 rounded-lg text-sm" />
              </div>
            </div>
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
          typeTriggerClassName="text-xs"
          products={products}
          showProductSearch
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
              <div className="flex items-center justify-between text-base font-bold">
                <span className="text-foreground">Total</span>
                <span className="text-foreground">{currency} {total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Internal notes..." className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button type="button" variant="secondary" className="h-9 rounded-xl px-3 text-xs font-semibold" onClick={() => navigate("/purchases/bills")}>Cancel</Button>
          <Button type="button" onClick={handleSave} disabled={createBill.isPending || !contactId || !issueDate || !lineItems.some(li => li.description.trim())} className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white hover:opacity-95">
            {createBill.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : "Save as Draft"}
          </Button>
        </div>
      </Card>
    </div>
  )
}
