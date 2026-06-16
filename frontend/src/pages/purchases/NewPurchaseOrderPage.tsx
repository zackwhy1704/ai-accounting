import { useState, useRef, useEffect, useMemo } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { useContacts, useAccounts, useCreatePurchaseOrder, useTaxRates, usePurchaseOrder, useProductSearch } from "../../lib/hooks"
import { getContactPrefs, saveContactPref } from "../../lib/contact-prefs"
import { useToast } from "../../components/ui/toast"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"
import { SearchableSelect } from "../../components/ui/searchable-select"
import { LineItemsEditor, useLineItems } from "../../components/line-items"

export default function NewPurchaseOrderPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { toast } = useToast()
  const { data: contacts = [] } = useContacts()
  const { data: accounts = [] } = useAccounts()
  const { data: taxRates = [] } = useTaxRates()
  const createPO = useCreatePurchaseOrder()

  const copyId = searchParams.get("copy")
  const { data: copySource } = usePurchaseOrder(copyId ?? undefined)

  const [poNumber, setPoNumber] = useState("")
  const [contactId, setContactId] = useState("")
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [expectedDate, setExpectedDate] = useState("")
  const [currency, setCurrency] = useState("MYR")
  const [deliveryAddress, setDeliveryAddress] = useState("")
  const [notes, setNotes] = useState("")

  const activeTaxRates = useMemo(() => taxRates.filter((tr: any) => tr.is_active), [taxRates])

  const { lineItems, setLineItems, updateLine, addLine, removeLine, subTotal, totalDiscount, totalTax, total } = useLineItems({
    servicesUsesUnitPriceOnly: true,
    taxRates: activeTaxRates,
    resetTaxRateWhenNoMatch: true,
  })
  const populated = useRef(false)

  const [productQuery, setProductQuery] = useState("")
  const { data: searchedProducts = [] } = useProductSearch(productQuery)
  const products = useMemo(
    () => (searchedProducts as any[]).map(p => ({ id: p.id, name: p.name, unit_price: p.unit_price, account_id: p.expense_account_id ?? null })),
    [searchedProducts]
  )

  useEffect(() => {
    if (!copySource || populated.current) return
    populated.current = true
    setContactId(String(copySource.contact_id ?? ""))
    setCurrency(copySource.currency ?? "MYR")
    setDeliveryAddress(copySource.delivery_address ?? "")
    setNotes(copySource.notes ?? "")
    if (copySource.line_items?.length) {
      setLineItems(copySource.line_items.map((li: any) => ({
        line_type: "goods" as const,
        description: li.description ?? "",
        account_id: li.account_id ? String(li.account_id) : "",
        quantity: li.quantity ?? 1,
        unit_price: li.unit_price ?? 0,
        discount: li.discount ?? 0,
        discount_mode: (li.discount_mode === "amount" ? "amount" : "percent") as "percent" | "amount",
        tax_rate: li.tax_rate ?? 0,
        tax_code_id: li.tax_code_id ? String(li.tax_code_id) : "",
        amount: li.amount ?? 0,
      })))
    }
  }, [copySource])

  const suppliers = useMemo(
    () => contacts.filter((c: any) => c.type === "vendor" || c.type === "supplier" || c.type === "both"),
    [contacts]
  )

  const linesValid = lineItems.length > 0 && lineItems.every(li => li.account_id)

  const handleSave = async () => {
    if (!contactId) { toast("Please select a supplier", "warning"); return }
    if (!issueDate) { toast("Please enter a PO date", "warning"); return }
    try {
      await createPO.mutateAsync({
        contact_id: contactId,
        po_number: poNumber || undefined,
        issue_date: new Date(issueDate).toISOString(),
        expected_date: expectedDate ? new Date(expectedDate).toISOString() : null,
        currency,
        delivery_address: deliveryAddress || null,
        notes: notes || null,
        line_items: lineItems.map((item, i) => ({
          description: item.description,
          account_id: item.account_id || undefined,
          quantity: item.line_type === "services" ? 1 : item.quantity,
          unit_price: item.unit_price,
          tax_rate: item.tax_rate,
          tax_code_id: item.tax_code_id || undefined,
          discount: item.discount,
          discount_mode: item.discount_mode,
          sort_order: i,
        })),
      } as any)
      toast("Purchase order created", "success")
      navigate("/purchases/purchase-orders")
    } catch {
      toast("Failed to create purchase order", "warning")
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="text-xs text-muted-foreground">Purchases &rsaquo; Purchase Orders</div>
        <div className="text-2xl font-semibold tracking-tight text-foreground">New Purchase Order</div>
      </div>

      <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Supplier *</label>
            <SearchableSelect
              value={contactId}
              onChange={v => {
                setContactId(v)
                const prefs = getContactPrefs(v)
                if (prefs.currency) setCurrency(prefs.currency)
              }}
              placeholder="Search or select supplier"
              options={suppliers.map((c: any) => ({ value: c.id, label: c.name, hint: c.email ?? "" }))}
              footerAction={{ label: "+ Add New Supplier", onClick: () => navigate("/contacts/new") }}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">PO Date *</label>
            <Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className="h-10 rounded-xl" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Expected Delivery Date</label>
            <Input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} className="h-10 rounded-xl" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">PO #</label>
            <Input value={poNumber} onChange={e => setPoNumber(e.target.value)} placeholder="Auto-generated (PO-0001)" className="h-10 rounded-xl" />
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

        <div className="mt-4">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Delivery Address</label>
          <textarea value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} rows={2} placeholder="Delivery address (optional)" className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
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
          onProductSearch={setProductQuery}
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
          <Button type="button" variant="secondary" className="h-9 rounded-xl px-3 text-xs font-semibold" onClick={() => navigate("/purchases/purchase-orders")}>Cancel</Button>
          <Button type="button" onClick={handleSave} disabled={createPO.isPending || !contactId || !issueDate || !lineItems.some(li => li.description.trim()) || !linesValid} className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white hover:opacity-95">
            {createPO.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : "Save as Draft"}
          </Button>
        </div>
      </Card>
    </div>
  )
}
