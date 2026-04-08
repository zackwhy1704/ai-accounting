import { useState, useEffect, useRef } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Plus, Trash2, Loader2 } from "lucide-react"
import { useDebitNote, useUpdateDebitNote, useContacts, useAccounts, useInvoices, useTaxRates } from "../../../lib/hooks"
import { Card } from "../../../components/ui/card"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table"

interface LineItem {
  id: string
  description: string
  accountId: string
  quantity: number
  unitPrice: number
  taxRate: number
  lineType: "goods" | "services"
  taxCodeId: string
}

const emptyLine = (): LineItem => ({
  id: crypto.randomUUID(),
  description: "",
  accountId: "",
  quantity: 1,
  unitPrice: 0,
  taxRate: 0,
  lineType: "goods",
  taxCodeId: "",
})

const tabs = [{ label: "Items", value: "items" }]

export default function EditDebitNotePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: debitNote, isLoading } = useDebitNote(id)
  const { data: contacts = [] } = useContacts()
  const { data: accounts = [] } = useAccounts()
  const { data: invoices = [] } = useInvoices()
  const { data: taxRates = [] } = useTaxRates()
  const updateDebitNote = useUpdateDebitNote()
  const populated = useRef(false)

  const [activeTab, setActiveTab] = useState("items")
  const [debitNoteNumber, setDebitNoteNumber] = useState("")
  const [customerId, setCustomerId] = useState("")
  const [linkedInvoiceId, setLinkedInvoiceId] = useState("")
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [reference, setReference] = useState("")
  const [lines, setLines] = useState<LineItem[]>([emptyLine()])
  const [discountGiven, setDiscountGiven] = useState(0)
  const [roundingAdjustment, setRoundingAdjustment] = useState(0)
  const [quickShareEmail, setQuickShareEmail] = useState(false)

  useEffect(() => {
    if (!debitNote || populated.current) return
    setDebitNoteNumber(debitNote.debit_note_number ?? "")
    setCustomerId(String(debitNote.contact_id ?? ""))
    setLinkedInvoiceId(String(debitNote.linked_invoice_id ?? ""))
    setDate(debitNote.issue_date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10))
    setReference(debitNote.reference ?? "")
    setDiscountGiven(debitNote.discount_given ?? 0)
    setRoundingAdjustment(debitNote.rounding_adjustment ?? 0)
    setQuickShareEmail(debitNote.quick_share_email ?? false)
    if (debitNote.lines?.length) {
      setLines(debitNote.lines.map((l: any) => ({
        id: crypto.randomUUID(),
        description: l.description ?? "",
        accountId: l.account_id ? String(l.account_id) : "",
        quantity: l.quantity ?? 1,
        unitPrice: l.unit_price ?? 0,
        taxRate: l.tax_rate ?? 0,
        lineType: l.line_type ?? "goods",
        taxCodeId: l.tax_code_id ? String(l.tax_code_id) : "",
      })))
    }
    populated.current = true
  }, [debitNote])

  const customers = contacts.filter((c: any) => c.type === "customer" || c.type === "both")
  const filteredInvoices = customerId ? invoices.filter((inv: any) => inv.contact_id === customerId) : invoices

  const updateLine = (lineId: string, field: keyof LineItem, value: any) => {
    setLines(prev => prev.map(l => {
      if (l.id !== lineId) return l
      const updated = { ...l, [field]: value }
      if (field === "taxCodeId") {
        const tc = taxRates.find((t: any) => t.id === value)
        if (tc) updated.taxRate = tc.rate
      }
      if (field === "lineType" && value === "services") {
        updated.quantity = 1
      }
      return updated
    }))
  }

  const removeLine = (lineId: string) => {
    setLines(prev => (prev.length === 1 ? prev : prev.filter(l => l.id !== lineId)))
  }

  const subTotal = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0)
  const total = subTotal - discountGiven + roundingAdjustment

  const handleSave = () => {
    updateDebitNote.mutate(
      {
        id,
        debit_note_number: debitNoteNumber,
        contact_id: customerId,
        linked_invoice_id: linkedInvoiceId,
        issue_date: date,
        reference,
        lines: lines.map(l => ({
          description: l.description,
          account_id: l.accountId,
          quantity: l.quantity,
          unit_price: l.unitPrice,
          tax_rate: l.taxRate,
          line_type: l.lineType,
          tax_code_id: l.taxCodeId || undefined,
        })),
        discount_given: discountGiven,
        rounding_adjustment: roundingAdjustment,
        quick_share_email: quickShareEmail,
      } as any,
      { onSuccess: () => navigate("/sales/debit-notes") }
    )
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!debitNote) {
    return <div className="p-6 text-muted-foreground">Debit note not found.</div>
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Sales</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Edit Debit Note {debitNote.debit_note_number}</div>
      </div>

      <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="flex gap-1 rounded-xl bg-muted p-1">
          {tabs.map(tb => (
            <button
              key={tb.value}
              type="button"
              onClick={() => setActiveTab(tb.value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${activeTab === tb.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {activeTab === "items" && (
          <div className="mt-6 flex flex-col gap-6">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Debit Note #</label>
                <Input value={debitNoteNumber} onChange={e => setDebitNoteNumber(e.target.value)} placeholder="DN-000000" className="mt-1.5 h-10 rounded-xl" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Customer</label>
                <Select value={customerId} onValueChange={v => { if (v === "__add_new__") { navigate("/contacts/new"); return } setCustomerId(v); setLinkedInvoiceId("") }}>
                  <SelectTrigger className="mt-1.5 h-10 rounded-xl"><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>
                    {customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    <SelectItem value="__add_new__" className="text-primary font-medium">+ Add New Customer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Linked Invoice</label>
                <Select value={linkedInvoiceId} onValueChange={setLinkedInvoiceId}>
                  <SelectTrigger className="mt-1.5 h-10 rounded-xl"><SelectValue placeholder="Select invoice" /></SelectTrigger>
                  <SelectContent>
                    {filteredInvoices.map((inv: any) => <SelectItem key={inv.id} value={inv.id}>{inv.invoice_number}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Date</label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1.5 h-10 rounded-xl" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Reference</label>
                <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="Enter reference" className="mt-1.5 h-10 rounded-xl" />
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="w-[50px] text-muted-foreground">#</TableHead>
                    <TableHead className="w-[100px] text-muted-foreground">Type</TableHead>
                    <TableHead className="text-muted-foreground">Description</TableHead>
                    <TableHead className="w-[180px] text-muted-foreground">Account</TableHead>
                    <TableHead className="w-[100px] text-muted-foreground">Quantity</TableHead>
                    <TableHead className="w-[130px] text-muted-foreground">Unit Price</TableHead>
                    <TableHead className="w-[130px] text-right text-muted-foreground">Amount</TableHead>
                    <TableHead className="w-[140px] text-muted-foreground">Tax Code</TableHead>
                    <TableHead className="w-[50px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line, idx) => (
                    <TableRow key={line.id} className="border-border hover:bg-muted/50">
                      <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell>
                        <Select value={line.lineType} onValueChange={v => updateLine(line.id, "lineType", v)}>
                          <SelectTrigger className="h-9 rounded-lg border-0 bg-transparent shadow-none focus:ring-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="goods">Goods</SelectItem>
                            <SelectItem value="services">Services</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input value={line.description} onChange={e => updateLine(line.id, "description", e.target.value)} placeholder="Item description" className="h-9 rounded-lg border-0 bg-transparent px-2 text-sm shadow-none focus-visible:ring-1" />
                      </TableCell>
                      <TableCell>
                        <Select value={line.accountId} onValueChange={v => updateLine(line.id, "accountId", v)}>
                          <SelectTrigger className="h-9 rounded-lg border-0 bg-transparent shadow-none focus:ring-1"><SelectValue placeholder="Account" /></SelectTrigger>
                          <SelectContent>
                            {accounts.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {line.lineType === "services" ? (
                          <span className="px-2 text-sm text-muted-foreground">&mdash;</span>
                        ) : (
                          <Input type="number" min={0} value={line.quantity} onChange={e => updateLine(line.id, "quantity", Number(e.target.value))} className="h-9 rounded-lg border-0 bg-transparent px-2 text-sm shadow-none focus-visible:ring-1" />
                        )}
                      </TableCell>
                      <TableCell>
                        <Input type="number" min={0} step={0.01} value={line.unitPrice} onChange={e => updateLine(line.id, "unitPrice", Number(e.target.value))} className="h-9 rounded-lg border-0 bg-transparent px-2 text-sm shadow-none focus-visible:ring-1" />
                      </TableCell>
                      <TableCell className="text-right text-sm text-foreground">{(line.quantity * line.unitPrice).toFixed(2)}</TableCell>
                      <TableCell>
                        <Select value={line.taxCodeId} onValueChange={v => updateLine(line.id, "taxCodeId", v)}>
                          <SelectTrigger className="h-9 rounded-lg border-0 bg-transparent shadow-none focus:ring-1"><SelectValue placeholder="Tax Code" /></SelectTrigger>
                          <SelectContent>
                            {taxRates.map((tc: any) => <SelectItem key={tc.id} value={tc.id}>{tc.code} ({tc.rate}%)</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeLine(line.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div>
              <Button type="button" variant="outline" className="h-9 rounded-xl border-blue-300 px-3 text-xs font-semibold text-blue-600 hover:bg-blue-50" onClick={() => setLines(prev => [...prev, emptyLine()])}>
                <Plus className="mr-2 h-4 w-4" /> Item
              </Button>
            </div>

            <div className="flex justify-end">
              <div className="w-full max-w-sm flex flex-col gap-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Sub Total</span>
                  <span className="text-foreground">{subTotal.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Discount Given</span>
                  <Input type="number" min={0} step={0.01} value={discountGiven} onChange={e => setDiscountGiven(Number(e.target.value))} className="h-8 w-28 rounded-lg text-right text-sm" />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Rounding Adjustment</span>
                  <Input type="number" step={0.01} value={roundingAdjustment} onChange={e => setRoundingAdjustment(Number(e.target.value))} className="h-8 w-28 rounded-lg text-right text-sm" />
                </div>
                <div className="border-t border-border pt-2 flex items-center justify-between text-sm font-semibold">
                  <span className="text-foreground">TOTAL</span>
                  <span className="text-foreground">{total.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-border pt-4">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" checked={quickShareEmail} onChange={e => setQuickShareEmail(e.target.checked)} className="h-4 w-4 rounded border-border" />
                QuickShare via Email
              </label>
              <div className="flex items-center gap-3">
                <Button type="button" variant="outline" onClick={() => navigate("/sales/debit-notes")}>Cancel</Button>
                <Button type="button" onClick={handleSave} disabled={updateDebitNote.isPending} className="h-9 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 text-xs font-semibold text-white shadow-sm hover:opacity-95">
                  {updateDebitNote.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
