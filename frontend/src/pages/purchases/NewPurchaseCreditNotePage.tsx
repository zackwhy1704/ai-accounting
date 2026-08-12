import { useState, useEffect, useRef } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { useContacts, useAccounts, useBills, useCreatePurchaseCreditNote, useTaxRates } from "../../lib/hooks"
import { getContactPrefs, saveContactPref } from "../../lib/contact-prefs"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"
import { SearchableSelect } from "../../components/ui/searchable-select"
import { LineItemsEditor, useLineItems } from "../../components/line-items"
import { useToast } from "../../components/ui/toast"

export default function NewVendorCreditPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { toast } = useToast()
  const { data: contacts = [] } = useContacts()
  const { data: accounts = [] } = useAccounts()
  const { data: bills = [] } = useBills()
  const createPCN = useCreatePurchaseCreditNote()
  const { data: taxRates = [] } = useTaxRates()

  const fromBillId = searchParams.get("from_bill") ?? ""
  const fromBillPopulated = useRef(false)

  const [pcnNumber, setPcnNumber] = useState("")
  const [vendorId, setVendorId] = useState("")
  const [linkedBillId, setLinkedBillId] = useState(fromBillId)
  const [reference, setReference] = useState("")
  const [currency, setCurrency] = useState("MYR")
  const [notes, setNotes] = useState("")

  useEffect(() => {
    if (!fromBillId || fromBillPopulated.current || !(bills as any[]).length) return
    const bill = (bills as any[]).find((b: any) => b.id === fromBillId)
    if (bill) {
      setVendorId(String(bill.contact_id))
      fromBillPopulated.current = true
    }
  }, [bills, fromBillId])

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))

  const { lineItems, updateLine, addLine, removeLine, subTotal, totalDiscount, totalTax, total } = useLineItems({
    taxRates,
  })

  const vendors = (contacts as any[]).filter((c: any) => c.type === "supplier" || c.type === "vendor" || c.type === "both")
  const filteredBills = vendorId
    ? (bills as any[]).filter((b: any) => b.contact_id === vendorId && b.status !== "void")
    : (bills as any[]).filter((b: any) => b.status !== "void")

  const handleVendorChange = (v: string) => {
    if (v === "__add_new__") { navigate("/contacts/new"); return }
    setVendorId(v)
    setLinkedBillId("")
    const prefs = getContactPrefs(v)
    if (prefs.currency) setCurrency(prefs.currency)
  }

  const isFormValid = !!vendorId && lineItems.some(l => l.description.trim() !== "") && lineItems.every(l => l.account_id)

  const handleSave = () => {
    if (!isFormValid) { toast("Please select a supplier and add at least one line item", "warning"); return }
    createPCN.mutate(
      {
        contact_id: vendorId,
        pcn_number: pcnNumber || undefined,
        bill_id: linkedBillId || undefined,
        issue_date: new Date(date).toISOString(),
        reference: reference || null,
        currency,
        notes: notes || null,
        line_items: lineItems.map((l, i) => ({
          product_id: l.product_id || undefined,
          description: l.description,
          line_type: l.line_type,
          account_id: l.account_id || undefined,
          quantity: l.quantity,
          unit_price: l.unit_price,
          discount: l.discount,
          discount_mode: l.discount_mode,
          tax_rate: l.tax_rate,
          tax_code_id: l.tax_code_id || undefined,
          amount: l.amount,
          sort_order: i,
        })),
      } as any,
      {
        onSuccess: () => { toast("Purchase credit note created", "success"); navigate("/purchases/credit-notes") },
        onError: (err: any) => toast(err?.response?.data?.detail ?? "Failed to save credit note", "warning"),
      }
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Purchases › Credit Notes</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">New Purchase Credit Note</div>
        <div className="mt-1 max-w-2xl text-sm text-muted-foreground">Record a credit note received from a supplier for returns or overbilled amounts.</div>
      </div>

      <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Credit Note #</label>
              <Input
                value={pcnNumber}
                onChange={e => setPcnNumber(e.target.value)}
                placeholder="Auto-generated (PCN-00001)"
                className="mt-1.5 h-10 rounded-xl"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Supplier *</label>
              <SearchableSelect
                value={vendorId}
                onChange={handleVendorChange}
                placeholder="Search or select supplier"
                options={vendors.map((c: any) => ({ value: c.id, label: c.name, hint: (c as any).email ?? "" }))}
                footerAction={{ label: "+ Add New Supplier", onClick: () => navigate("/contacts/new") }}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Linked Bill (optional)</label>
              <Select value={linkedBillId} onValueChange={v => setLinkedBillId(v === "__none__" ? "" : v)}>
                <SelectTrigger className="mt-1.5 h-10 rounded-xl">
                  <SelectValue placeholder="Select bill (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No linked bill</SelectItem>
                  {filteredBills.map((b: any) => (
                    <SelectItem key={b.id} value={b.id}>{b.bill_number}</SelectItem>
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
                placeholder="e.g. Supplier CN ref"
                className="mt-1.5 h-10 rounded-xl"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Currency</label>
              <Select value={currency} onValueChange={v => { setCurrency(v); if (vendorId) saveContactPref(vendorId, "currency", v) }}>
                <SelectTrigger className="mt-1.5 h-10 rounded-xl"><SelectValue /></SelectTrigger>
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

          <LineItemsEditor
            items={lineItems}
            updateLine={updateLine}
            addLine={addLine}
            removeLine={removeLine}
            accounts={accounts as any}
            taxRates={taxRates as any}
            currency="#"
            quantityHeading="Quantity"
            descriptionHeadClassName="min-w-[200px]"
            discountHeadClassName="w-[80px]"
            accountTriggerClassName="h-9 rounded-lg border-0 bg-transparent shadow-none text-xs"
            servicesQtyStyle="span"
            taxCodeCellClassName="w-[160px]"
            taxRateCellClassName="w-[80px]"
            controlsClassName="mt-3 flex flex-wrap items-center gap-3"
            discountToggleTitle
          />

          <div className="flex justify-end">
            <div className="w-full max-w-sm flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Sub Total</span>
                <span className="text-foreground">{currency} {subTotal.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Discount</span>
                <span className="text-foreground">- {currency} {totalDiscount.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Tax</span>
                <span className="text-foreground">{currency} {totalTax.toFixed(2)}</span>
              </div>
              <div className="border-t border-border pt-2 flex items-center justify-between text-sm font-semibold">
                <span className="text-foreground">TOTAL</span>
                <span className="text-foreground">{currency} {total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Internal notes..."
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-end">
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" onClick={() => navigate("/purchases/credit-notes")}>Cancel</Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={createPCN.isPending || !isFormValid}
            className="h-9 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 text-xs font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {createPCN.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : "Save"}
          </Button>
        </div>
      </div>
    </div>
  )
}
