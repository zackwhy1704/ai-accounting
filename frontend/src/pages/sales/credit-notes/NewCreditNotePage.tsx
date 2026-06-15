import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useContacts, useAccounts, useInvoices, useCreateCreditNote, useTaxRates } from "../../../lib/hooks"
import { getContactPrefs } from "../../../lib/contact-prefs"
import { useToast } from "../../../components/ui/toast"
import { Card } from "../../../components/ui/card"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select"
import { SearchableSelect } from "../../../components/ui/searchable-select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table"
import { LineItemsEditor, useLineItems } from "../../../components/line-items"

interface ApplyCreditLine {
  invoice_id: string
  selected: boolean
  apply_amount: number
}

export default function NewCreditNotePage() {
  console.log("[NewCreditNotePage] rendering")
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data: contacts = [] } = useContacts()
  const { data: accounts = [] } = useAccounts()
  const { data: invoices = [] } = useInvoices()
  const createCreditNote = useCreateCreditNote()
  const { data: taxRates = [] } = useTaxRates()

  const [creditNoteNumber, setCreditNoteNumber] = useState("")
  const [contactId, setContactId] = useState("")
  const [creditNoteDate, setCreditNoteDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [reference, setReference] = useState("")
  const [forInvoiceId, setForInvoiceId] = useState("")
  const [currency, setCurrency] = useState("MYR")
  const { lineItems, updateLine, addLine, removeLine, subTotal, totalDiscount, totalTax, total } = useLineItems({
    taxRates,
  })
  const [applyCreditLines, setApplyCreditLines] = useState<ApplyCreditLine[]>([])

  // All invoices for this customer — including paid/closed ones (for linking purposes)
  const customerInvoices = invoices.filter(
    (inv: any) => String(inv.contact_id) === String(contactId) && inv.status !== "void"
  )

  const handleContactChange = (id: string) => {
    if (id === "__add_new__") { navigate("/contacts/new"); return }
    setContactId(id)
    const prefs = getContactPrefs(id)
    if (prefs.currency) setCurrency(prefs.currency)
    const custInvoices = invoices.filter((inv: any) => inv.contact_id === id && inv.status !== "void")
    setApplyCreditLines(
      custInvoices
        .map((inv: any) => ({
          invoice_id: inv.id,
          selected: false,
          apply_amount: 0,
        }))
    )
  }

  const toggleApplyCredit = (index: number) => {
    setApplyCreditLines(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], selected: !updated[index].selected }
      if (!updated[index].selected) updated[index].apply_amount = 0
      return updated
    })
  }

  const updateApplyAmount = (index: number, amount: number) => {
    setApplyCreditLines(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], apply_amount: amount }
      return updated
    })
  }

  const creditApplied = applyCreditLines.reduce((sum, line) => sum + (line.selected ? line.apply_amount : 0), 0)

  const linesValid = lineItems.length > 0 && lineItems.every(li => li.account_id)

  const handleSave = async () => {
    if (!contactId) { toast("Please select a customer", "warning"); return }
    if (!lineItems.some(li => li.description.trim())) { toast("Please add at least one line item", "warning"); return }
    try {
      await createCreditNote.mutateAsync({
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
      toast("Credit note created", "success")
      navigate("/sales/credit-notes")
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      toast(typeof detail === "string" ? detail : "Failed to save credit note", "warning")
    }
  }

  const cardClass = "rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]"

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="text-xs text-muted-foreground">Sales</div>
        <div className="text-2xl font-semibold tracking-tight text-foreground">New Credit Note</div>
      </div>

      {/* Items Card */}
      <Card className={cardClass}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Credit Note #</label>
            <Input
              value={creditNoteNumber}
              onChange={e => setCreditNoteNumber(e.target.value)}
              placeholder="Auto-generated (CN-0001)"
              className="h-10 rounded-xl"
            />
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
            <Input
              type="date"
              value={creditNoteDate}
              onChange={e => setCreditNoteDate(e.target.value)}
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
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Select currency" />
              </SelectTrigger>
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
          currency={currency}
          descriptionHeadClassName="min-w-[200px]"
          discountHeadClassName="w-[80px]"
          accountTriggerClassName="h-9 rounded-lg border-0 bg-transparent shadow-none text-xs"
          servicesQtyStyle="span"
          taxCodeCellClassName="w-[160px]"
          taxRateCellClassName="w-[80px]"
          controlsClassName="mt-4"
        />

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
        <div className="mb-2">
          <h3 className="text-sm font-semibold text-foreground">Apply Credit</h3>
          <p className="text-xs text-muted-foreground">Apply credit to invoices.</p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-border">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="w-10 text-center text-muted-foreground">
                  <input type="checkbox" disabled className="h-4 w-4 rounded border-border" />
                </TableHead>
                <TableHead className="text-muted-foreground">Invoice</TableHead>
                <TableHead className="text-muted-foreground">Description</TableHead>
                <TableHead className="text-muted-foreground">Date</TableHead>
                <TableHead className="text-right text-muted-foreground">Total</TableHead>
                <TableHead className="text-right text-muted-foreground">Balance</TableHead>
                <TableHead className="w-[140px] text-right text-muted-foreground">Apply Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applyCreditLines.length === 0 ? (
                <TableRow className="border-border">
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    No Data
                  </TableCell>
                </TableRow>
              ) : (
                applyCreditLines.map((line, idx) => {
                  const invoice = customerInvoices.find((inv: any) => inv.id === line.invoice_id) as any
                  if (!invoice) return null
                  return (
                    <TableRow key={idx} className="border-border">
                      <TableCell className="text-center">
                        <input
                          type="checkbox"
                          checked={line.selected}
                          onChange={() => toggleApplyCredit(idx)}
                          className="h-4 w-4 rounded border-border"
                        />
                      </TableCell>
                      <TableCell className="text-sm text-foreground">{invoice.invoice_number || invoice.id}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{invoice.description || "-"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{invoice.invoice_date || invoice.issue_date || "-"}</TableCell>
                      <TableCell className="text-right text-sm font-medium text-foreground">
                        {currency} {(invoice.total ?? 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium text-foreground">
                        {currency} {(invoice.balance ?? invoice.total ?? 0).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={line.apply_amount}
                          onChange={e => updateApplyAmount(idx, Number(e.target.value))}
                          disabled={!line.selected}
                          className="h-9 rounded-lg text-right text-sm"
                        />
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div className="mt-6 flex justify-end">
          <div className="w-full max-w-xs space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground">CREDIT TOTAL</span>
              <span className="font-semibold text-foreground">{currency} {total.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Credit Applied</span>
              <span className="font-medium text-foreground">{currency} {creditApplied.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Save/Cancel Footer */}
      <div className="flex items-center justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => navigate("/sales/credit-notes")}>Cancel</Button>
        <Button
          type="button"
          onClick={handleSave}
          disabled={createCreditNote.isPending || !contactId || !lineItems.some(li => li.description.trim()) || !linesValid}
          className="h-10 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {createCreditNote.isPending ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  )
}
