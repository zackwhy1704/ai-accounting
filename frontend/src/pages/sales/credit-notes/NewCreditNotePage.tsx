import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Plus, Trash2 } from "lucide-react"
import { useContacts, useAccounts, useInvoices, useCreateCreditNote, useTaxRates } from "../../../lib/hooks"
import { Card } from "../../../components/ui/card"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table"

interface LineItem {
  description: string
  account_id: string
  quantity: number
  unit_price: number
  amount: number
  discount: number
  tax_rate: number
  line_type: "goods" | "services"
  tax_code_id: string
}

interface ApplyCreditLine {
  invoice_id: string
  selected: boolean
  apply_amount: number
}

const TABS = [
  { key: "billing", label: "Billing & Shipping" },
  { key: "general", label: "General Info" },
  { key: "items", label: "Items" },
  { key: "apply_credit", label: "Apply Credit" },
  { key: "additional", label: "Additional Info" },
  { key: "attachments", label: "Attachments" },
] as const

type TabKey = (typeof TABS)[number]["key"]

export default function NewCreditNotePage() {
  const navigate = useNavigate()
  const { data: contacts = [] } = useContacts()
  const { data: accounts = [] } = useAccounts()
  const { data: invoices = [] } = useInvoices()
  const createCreditNote = useCreateCreditNote()
  const { data: taxRates = [] } = useTaxRates()

  const [activeTab, setActiveTab] = useState<TabKey>("items")
  const [contactId, setContactId] = useState("")
  const [creditNoteDate, setCreditNoteDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [reference, setReference] = useState("")
  const [currency, setCurrency] = useState("MYR")
  const [taxInclusive, setTaxInclusive] = useState(false)
  const [discountGiven, setDiscountGiven] = useState(0)
  const [roundingAdjustment, setRoundingAdjustment] = useState(false)
  const [quickShareEmail, setQuickShareEmail] = useState(false)
  const [lineItems, setLineItems] = useState<LineItem[]>([])
  const [applyCreditLines, setApplyCreditLines] = useState<ApplyCreditLine[]>([])

  // Filter invoices for the selected customer
  const customerInvoices = invoices.filter(
    (inv: any) => inv.contact_id === contactId
  )

  // When customer changes, rebuild apply credit lines from their invoices
  const handleContactChange = (id: string) => {
    setContactId(id)
    const custInvoices = invoices.filter((inv: any) => inv.contact_id === id)
    setApplyCreditLines(
      custInvoices.map((inv: any) => ({
        invoice_id: inv.id,
        selected: false,
        apply_amount: 0,
      }))
    )
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
      const lineTotal = item.quantity * item.unit_price
      const afterDiscount = lineTotal - (lineTotal * item.discount) / 100
      const tax = taxInclusive ? 0 : (afterDiscount * item.tax_rate) / 100
      updated[index].amount = afterDiscount + tax
      return updated
    })
  }

  const addLineItem = () => {
    setLineItems(prev => [
      ...prev,
      { description: "", account_id: "", quantity: 1, unit_price: 0, amount: 0, discount: 0, tax_rate: 0, line_type: "goods", tax_code_id: "" },
    ])
  }

  const removeLineItem = (index: number) => {
    setLineItems(prev => prev.filter((_, i) => i !== index))
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

  const subTotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
  const totalDiscount =
    lineItems.reduce((sum, item) => {
      const lineTotal = item.quantity * item.unit_price
      return sum + (lineTotal * item.discount) / 100
    }, 0) + discountGiven
  const rawTotal = subTotal - totalDiscount
  const total = roundingAdjustment ? Math.round(rawTotal * 20) / 20 : rawTotal
  const roundingDiff = roundingAdjustment ? total - rawTotal : 0

  const creditApplied = applyCreditLines.reduce((sum, line) => sum + (line.selected ? line.apply_amount : 0), 0)

  const handleSave = async () => {
    try {
      await createCreditNote.mutateAsync({
        contact_id: contactId,
        credit_note_date: creditNoteDate,
        reference,
        currency,
        tax_inclusive: taxInclusive,
        discount_given: discountGiven,
        rounding_adjustment: roundingAdjustment,
        quick_share_email: quickShareEmail,
        line_items: lineItems,
        apply_credit_lines: applyCreditLines.filter(l => l.selected),
        sub_total: subTotal,
        total,
        credit_applied: creditApplied,
      })
      navigate("/sales/credit-notes")
    } catch {
      // error handled by mutation
    }
  }

  const cardClass = "rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]"

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="text-xs text-muted-foreground">Sales</div>
        <div className="text-2xl font-semibold tracking-tight text-foreground">New Credit Note</div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-6 border-b border-border">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`pb-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "border-b-2 border-blue-500 text-blue-600"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Items Tab */}
      {activeTab === "items" && (
        <Card className={cardClass}>
          {/* Top fields */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Customer</label>
              <Select value={contactId} onValueChange={v => v === "__add_new__" ? navigate("/contacts/new") : handleContactChange(v)}>
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {contacts
                    .filter((c: any) => c.type === "customer" || c.type === "both")
                    .map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  <SelectItem value="__add_new__" className="text-primary font-medium">+ Add New Customer</SelectItem>
                </SelectContent>
              </Select>
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
          </div>

          {/* Currency + Tax toggle */}
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <div className="w-36">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Currency</label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue />
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

            <div className="flex items-center gap-2 pt-5">
              <button
                type="button"
                onClick={() => setTaxInclusive(!taxInclusive)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  taxInclusive ? "bg-blue-500" : "bg-gray-300"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    taxInclusive ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </button>
              <span className="text-xs font-medium text-muted-foreground">
                {taxInclusive ? "Tax Inclusive" : "Tax Exclusive"}
              </span>
            </div>
          </div>

          {/* Add item button */}
          <div className="mt-4">
            <Button
              type="button"
              onClick={addLineItem}
              className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white shadow-sm hover:opacity-95"
            >
              <Plus className="mr-1.5 h-4 w-4" /> Item
            </Button>
          </div>

          {/* Line items table */}
          <div className="mt-4 overflow-x-auto rounded-2xl border border-border">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="w-10 text-center text-muted-foreground">#</TableHead>
                  <TableHead className="w-[100px] text-muted-foreground">Type</TableHead>
                  <TableHead className="min-w-[200px] text-muted-foreground">Description</TableHead>
                  <TableHead className="w-[160px] text-muted-foreground">Account</TableHead>
                  <TableHead className="w-[80px] text-muted-foreground">Qty</TableHead>
                  <TableHead className="w-[110px] text-muted-foreground">Unit Price</TableHead>
                  <TableHead className="w-[110px] text-right text-muted-foreground">Amount</TableHead>
                  <TableHead className="w-[80px] text-muted-foreground">Disc %</TableHead>
                  <TableHead className="w-[120px] text-muted-foreground">Tax Code</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineItems.length === 0 ? (
                  <TableRow className="border-border">
                    <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                      No Data
                    </TableCell>
                  </TableRow>
                ) : (
                  lineItems.map((item, idx) => (
                    <TableRow key={idx} className="border-border">
                      <TableCell className="text-center text-xs text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell>
                        <Select value={item.line_type} onValueChange={v => updateLineItem(idx, "line_type", v)}>
                          <SelectTrigger className="h-9 rounded-lg border-0 bg-transparent shadow-none">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="goods">Goods</SelectItem>
                            <SelectItem value="services">Services</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          value={item.description}
                          onChange={e => updateLineItem(idx, "description", e.target.value)}
                          placeholder="Description"
                          className="h-9 rounded-lg border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-1"
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={item.account_id}
                          onValueChange={v => updateLineItem(idx, "account_id", v)}
                        >
                          <SelectTrigger className="h-9 rounded-lg border-0 bg-transparent shadow-none">
                            <SelectValue placeholder="Account" />
                          </SelectTrigger>
                          <SelectContent>
                            {accounts.map((a: any) => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {item.line_type === "services" ? (
                          <span className="px-1 text-sm text-muted-foreground">&mdash;</span>
                        ) : (
                          <Input
                            type="number"
                            min={0}
                            value={item.quantity}
                            onChange={e => updateLineItem(idx, "quantity", Number(e.target.value))}
                            className="h-9 rounded-lg border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-1"
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={item.unit_price}
                          onChange={e => updateLineItem(idx, "unit_price", Number(e.target.value))}
                          className="h-9 rounded-lg border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-1"
                        />
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium text-foreground">
                        {item.amount.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={item.discount}
                          onChange={e => updateLineItem(idx, "discount", Number(e.target.value))}
                          className="h-9 rounded-lg border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-1"
                        />
                      </TableCell>
                      <TableCell>
                        <Select value={item.tax_code_id} onValueChange={v => updateLineItem(idx, "tax_code_id", v)}>
                          <SelectTrigger className="h-9 rounded-lg border-0 bg-transparent shadow-none">
                            <SelectValue placeholder="Tax Code" />
                          </SelectTrigger>
                          <SelectContent>
                            {taxRates.map((tc: any) => (
                              <SelectItem key={tc.id} value={tc.id}>
                                {tc.code} ({tc.rate}%)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => removeLineItem(idx)}
                          className="text-muted-foreground hover:text-rose-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Totals */}
          <div className="mt-6 flex justify-end">
            <div className="w-full max-w-xs space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Sub Total</span>
                <span className="font-medium text-foreground">{currency} {subTotal.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Discount Given</span>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={discountGiven}
                  onChange={e => setDiscountGiven(Number(e.target.value))}
                  className="h-8 w-28 rounded-lg text-right text-sm"
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Rounding Adjustment</span>
                  <button
                    type="button"
                    onClick={() => setRoundingAdjustment(!roundingAdjustment)}
                    className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
                      roundingAdjustment ? "bg-blue-500" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                        roundingAdjustment ? "translate-x-3.5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>
                <span className="font-medium text-foreground">{currency} {roundingDiff >= 0 ? "" : "-"}{Math.abs(roundingDiff).toFixed(2)}</span>
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
      )}

      {/* Apply Credit Tab */}
      {activeTab === "apply_credit" && (
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

          {/* Credit totals */}
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
      )}

      {/* Billing & Shipping Tab */}
      {activeTab === "billing" && (
        <Card className={cardClass}>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <h3 className="mb-4 text-sm font-semibold text-foreground">Billing Address</h3>
              <div className="space-y-3">
                <Input placeholder="Address Line 1" className="h-10 rounded-xl" />
                <Input placeholder="Address Line 2" className="h-10 rounded-xl" />
                <div className="grid grid-cols-2 gap-3">
                  <Input placeholder="City" className="h-10 rounded-xl" />
                  <Input placeholder="State" className="h-10 rounded-xl" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input placeholder="Postcode" className="h-10 rounded-xl" />
                  <Input placeholder="Country" className="h-10 rounded-xl" />
                </div>
              </div>
            </div>
            <div>
              <h3 className="mb-4 text-sm font-semibold text-foreground">Shipping Address</h3>
              <div className="space-y-3">
                <Input placeholder="Address Line 1" className="h-10 rounded-xl" />
                <Input placeholder="Address Line 2" className="h-10 rounded-xl" />
                <div className="grid grid-cols-2 gap-3">
                  <Input placeholder="City" className="h-10 rounded-xl" />
                  <Input placeholder="State" className="h-10 rounded-xl" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input placeholder="Postcode" className="h-10 rounded-xl" />
                  <Input placeholder="Country" className="h-10 rounded-xl" />
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* General Info Tab */}
      {activeTab === "general" && (
        <Card className={cardClass}>
          <div className="max-w-lg space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Title</label>
              <Input placeholder="Credit note title" className="h-10 rounded-xl" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Summary</label>
              <textarea
                placeholder="Brief summary..."
                rows={3}
                className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
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
      )}

      {/* Additional Info Tab */}
      {activeTab === "additional" && (
        <Card className={cardClass}>
          <div className="max-w-lg space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Footer Note</label>
              <textarea
                placeholder="Appears at the bottom of the credit note..."
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
      )}

      {/* Attachments Tab */}
      {activeTab === "attachments" && (
        <Card className={cardClass}>
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border px-6 py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <Plus className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="mt-4 text-sm font-medium text-foreground">Drop files here or click to upload</div>
            <div className="mt-1 text-xs text-muted-foreground">PDF, JPG, PNG up to 10MB</div>
            <Button type="button" variant="secondary" className="mt-4 h-9 rounded-xl px-4 text-xs font-semibold">
              Browse Files
            </Button>
          </div>
        </Card>
      )}

      {/* Footer actions - always visible */}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={quickShareEmail}
            onChange={e => setQuickShareEmail(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          QuickShare via Email
        </label>

        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" onClick={() => navigate("/sales/credit-notes")}>Cancel</Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={createCreditNote.isPending}
            className="h-10 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 text-sm font-semibold text-white shadow-sm hover:opacity-95"
          >
            {createCreditNote.isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </div>
  )
}
