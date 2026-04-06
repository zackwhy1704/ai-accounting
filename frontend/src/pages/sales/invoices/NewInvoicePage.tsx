import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Plus, Trash2 } from "lucide-react"
import { useContacts, useAccounts, useCreateInvoice } from "../../../lib/hooks"
import { useTheme } from "../../../lib/theme"
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
}

type SaleType = "service" | "item"

const TABS = [
  { key: "billing", label: "Billing & Shipping" },
  { key: "general", label: "General Info" },
  { key: "items", label: "Items" },
  { key: "payment", label: "Payment Terms" },
  { key: "additional", label: "Additional Info" },
  { key: "attachments", label: "Attachments" },
  { key: "history", label: "History" },
] as const

type TabKey = (typeof TABS)[number]["key"]

export default function NewInvoicePage() {
  const navigate = useNavigate()
  const { t } = useTheme()
  const { data: contacts = [] } = useContacts()
  const { data: accounts = [] } = useAccounts()
  const createInvoice = useCreateInvoice()

  // Tab state
  const [activeTab, setActiveTab] = useState<TabKey>("items")

  // Sale type toggle
  const [saleType, setSaleType] = useState<SaleType>("item")

  // Top fields
  const [contactId, setContactId] = useState("")
  const [lhdnName, setLhdnName] = useState("")
  const [terms, setTerms] = useState("cbd")
  const [taxInclusive, setTaxInclusive] = useState(true)
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [customerPo, setCustomerPo] = useState("")
  const [digitalRef, setDigitalRef] = useState("")

  // Line items
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: "", account_id: "", quantity: 1, unit_price: 0, amount: 0, discount: 0, tax_rate: 0 },
  ])

  // Totals
  const [discountGiven, setDiscountGiven] = useState(0)
  const [roundingAdjustment, setRoundingAdjustment] = useState(false)
  const [roundingAmount, setRoundingAmount] = useState(0)

  // Bottom
  const [journalMemo, setJournalMemo] = useState("")
  const [quickShareEmail, setQuickShareEmail] = useState(false)

  // Line item helpers
  const updateLineItem = (index: number, field: keyof LineItem, value: string | number) => {
    setLineItems(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
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
      { description: "", account_id: "", quantity: 1, unit_price: 0, amount: 0, discount: 0, tax_rate: 0 },
    ])
  }

  const removeLineItem = (index: number) => {
    setLineItems(prev => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))
  }

  // Calculations
  const subTotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
  const totalLineDiscount = lineItems.reduce((sum, item) => {
    const lineTotal = item.quantity * item.unit_price
    return sum + (lineTotal * item.discount) / 100
  }, 0)
  const afterDiscount = subTotal - totalLineDiscount - discountGiven
  const roundingDiff = roundingAdjustment ? roundingAmount : 0
  const total = afterDiscount + roundingDiff
  const appliedToDate = 0
  const balanceDue = total - appliedToDate

  const handleSave = async () => {
    try {
      await createInvoice.mutateAsync({
        contact_id: contactId,
        lhdn_name: lhdnName,
        terms,
        tax_inclusive: taxInclusive,
        invoice_date: invoiceDate,
        customer_po: customerPo,
        digital_ref: digitalRef,
        sale_type: saleType,
        discount_given: discountGiven,
        rounding_adjustment: roundingAdjustment,
        rounding_amount: roundingAmount,
        journal_memo: journalMemo,
        quick_share_email: quickShareEmail,
        line_items: lineItems,
        sub_total: subTotal,
        total,
      })
      navigate("/sales/invoices")
    } catch {
      // error handled by mutation
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="text-xs text-muted-foreground">{t("invoices.category") || "Sales"}</div>
        <div className="text-2xl font-semibold tracking-tight text-foreground">{t("invoices.new") || "New Invoice"}</div>
      </div>

      {/* Sale Type Toggle */}
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="saleType"
            checked={saleType === "service"}
            onChange={() => setSaleType("service")}
            className="h-4 w-4 accent-blue-500"
          />
          <span className="text-sm font-medium text-foreground">Service Sale</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="saleType"
            checked={saleType === "item"}
            onChange={() => setSaleType("item")}
            className="h-4 w-4 accent-blue-500"
          />
          <span className="text-sm font-medium text-foreground">Item Sale</span>
        </label>
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
        <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
          {/* Top fields - Row 1 */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Customer</label>
              <Select value={contactId} onValueChange={v => v === "__add_new__" ? navigate("/contacts/new") : setContactId(v)}>
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
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">LHDN Name</label>
              <Input
                value={lhdnName}
                onChange={e => setLhdnName(e.target.value)}
                placeholder="LHDN registered name"
                className="h-10 rounded-xl"
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

            <div className="flex items-end pb-1">
              <div className="flex items-center gap-2">
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
          </div>

          {/* Top fields - Row 2 */}
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

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Digital Ref</label>
              <Input
                value={digitalRef}
                onChange={e => setDigitalRef(e.target.value)}
                placeholder="Digital reference"
                className="h-10 rounded-xl"
              />
            </div>
          </div>

          {/* Line items table */}
          <div className="mt-6 overflow-x-auto rounded-2xl border border-border">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="w-10 text-center text-muted-foreground">#</TableHead>
                  <TableHead className="min-w-[200px] text-muted-foreground">Rate (Description)</TableHead>
                  <TableHead className="w-[160px] text-muted-foreground">Account</TableHead>
                  {saleType === "item" && (
                    <>
                      <TableHead className="w-[80px] text-muted-foreground">Quantity</TableHead>
                      <TableHead className="w-[110px] text-muted-foreground">Std Price</TableHead>
                    </>
                  )}
                  <TableHead className="w-[110px] text-right text-muted-foreground">{t("common.amount") || "Amount"}</TableHead>
                  <TableHead className="w-[80px] text-muted-foreground">Discount</TableHead>
                  <TableHead className="w-[80px] text-muted-foreground">Tax</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineItems.map((item, idx) => (
                  <TableRow key={idx} className="border-border">
                    <TableCell className="text-center text-xs text-muted-foreground">{idx + 1}</TableCell>
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
                    {saleType === "item" && (
                      <>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            value={item.quantity}
                            onChange={e => updateLineItem(idx, "quantity", Number(e.target.value))}
                            className="h-9 rounded-lg border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-1"
                          />
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
                      </>
                    )}
                    <TableCell className="text-right text-sm font-medium text-foreground">
                      {saleType === "service"
                        ? (item.unit_price - (item.unit_price * item.discount) / 100).toFixed(2)
                        : item.amount.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={item.discount}
                        onChange={e => updateLineItem(idx, "discount", Number(e.target.value))}
                        className="h-9 rounded-lg border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-1"
                        placeholder="%"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        value={item.tax_rate}
                        onChange={e => updateLineItem(idx, "tax_rate", Number(e.target.value))}
                        className="h-9 rounded-lg border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-1"
                        placeholder="%"
                      />
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
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Add item + Add product */}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={addLineItem}
              className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white shadow-sm hover:opacity-95"
            >
              <Plus className="mr-1.5 h-4 w-4" /> Item
            </Button>

            <Select>
              <SelectTrigger className="h-9 w-48 rounded-xl text-xs">
                <SelectValue placeholder="Add Product..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="placeholder">No products available</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Totals */}
          <div className="mt-6 flex justify-end">
            <div className="w-full max-w-xs space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Sub Total</span>
                <span className="font-medium text-foreground">RM {subTotal.toFixed(2)}</span>
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
                  placeholder="RM"
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
                {roundingAdjustment ? (
                  <Input
                    type="number"
                    step={0.01}
                    value={roundingAmount}
                    onChange={e => setRoundingAmount(Number(e.target.value))}
                    className="h-8 w-28 rounded-lg text-right text-sm"
                    placeholder="RM"
                  />
                ) : (
                  <span className="font-medium text-foreground">0.00</span>
                )}
              </div>
              <div className="border-t border-border pt-2">
                <div className="flex items-center justify-between text-base font-bold">
                  <span className="text-foreground">TOTAL</span>
                  <span className="text-foreground">RM {total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom section */}
          <div className="mt-6 border-t border-border pt-4 space-y-4">
            {/* Journal/Memo */}
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

            {/* Applied to Date / Balance Due */}
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

            {/* Invoice Delivery Status */}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Invoice Delivery Status:</span>
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                Not Sent
              </span>
            </div>

            {/* QuickShare + Save */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={quickShareEmail}
                  onChange={e => setQuickShareEmail(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                QuickShare via Email
              </label>

              <Button type="button" variant="outline" onClick={() => navigate("/sales/invoices")}>Cancel</Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={createInvoice.isPending}
                className="h-10 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 text-sm font-semibold text-white shadow-sm hover:opacity-95"
              >
                {createInvoice.isPending ? "Saving..." : t("form.save") || "Save"}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Billing & Shipping Tab */}
      {activeTab === "billing" && (
        <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
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
        <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
          <div className="max-w-lg space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Title</label>
              <Input placeholder="Invoice title" className="h-10 rounded-xl" />
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

      {/* Payment Terms Tab */}
      {activeTab === "payment" && (
        <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
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
      )}

      {/* Additional Info Tab */}
      {activeTab === "additional" && (
        <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
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
      )}

      {/* Attachments Tab */}
      {activeTab === "attachments" && (
        <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
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

      {/* History Tab */}
      {activeTab === "history" && (
        <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="text-sm text-muted-foreground">No history available for this invoice yet.</div>
            <div className="mt-1 text-xs text-muted-foreground">History will appear here once the invoice is saved.</div>
          </div>
        </Card>
      )}
    </div>
  )
}
