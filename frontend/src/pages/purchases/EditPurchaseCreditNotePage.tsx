import { useState, useEffect, useRef, useMemo } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Loader2, X } from "lucide-react"
import { useContacts, useAccounts, useBills, usePurchaseCreditNote, useUpdatePurchaseCreditNote, useTaxRates, useRemoveSinglePurchaseCreditApplication, useApplyPurchaseCredit } from "../../lib/hooks"
import { formatCurrency, formatDate } from "../../lib/utils"
import { getContactPrefs, saveContactPref } from "../../lib/contact-prefs"
import { useToast } from "../../components/ui/toast"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"
import { SearchableSelect } from "../../components/ui/searchable-select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table"
import { LineItemsEditor, useLineItems } from "../../components/line-items"

interface ApplyCreditLine {
  bill_id: string
  selected: boolean
  apply_amount: number
  app_id?: string
}

export default function EditVendorCreditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data: contacts = [] } = useContacts()
  const { data: allBills = [] } = useBills()
  const { data: taxRates = [] } = useTaxRates()
  const { data: accounts = [] } = useAccounts()
  const { data } = usePurchaseCreditNote(id!)
  const updatePCN = useUpdatePurchaseCreditNote()
  const removeSingleApp = useRemoveSinglePurchaseCreditApplication()
  const applyCredit = useApplyPurchaseCredit()

  const [pcnNumber, setPcnNumber] = useState("")
  const [vendorId, setVendorId] = useState("")
  const [linkedBillId, setLinkedBillId] = useState("")
  const [date, setDate] = useState("")
  const [reference, setReference] = useState("")
  const [currency, setCurrency] = useState("MYR")
  const [notes, setNotes] = useState("")
  const [applyCreditLines, setApplyCreditLines] = useState<ApplyCreditLine[]>([])

  const { lineItems, setLineItems, updateLine, addLine, removeLine, subTotal, totalDiscount, totalTax, total } = useLineItems({
    taxRates,
  })

  const populated = useRef(false)
  useEffect(() => {
    if (data && !populated.current) {
      populated.current = true
      setPcnNumber(data.pcn_number || "")
      setVendorId(data.contact_id || "")
      setLinkedBillId(data.bill_id || "")
      setDate(data.issue_date ? data.issue_date.slice(0, 10) : "")
      setReference(data.reference || "")
      setCurrency(data.currency || "MYR")
      setNotes(data.notes || "")
      if (data.line_items && data.line_items.length > 0) {
        setLineItems(data.line_items.map((li: any) => ({
          line_type: (li.line_type === "services" ? "services" : "goods") as "goods" | "services",
          description: li.description || "",
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
      if ((data as any).credit_applications?.length) {
        setApplyCreditLines((data as any).credit_applications.map((a: any) => ({
          bill_id: String(a.bill_id),
          selected: true,
          apply_amount: a.amount ?? 0,
          app_id: a.id ? String(a.id) : undefined,
        })))
      }
    }
  }, [data])

  const vendors = (contacts as any[]).filter((c: any) => c.type === "supplier" || c.type === "vendor" || c.type === "both")
  const filteredBills = vendorId
    ? (allBills as any[]).filter((b: any) => b.contact_id === vendorId && b.status !== "void")
    : (allBills as any[]).filter((b: any) => b.status !== "void")

  const vendorBills = useMemo(() => {
    if (!vendorId) return []
    return (allBills as any[]).filter((b: any) => String(b.contact_id) === String(vendorId) && b.status !== "void")
  }, [allBills, vendorId])

  const toggleApplyCredit = (idx: number) => {
    setApplyCreditLines(prev => {
      const updated = [...prev]
      updated[idx] = { ...updated[idx], selected: !updated[idx].selected }
      if (!updated[idx].selected) updated[idx].apply_amount = 0
      return updated
    })
  }

  const updateApplyAmount = (idx: number, amount: number) => {
    setApplyCreditLines(prev => {
      const updated = [...prev]
      updated[idx] = { ...updated[idx], apply_amount: amount }
      return updated
    })
  }

  const addBillToApply = (billId: string) => {
    if (applyCreditLines.some(l => l.bill_id === billId)) return
    setApplyCreditLines(prev => [...prev, { bill_id: billId, selected: true, apply_amount: 0 }])
  }

  const creditApplied = applyCreditLines.reduce((sum, l) => sum + (l.selected ? l.apply_amount : 0), 0)

  const handleVendorChange = (v: string) => {
    if (v === "__add_new__") { navigate("/contacts/new"); return }
    setVendorId(v)
    setLinkedBillId("")
    const prefs = getContactPrefs(v)
    if (prefs.currency) setCurrency(prefs.currency)
  }

  const isReadOnly = false
  const isFormValid = !!vendorId && lineItems.some(l => l.description.trim() !== "") && lineItems.every(l => l.account_id)

  const handleSave = () => {
    if (!isFormValid) { toast("Please select a supplier and add at least one line item", "warning"); return }
    updatePCN.mutate(
      {
        id: id!,
        contact_id: vendorId,
        pcn_number: pcnNumber || undefined,
        bill_id: linkedBillId || null,
        issue_date: new Date(date).toISOString(),
        reference: reference || null,
        currency,
        notes: notes || null,
        line_items: lineItems.map((l, i) => ({
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
        onSuccess: () => { toast("Purchase credit note updated", "success"); navigate("/purchases/credit-notes") },
        onError: (err: any) => toast(err?.response?.data?.detail ?? "Failed to update credit note", "warning"),
      }
    )
  }

  const handleApplyOnly = async () => {
    const toApply = applyCreditLines.filter(l => l.selected && l.apply_amount > 0 && !l.app_id)
    if (toApply.length === 0) { toast("No new credit applications to save", "warning"); return }
    try {
      for (const line of toApply) {
        await applyCredit.mutateAsync({ pcnId: id!, billId: line.bill_id, amount: line.apply_amount })
      }
      toast("Credit applied to bill", "success")
      navigate("/purchases/credit-notes")
    } catch (err: any) {
      toast(err?.response?.data?.detail ?? "Failed to apply credit", "warning")
    }
  }

  const pcnTotal = data ? (data as any).total ?? total : total

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Purchases › Credit Notes</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Edit Purchase Credit Note</div>
        {isReadOnly && <div className="mt-1 text-sm text-amber-600">This credit note is {data?.status} and cannot be edited.</div>}
      </div>

      <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Credit Note #</label>
              <Input
                value={pcnNumber}
                onChange={e => setPcnNumber(e.target.value)}
                placeholder="PCN-00001"
                disabled={isReadOnly}
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
              <Select value={linkedBillId} onValueChange={v => setLinkedBillId(v === "__none__" ? "" : v)} disabled={isReadOnly}>
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
                disabled={isReadOnly}
                className="mt-1.5 h-10 rounded-xl"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Reference</label>
              <Input
                value={reference}
                onChange={e => setReference(e.target.value)}
                placeholder="e.g. Supplier CN ref"
                disabled={isReadOnly}
                className="mt-1.5 h-10 rounded-xl"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Currency</label>
              <Select value={currency} onValueChange={v => { setCurrency(v); if (vendorId) saveContactPref(vendorId, "currency", v) }} disabled={isReadOnly}>
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
              disabled={isReadOnly}
              placeholder="Internal notes..."
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />
          </div>
        </div>
      </Card>

      {/* Apply Credit Panel */}
      {data?.status !== "void" && data?.status !== "draft" && (
        <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Apply Credit to Bills</h3>
          <p className="mb-3 text-xs text-muted-foreground">Select outstanding bills and specify the amount to apply from this credit note. Remaining credit: <span className="font-semibold text-foreground">{formatCurrency(Math.max(0, pcnTotal - (data ? (data as any).credit_applied ?? 0 : 0)))}</span></p>

          {vendorBills.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {vendorBills.filter((b: any) => !applyCreditLines.some(l => l.bill_id === b.id)).map((b: any) => (
                <button key={b.id} type="button" onClick={() => addBillToApply(b.id)} className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100">
                  + {b.bill_number}
                </button>
              ))}
            </div>
          )}

          <div className="overflow-x-auto rounded-2xl border border-border">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="w-10 text-center text-muted-foreground" />
                  <TableHead className="text-muted-foreground">Bill</TableHead>
                  <TableHead className="text-muted-foreground">Date</TableHead>
                  <TableHead className="text-right text-muted-foreground">Total</TableHead>
                  <TableHead className="text-right text-muted-foreground">Balance</TableHead>
                  <TableHead className="w-[140px] text-right text-muted-foreground">Apply Amount</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {applyCreditLines.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No bills selected. Click a bill above to add it.</TableCell></TableRow>
                ) : (
                  applyCreditLines.map((line, idx) => {
                    const bill = (allBills as any[]).find((b: any) => b.id === line.bill_id)
                    return (
                      <TableRow key={idx} className="border-border">
                        <TableCell className="text-center">
                          <input type="checkbox" checked={line.selected} onChange={() => toggleApplyCredit(idx)} className="h-4 w-4 rounded border-border" />
                        </TableCell>
                        <TableCell className="text-sm font-medium text-foreground">{bill?.bill_number ?? line.bill_id}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{bill ? formatDate(bill.bill_date ?? bill.issue_date) : "—"}</TableCell>
                        <TableCell className="text-right text-sm text-foreground">{formatCurrency(bill?.total ?? 0)}</TableCell>
                        <TableCell className="text-right text-sm text-foreground">{formatCurrency(bill ? parseFloat(bill.total) - parseFloat(bill.amount_paid || 0) : 0)}</TableCell>
                        <TableCell>
                          <Input type="number" min={0} step={0.01} value={line.apply_amount} onChange={e => updateApplyAmount(idx, Number(e.target.value))} disabled={!line.selected || !!line.app_id} className="h-9 rounded-lg text-right text-sm" />
                        </TableCell>
                        <TableCell>
                          {line.app_id ? (
                            <button
                              type="button"
                              title="Remove this credit application"
                              disabled={removeSingleApp.isPending}
                              onClick={() => {
                                if (confirm("Remove this credit application? The bill balance will be restored.")) {
                                  removeSingleApp.mutate(
                                    { pcnId: id!, appId: line.app_id! },
                                    { onSuccess: () => setApplyCreditLines(prev => prev.filter((_, i) => i !== idx)) }
                                  )
                                }
                              }}
                              className="text-muted-foreground hover:text-rose-500 disabled:opacity-40"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              title="Remove row"
                              onClick={() => setApplyCreditLines(prev => prev.filter((_, i) => i !== idx))}
                              className="text-muted-foreground hover:text-rose-500"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
            <div className="text-sm text-muted-foreground">Credit Applied: <span className="font-semibold text-foreground">{formatCurrency(creditApplied)}</span></div>
            <Button type="button" onClick={handleApplyOnly} disabled={applyCredit.isPending || applyCreditLines.filter(l => l.selected && l.apply_amount > 0 && !l.app_id).length === 0} className="h-9 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed">
              {applyCredit.isPending ? "Saving..." : "Apply Credit"}
            </Button>
          </div>
        </Card>
      )}

      <div className="flex items-center justify-end">
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" onClick={() => navigate("/purchases/credit-notes")}>
            {isReadOnly ? "Back" : "Cancel"}
          </Button>
          {!isReadOnly && (
            <Button
              type="button"
              onClick={handleSave}
              disabled={updatePCN.isPending || !isFormValid}
              className="h-9 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 text-xs font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {updatePCN.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : "Save Changes"}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
