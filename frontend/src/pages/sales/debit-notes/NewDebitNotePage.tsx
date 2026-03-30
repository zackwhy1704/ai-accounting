import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Plus, Trash2 } from "lucide-react"
import { useContacts, useAccounts, useInvoices, useCreateDebitNote } from "../../../lib/hooks"
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
}

const emptyLine = (): LineItem => ({
  id: crypto.randomUUID(),
  description: "",
  accountId: "",
  quantity: 1,
  unitPrice: 0,
  taxRate: 0,
})

const tabs = [
  { label: "Billing & Shipping", value: "billing" },
  { label: "General Info", value: "general" },
  { label: "Items", value: "items" },
  { label: "Additional Info", value: "additional" },
  { label: "Attachments", value: "attachments" },
]

export default function NewDebitNotePage() {
  const navigate = useNavigate()
  const { data: contacts = [] } = useContacts()
  const { data: accounts = [] } = useAccounts()
  const { data: invoices = [] } = useInvoices()
  const createDebitNote = useCreateDebitNote()

  const [activeTab, setActiveTab] = useState("items")
  const [customerId, setCustomerId] = useState("")
  const [linkedInvoiceId, setLinkedInvoiceId] = useState("")
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [reference, setReference] = useState("")
  const [lines, setLines] = useState<LineItem[]>([emptyLine()])
  const [discountGiven, setDiscountGiven] = useState(0)
  const [roundingAdjustment, setRoundingAdjustment] = useState(0)
  const [quickShareEmail, setQuickShareEmail] = useState(false)

  const customers = contacts.filter(c => c.type === "customer" || c.type === "both")
  const filteredInvoices = customerId
    ? invoices.filter((inv: any) => inv.contact_id === customerId)
    : invoices

  const updateLine = (id: string, field: keyof LineItem, value: any) => {
    setLines(prev => prev.map(l => (l.id === id ? { ...l, [field]: value } : l)))
  }

  const removeLine = (id: string) => {
    setLines(prev => (prev.length === 1 ? prev : prev.filter(l => l.id !== id)))
  }

  const subTotal = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0)
  const total = subTotal - discountGiven + roundingAdjustment

  const handleSave = () => {
    createDebitNote.mutate(
      {
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
        })),
        discount_given: discountGiven,
        rounding_adjustment: roundingAdjustment,
        quick_share_email: quickShareEmail,
      } as any,
      { onSuccess: () => navigate("/sales/debit-notes") }
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Sales</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">New Debit Note</div>
        <div className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Create a debit note to increase the original invoice amount.
        </div>
      </div>

      <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        {/* Tabs */}
        <div className="flex gap-1 rounded-xl bg-muted p-1">
          {tabs.map(tb => (
            <button
              key={tb.value}
              type="button"
              onClick={() => setActiveTab(tb.value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === tb.value
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {/* Items Tab Content */}
        {activeTab === "items" && (
          <div className="mt-6 flex flex-col gap-6">
            {/* Header fields */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Customer</label>
                <Select value={customerId} onValueChange={v => { setCustomerId(v); setLinkedInvoiceId("") }}>
                  <SelectTrigger className="mt-1.5 h-10 rounded-xl">
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Linked Invoice</label>
                <Select value={linkedInvoiceId} onValueChange={setLinkedInvoiceId}>
                  <SelectTrigger className="mt-1.5 h-10 rounded-xl">
                    <SelectValue placeholder="Select invoice" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredInvoices.map((inv: any) => (
                      <SelectItem key={inv.id} value={inv.id}>
                        {inv.invoice_number}
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

            {/* Line items table */}
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="w-[50px] text-muted-foreground">#</TableHead>
                    <TableHead className="text-muted-foreground">Description</TableHead>
                    <TableHead className="w-[180px] text-muted-foreground">Account</TableHead>
                    <TableHead className="w-[100px] text-muted-foreground">Quantity</TableHead>
                    <TableHead className="w-[130px] text-muted-foreground">Unit Price</TableHead>
                    <TableHead className="w-[130px] text-right text-muted-foreground">Amount</TableHead>
                    <TableHead className="w-[120px] text-muted-foreground">Tax</TableHead>
                    <TableHead className="w-[50px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line, idx) => (
                    <TableRow key={line.id} className="border-border hover:bg-muted/50">
                      <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell>
                        <Input
                          value={line.description}
                          onChange={e => updateLine(line.id, "description", e.target.value)}
                          placeholder="Item description"
                          className="h-9 rounded-lg border-0 bg-transparent px-2 text-sm shadow-none focus-visible:ring-1"
                        />
                      </TableCell>
                      <TableCell>
                        <Select value={line.accountId} onValueChange={v => updateLine(line.id, "accountId", v)}>
                          <SelectTrigger className="h-9 rounded-lg border-0 bg-transparent shadow-none focus:ring-1">
                            <SelectValue placeholder="Account" />
                          </SelectTrigger>
                          <SelectContent>
                            {accounts.map((a: any) => (
                              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          value={line.quantity}
                          onChange={e => updateLine(line.id, "quantity", Number(e.target.value))}
                          className="h-9 rounded-lg border-0 bg-transparent px-2 text-sm shadow-none focus-visible:ring-1"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={line.unitPrice}
                          onChange={e => updateLine(line.id, "unitPrice", Number(e.target.value))}
                          className="h-9 rounded-lg border-0 bg-transparent px-2 text-sm shadow-none focus-visible:ring-1"
                        />
                      </TableCell>
                      <TableCell className="text-right text-sm text-foreground">
                        {(line.quantity * line.unitPrice).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={line.taxRate}
                          onChange={e => updateLine(line.id, "taxRate", Number(e.target.value))}
                          placeholder="0%"
                          className="h-9 rounded-lg border-0 bg-transparent px-2 text-sm shadow-none focus-visible:ring-1"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => removeLine(line.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Add item button */}
            <div>
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-xl border-blue-300 px-3 text-xs font-semibold text-blue-600 hover:bg-blue-50"
                onClick={() => setLines(prev => [...prev, emptyLine()])}
              >
                <Plus className="mr-2 h-4 w-4" /> Item
              </Button>
            </div>

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-full max-w-sm flex flex-col gap-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Sub Total</span>
                  <span className="text-foreground">{subTotal.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
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
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Rounding Adjustment</span>
                  <Input
                    type="number"
                    step={0.01}
                    value={roundingAdjustment}
                    onChange={e => setRoundingAdjustment(Number(e.target.value))}
                    className="h-8 w-28 rounded-lg text-right text-sm"
                  />
                </div>
                <div className="border-t border-border pt-2 flex items-center justify-between text-sm font-semibold">
                  <span className="text-foreground">TOTAL</span>
                  <span className="text-foreground">{total.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Footer actions */}
            <div className="flex items-center justify-between border-t border-border pt-4">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={quickShareEmail}
                  onChange={e => setQuickShareEmail(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                QuickShare via Email
              </label>
              <Button
                type="button"
                onClick={handleSave}
                disabled={createDebitNote.isPending}
                className="h-9 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 text-xs font-semibold text-white shadow-sm hover:opacity-95"
              >
                Save
              </Button>
            </div>
          </div>
        )}

        {/* Billing & Shipping Tab */}
        {activeTab === "billing" && (
          <div className="mt-6 py-10 text-center text-sm text-muted-foreground">
            Billing &amp; Shipping details will appear here.
          </div>
        )}

        {/* General Info Tab */}
        {activeTab === "general" && (
          <div className="mt-6 py-10 text-center text-sm text-muted-foreground">
            General information will appear here.
          </div>
        )}

        {/* Additional Info Tab */}
        {activeTab === "additional" && (
          <div className="mt-6 py-10 text-center text-sm text-muted-foreground">
            Additional information will appear here.
          </div>
        )}

        {/* Attachments Tab */}
        {activeTab === "attachments" && (
          <div className="mt-6 py-10 text-center text-sm text-muted-foreground">
            Drag and drop files here or click to upload attachments.
          </div>
        )}
      </Card>
    </div>
  )
}
