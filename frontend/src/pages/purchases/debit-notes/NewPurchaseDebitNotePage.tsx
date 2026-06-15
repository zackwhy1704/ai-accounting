import { useState, useEffect, useRef } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useContacts, useAccounts, useBills, useCreatePurchaseDebitNote, useTaxRates } from "../../../lib/hooks"
import { Card } from "../../../components/ui/card"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select"
import { SearchableSelect } from "../../../components/ui/searchable-select"
import { LineItemsEditor } from "../../../components/line-items/LineItemsEditor"
import { useToast } from "../../../components/ui/toast"
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

export default function NewPurchaseDebitNotePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { toast } = useToast()
  const { data: contacts = [] } = useContacts()
  const { data: accounts = [] } = useAccounts()
  const { data: bills = [] } = useBills()
  const createDebitNote = useCreatePurchaseDebitNote()
  const { data: taxRates = [] } = useTaxRates()

  const fromBillId = searchParams.get("from_bill") ?? ""
  const fromBillPopulated = useRef(false)

  const [debitNoteNumber, setDebitNoteNumber] = useState("")
  const [vendorId, setVendorId] = useState("")
  const [linkedBillId, setLinkedBillId] = useState(fromBillId)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [reference, setReference] = useState("")
  const [lines, setLines] = useState<LineItem[]>([emptyLine()])

  useEffect(() => {
    if (!fromBillId || fromBillPopulated.current || !(bills as any[]).length) return
    const bill = (bills as any[]).find((b: any) => b.id === fromBillId)
    if (bill) {
      setVendorId(String(bill.contact_id))
      fromBillPopulated.current = true
    }
  }, [bills, fromBillId])

  const vendors = (contacts as any[]).filter((c: any) => c.type === "supplier" || c.type === "vendor" || c.type === "both")
  const filteredBills = vendorId
    ? (bills as any[]).filter((b: any) => b.contact_id === vendorId)
    : (bills as any[])

  const handleVendorChange = (v: string) => {
    if (v === "__add_new__") { navigate("/contacts/new"); return }
    setVendorId(v)
    setLinkedBillId("")
  }

  const updateLine = (idx: number, field: keyof LineItem, value: string | number) => {
    setLines(prev => {
      const updated = [...prev]
      const line = { ...updated[idx], [field]: value }
      if (field === "tax_code_id") {
        const tc = (taxRates as any[]).find((t: any) => t.id === value)
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

  const isFormValid = !!vendorId && lines.some(l => l.description.trim() !== "") && lines.every(l => l.account_id)

  const handleSave = () => {
    if (!isFormValid) return
    createDebitNote.mutate(
      {
        contact_id: vendorId,
        debit_note_number: debitNoteNumber || undefined,
        bill_id: linkedBillId || undefined,
        issue_date: date,
        reference,
        notes: null,
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
        onSuccess: () => navigate("/purchases/debit-notes"),
        onError: (err: any) => toast(err?.response?.data?.detail ?? "Failed to save debit note", "warning"),
      }
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Purchases</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">New Debit Note</div>
        <div className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Issue a debit note to a supplier to reduce the amount owed.
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
                placeholder="PDN-000001"
                className="mt-1.5 h-10 rounded-xl"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Vendor</label>
              <SearchableSelect
                value={vendorId}
                onChange={handleVendorChange}
                placeholder="Search or select vendor"
                options={vendors.map((c: any) => ({ value: c.id, label: c.name, hint: (c as any).email ?? "" }))}
                footerAction={{ label: "+ Add New Vendor", onClick: () => navigate("/contacts/new") }}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Linked Bill</label>
              <Select value={linkedBillId} onValueChange={setLinkedBillId}>
                <SelectTrigger className="mt-1.5 h-10 rounded-xl">
                  <SelectValue placeholder="Select bill (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No linked bill</SelectItem>
                  {filteredBills.map((b: any) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.bill_number}
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

          <LineItemsEditor
            items={lines}
            updateLine={updateLine}
            addLine={addLine}
            removeLine={removeLine}
            accounts={accounts as any[]}
            taxRates={taxRates as any[]}
            currency="MYR"
            quantityHeading="Quantity"
            typeTriggerClassName="text-xs"
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
          <Button type="button" variant="outline" onClick={() => navigate("/purchases/debit-notes")}>Cancel</Button>
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
