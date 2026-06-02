import { useState, useEffect, useRef, useMemo } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Plus, Trash2, Loader2, X } from "lucide-react"
import { useCreditNote, useUpdateCreditNote, useContacts, useAccounts, useTaxRates, useInvoices, useRemoveSingleCreditApplication, useCreditNoteActivity, type InvoiceActivityEvent } from "../../../lib/hooks"
import { formatCurrency, formatDate } from "../../../lib/utils"
import { getContactPrefs, saveContactPref } from "../../../lib/contact-prefs"
import { useToast } from "../../../components/ui/toast"
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
  discount_mode: "percent" | "amount"
  tax_rate: number
  line_type: "goods" | "services"
  tax_code_id: string
}

function lineDiscountAmount(item: LineItem): number {
  const lineTotal = item.quantity * item.unit_price
  return item.discount_mode === "amount" ? Math.min(item.discount, lineTotal) : (lineTotal * item.discount) / 100
}

interface ApplyCreditLine {
  invoice_id: string
  selected: boolean
  apply_amount: number
  app_id?: string  // DB-backed CreditApplicationModel.id (present when loaded from existing CN)
}

const cardClass = "rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]"

export default function EditCreditNotePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data: creditNote, isLoading } = useCreditNote(id)
  const { data: contacts = [] } = useContacts()
  const { data: accounts = [] } = useAccounts()
  const { data: taxRates = [] } = useTaxRates()
  const { data: invoices = [] } = useInvoices()
  const updateCreditNote = useUpdateCreditNote()
  const { data: activity } = useCreditNoteActivity(id)
  const removeSingleApp = useRemoveSingleCreditApplication()
  const populated = useRef(false)

  const [applyCreditLines, setApplyCreditLines] = useState<ApplyCreditLine[]>([])
  const [creditNoteNumber, setCreditNoteNumber] = useState("")
  const [contactId, setContactId] = useState("")
  const [creditNoteDate, setCreditNoteDate] = useState("")
  const [reference, setReference] = useState("")
  const [forInvoiceId, setForInvoiceId] = useState("")
  const [currency, setCurrency] = useState("MYR")
  const [lineItems, setLineItems] = useState<LineItem[]>([] as LineItem[])

  useEffect(() => {
    if (!creditNote || populated.current) return
    setCreditNoteNumber(creditNote.credit_note_number ?? "")
    setContactId(String(creditNote.contact_id ?? ""))
    setCreditNoteDate(creditNote.issue_date?.slice(0, 10) ?? "")
    setReference(creditNote.reference ?? "")
    setForInvoiceId(creditNote.invoice_id ? String(creditNote.invoice_id) : "")
    setCurrency(creditNote.currency ?? "MYR")
    if (creditNote.line_items?.length) {
      setLineItems(creditNote.line_items.map((l: any) => ({
        description: l.description ?? "",
        account_id: l.account_id ? String(l.account_id) : "",
        quantity: l.quantity ?? 1,
        unit_price: l.unit_price ?? 0,
        amount: l.amount ?? 0,
        discount: l.discount ?? 0,
        discount_mode: l.discount_mode ?? "percent",
        tax_rate: l.tax_rate ?? 0,
        line_type: l.line_type ?? "goods",
        tax_code_id: l.tax_code_id ? String(l.tax_code_id) : "",
      })))
    }
    if (creditNote.credit_applications?.length) {
      setApplyCreditLines(creditNote.credit_applications.map((a: any) => ({
        invoice_id: String(a.invoice_id),
        selected: true,
        apply_amount: a.amount ?? 0,
        app_id: a.id ? String(a.id) : undefined,
      })))
    }
    populated.current = true
  }, [creditNote])

  const customerInvoices = useMemo(() => {
    if (!contactId) return []
    // Include all non-void invoices for this customer — paid/closed can also receive credit
    return invoices.filter((inv: any) =>
      String(inv.contact_id) === String(contactId) && inv.status !== "void"
    )
  }, [invoices, contactId])

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

  const addInvoiceToApply = (invoiceId: string) => {
    if (applyCreditLines.some(l => l.invoice_id === invoiceId)) return
    setApplyCreditLines(prev => [...prev, { invoice_id: invoiceId, selected: true, apply_amount: 0 }])
  }

  const creditApplied = applyCreditLines.reduce((sum, l) => sum + (l.selected ? l.apply_amount : 0), 0)

  const handleContactChange = (v: string) => {
    if (v === "__add_new__") { navigate("/contacts/new"); return }
    setContactId(v)
    const prefs = getContactPrefs(v)
    if (prefs.currency) setCurrency(prefs.currency)
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
      const discAmt = lineDiscountAmount(item)
      const afterDiscount = item.quantity * item.unit_price - discAmt
      const tax = (afterDiscount * item.tax_rate) / 100
      updated[index].amount = afterDiscount + tax
      return updated
    })
  }

  const addLineItem = () => {
    setLineItems(prev => [
      ...prev,
      { description: "", account_id: "", quantity: 1, unit_price: 0, amount: 0, discount: 0, discount_mode: "percent", tax_rate: 0, line_type: "goods", tax_code_id: "" },
    ])
  }

  const removeLineItem = (index: number) => {
    setLineItems(prev => prev.filter((_, i) => i !== index))
  }

  const subTotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
  const totalDiscount = lineItems.reduce((sum, item) => sum + lineDiscountAmount(item), 0)
  const totalTax = lineItems.reduce((sum, item) => {
    const afterLineDiscount = item.quantity * item.unit_price - lineDiscountAmount(item)
    return sum + (afterLineDiscount * item.tax_rate) / 100
  }, 0)
  const total = subTotal - totalDiscount + totalTax

  const linesValid = lineItems.length > 0 && lineItems.every(li => li.account_id)

  const handleSave = async () => {
    if (!contactId) { toast("Please select a customer", "warning"); return }
    if (!lineItems.some(li => li.description.trim())) { toast("Please add at least one line item", "warning"); return }
    try {
      await updateCreditNote.mutateAsync({
        id,
        contact_id: contactId,
        credit_note_number: creditNoteNumber || undefined,
        invoice_id: forInvoiceId || null,
        issue_date: new Date(creditNoteDate).toISOString(),
        reference,
        currency,
        notes: null,
        line_items: lineItems.map(li => ({
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
        credit_applications: applyCreditLines
          .filter(l => l.selected && l.apply_amount > 0)
          .map(l => ({ invoice_id: l.invoice_id, amount: l.apply_amount })),
      })
      toast("Credit note saved", "success")
      navigate("/sales/credit-notes")
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      toast(typeof detail === "string" ? detail : "Failed to save credit note", "warning")
    }
  }

  const handleApplyOnly = async () => {
    try {
      await updateCreditNote.mutateAsync({
        id,
        credit_applications: applyCreditLines
          .filter(l => l.selected && l.apply_amount > 0)
          .map(l => ({ invoice_id: l.invoice_id, amount: l.apply_amount })),
      })
      toast("Credit applied", "success")
      navigate("/sales/credit-notes")
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      toast(typeof detail === "string" ? detail : "Failed to apply credit", "warning")
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!creditNote) {
    return <div className="p-6 text-muted-foreground">Credit note not found.</div>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="text-xs text-muted-foreground">Sales</div>
        <div className="text-2xl font-semibold tracking-tight text-foreground">Edit Credit Note {creditNote.credit_note_number}</div>
      </div>

      <div className="flex flex-col gap-6">
        {/* Items Card */}
        <Card className={cardClass}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Credit Note #</label>
              <Input value={creditNoteNumber} onChange={e => setCreditNoteNumber(e.target.value)} placeholder="Auto-generated (CN-0001)" className="h-10 rounded-xl" />
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
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Date</label>
              <Input type="date" value={creditNoteDate} onChange={e => setCreditNoteDate(e.target.value)} className="h-10 rounded-xl" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Reference</label>
              <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="Reference #" className="h-10 rounded-xl" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">For Invoice (optional)</label>
              <SearchableSelect
                value={forInvoiceId}
                onChange={setForInvoiceId}
                placeholder={contactId ? "Search invoice this CN adjusts" : "Select customer first"}
                allowClear
                options={customerInvoices.map((inv: any) => ({
                  value: inv.id,
                  label: inv.invoice_number,
                  hint: inv.reference ?? "",
                }))}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4">
            <div className="w-36">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Currency</label>
              <Select value={currency} onValueChange={v => { setCurrency(v); if (contactId) saveContactPref(contactId, "currency", v) }}>
                <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Select currency" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MYR">MYR - Malaysian Ringgit</SelectItem>
                  <SelectItem value="SGD">SGD - Singapore Dollar</SelectItem>
                  <SelectItem value="USD">USD - US Dollar</SelectItem>
                  <SelectItem value="EUR">EUR - Euro</SelectItem>
                  <SelectItem value="GBP">GBP - British Pound</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4">
            <Button type="button" onClick={addLineItem} className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white shadow-sm hover:opacity-95">
              <Plus className="mr-1.5 h-4 w-4" /> Item
            </Button>
          </div>

          <div className="mt-4 rounded-2xl border border-border">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="w-10 text-center text-muted-foreground">#</TableHead>
                  <TableHead className="w-[100px] text-muted-foreground">Type</TableHead>
                  <TableHead className="min-w-[200px] text-muted-foreground">Description</TableHead>
                  <TableHead className="w-[160px] text-muted-foreground">Account</TableHead>
                  <TableHead className="w-[80px] text-muted-foreground">Qty</TableHead>
                  <TableHead className="w-[110px] text-muted-foreground">Unit Price</TableHead>
                  <TableHead className="w-[80px] text-muted-foreground">Discount</TableHead>
                  <TableHead className="w-[160px] text-muted-foreground">Tax Code</TableHead>
                  <TableHead className="w-[80px] text-muted-foreground">Tax %</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineItems.length === 0 ? (
                  <TableRow className="border-border">
                    <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">No items</TableCell>
                  </TableRow>
                ) : (
                  lineItems.map((item, idx) => (
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
                          <Input type="number" min={0} value={item.quantity} onChange={e => updateLineItem(idx, "quantity", Number(e.target.value))} className="h-9 rounded-lg border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-1" />
                        )}
                      </TableCell>
                      <TableCell>
                        <Input type="number" min={0} step={0.01} value={item.unit_price} onChange={e => updateLineItem(idx, "unit_price", Number(e.target.value))} className="h-9 rounded-lg border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-1" />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number" min={0} step={0.01}
                            value={item.discount}
                            onChange={e => updateLineItem(idx, "discount", Number(e.target.value))}
                            className="h-9 w-20 rounded-lg border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-1"
                          />
                          <button
                            type="button"
                            onClick={() => updateLineItem(idx, "discount_mode", item.discount_mode === "percent" ? "amount" : "percent")}
                            className="h-7 w-9 rounded-md border border-border bg-muted/40 text-[11px] font-semibold text-foreground hover:bg-muted"
                            title={item.discount_mode === "percent" ? "Switch to flat amount" : "Switch to percentage"}
                          >
                            {item.discount_mode === "percent" ? "%" : currency}
                          </button>
                        </div>
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
                  ))
                )}
              </TableBody>
            </Table>
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

        {/* Apply Credit Card */}
        <Card className={cardClass}>
          <h3 className="mb-4 text-sm font-semibold text-foreground">Apply Credit</h3>
          <div className="mb-3">
            <p className="text-xs text-muted-foreground">Select outstanding invoices and specify the amount to apply from this credit note.</p>
          </div>

          {customerInvoices.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {customerInvoices.filter(inv => !applyCreditLines.some(l => l.invoice_id === inv.id)).map((inv: any) => (
                <button key={inv.id} type="button" onClick={() => addInvoiceToApply(inv.id)} className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100">
                  + {inv.invoice_number}
                </button>
              ))}
            </div>
          )}

          <div className="overflow-x-auto rounded-2xl border border-border">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="w-10 text-center text-muted-foreground" />
                  <TableHead className="text-muted-foreground">Invoice</TableHead>
                  <TableHead className="text-muted-foreground">Date</TableHead>
                  <TableHead className="text-right text-muted-foreground">Total</TableHead>
                  <TableHead className="text-right text-muted-foreground">Balance</TableHead>
                  <TableHead className="w-[140px] text-right text-muted-foreground">Apply Amount</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {applyCreditLines.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No invoices selected. Click an invoice above to add it.</TableCell></TableRow>
                ) : (
                  applyCreditLines.map((line, idx) => {
                    const inv = invoices.find((i: any) => i.id === line.invoice_id) as any
                    return (
                      <TableRow key={idx} className="border-border">
                        <TableCell className="text-center">
                          <input type="checkbox" checked={line.selected} onChange={() => toggleApplyCredit(idx)} className="h-4 w-4 rounded border-border" />
                        </TableCell>
                        <TableCell className="text-sm font-medium text-foreground">{inv?.invoice_number ?? line.invoice_id}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{inv ? formatDate(inv.issue_date) : "—"}</TableCell>
                        <TableCell className="text-right text-sm text-foreground">{formatCurrency(inv?.total ?? 0)}</TableCell>
                        <TableCell className="text-right text-sm text-foreground">{formatCurrency(inv ? inv.total - (inv.amount_paid || 0) : 0)}</TableCell>
                        <TableCell>
                          <Input type="number" min={0} step={0.01} value={line.apply_amount} onChange={e => updateApplyAmount(idx, Number(e.target.value))} disabled={!line.selected} className="h-9 rounded-lg text-right text-sm" />
                        </TableCell>
                        <TableCell>
                          {line.app_id ? (
                            <button
                              type="button"
                              title="Remove this credit application"
                              disabled={removeSingleApp.isPending}
                              onClick={() => {
                                if (confirm("Remove this credit application? The invoice balance will be restored.")) {
                                  removeSingleApp.mutate(
                                    { cnId: id!, appId: line.app_id! },
                                    {
                                      onSuccess: () => {
                                        setApplyCreditLines(prev => prev.filter((_, i) => i !== idx))
                                      },
                                    }
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
            <Button type="button" onClick={handleApplyOnly} disabled={updateCreditNote.isPending || creditApplied <= 0} className="h-9 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed">
              {updateCreditNote.isPending ? "Saving..." : "Apply Credit"}
            </Button>
          </div>
        </Card>

      </div>

      {activity && (
        <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
          <div className="mb-4 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-foreground">Activity</h3>
            <div className="text-xs text-muted-foreground">Total {activity.total.toFixed(2)}</div>
          </div>
          {activity.events.length === 0 ? (
            <div className="text-sm text-muted-foreground">No activity yet.</div>
          ) : (
            <div className="space-y-3">
              {activity.events.map((ev: InvoiceActivityEvent, idx: number) => (
                <SimpleActivityRow key={`${ev.type}-${ev.ref_id}-${idx}`} event={ev} />
              ))}
            </div>
          )}
        </Card>
      )}

      <div className="flex items-center justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => navigate("/sales/credit-notes")}>Cancel</Button>
        <Button type="button" onClick={handleSave} disabled={updateCreditNote.isPending || !contactId || !lineItems.some(li => li.description.trim()) || !linesValid} className="h-10 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 text-sm font-semibold text-white shadow-sm hover:opacity-95">
          {updateCreditNote.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  )
}

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  issued: "Issued", credit_note: "Credit Note", debit_note: "Debit Note",
  payment: "Payment", refund: "Refund", journal: "Journal",
}
const ACTIVITY_TYPE_COLORS: Record<string, string> = {
  issued: "bg-blue-100 text-blue-700", credit_note: "bg-rose-100 text-rose-700",
  debit_note: "bg-amber-100 text-amber-700", payment: "bg-emerald-100 text-emerald-700",
  refund: "bg-orange-100 text-orange-700", journal: "bg-slate-100 text-slate-700",
}
function SimpleActivityRow({ event }: { event: InvoiceActivityEvent }) {
  const date = event.ts ? new Date(event.ts).toLocaleDateString() : "—"
  const sign = event.delta > 0 ? "+" : event.delta < 0 ? "−" : ""
  const amount = Math.abs(event.delta).toFixed(2)
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-background/50 p-3">
      <div className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${ACTIVITY_TYPE_COLORS[event.type] ?? "bg-slate-100 text-slate-700"}`}>
        {ACTIVITY_TYPE_LABELS[event.type] ?? event.type}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-sm font-medium text-foreground truncate">{event.ref}</div>
          <div className="text-xs text-muted-foreground shrink-0">{date}</div>
        </div>
        {event.note && <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{event.note}</div>}
      </div>
      <div className="text-right shrink-0">
        {event.delta !== 0 && (
          <div className={`text-sm font-semibold ${event.delta > 0 ? "text-amber-600" : "text-emerald-600"}`}>{sign}{amount}</div>
        )}
        <div className="text-[11px] text-muted-foreground">Bal {event.balance.toFixed(2)}</div>
      </div>
    </div>
  )
}
