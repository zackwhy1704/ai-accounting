import { useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { useContacts, useAccounts, useCreditNotes, useCreateSalesRefund } from "../../../lib/hooks"
import { formatCurrency } from "../../../lib/utils"
import { Card } from "../../../components/ui/card"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select"

const refundMethods = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "online_payment", label: "Online Payment" },
]

export default function NewRefundPage() {
  const navigate = useNavigate()
  const { data: contacts = [] } = useContacts()
  const { data: accounts = [] } = useAccounts()
  const { data: creditNotes = [] } = useCreditNotes()
  const createRefund = useCreateSalesRefund()

  const [contactId, setContactId] = useState("")
  const [refundDate, setRefundDate] = useState(new Date().toISOString().slice(0, 10))
  const [refundMethod, setRefundMethod] = useState("")
  const [reference, setReference] = useState("")
  const [bankAccountId, setBankAccountId] = useState("")
  const [creditNoteId, setCreditNoteId] = useState("")
  const [amount, setAmount] = useState("")
  const [currency, setCurrency] = useState("MYR")
  const [notes, setNotes] = useState("")

  const bankAccounts = useMemo(
    () => accounts.filter((a) => a.type === "bank" || a.type === "cash"),
    [accounts]
  )

  const filteredCreditNotes = useMemo(
    () => (contactId ? creditNotes.filter((cn) => cn.contact_id === contactId) : []),
    [creditNotes, contactId]
  )

  const handleSave = () => {
    if (!contactId || !refundDate || !refundMethod || !amount) return

    createRefund.mutate(
      {
        contact_id: contactId,
        refund_date: refundDate,
        refund_method: refundMethod,
        reference: reference || null,
        bank_account_id: bankAccountId || null,
        credit_note_id: creditNoteId || null,
        amount: parseFloat(amount),
        currency,
        notes: notes || null,
      },
      {
        onSuccess: () => navigate("/sales/refunds"),
      }
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">New Refund</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Process a refund to a customer
        </p>
      </div>

      <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="grid gap-5">
          {/* Customer */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Customer</label>
            <Select value={contactId} onValueChange={v => v === "__add_new__" ? navigate("/contacts/new") : setContactId(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select customer" />
              </SelectTrigger>
              <SelectContent>
                {contacts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
                <SelectItem value="__add_new__" className="text-primary font-medium">+ Add New Customer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Refund Date */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Refund Date</label>
            <Input
              type="date"
              value={refundDate}
              onChange={(e) => setRefundDate(e.target.value)}
            />
          </div>

          {/* Refund Method */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Refund Method</label>
            <Select value={refundMethod} onValueChange={setRefundMethod}>
              <SelectTrigger>
                <SelectValue placeholder="Select refund method" />
              </SelectTrigger>
              <SelectContent>
                {refundMethods.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Reference */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Reference</label>
            <Input
              placeholder="e.g. REF-001"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>

          {/* Bank Account */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Bank Account</label>
            <Select value={bankAccountId} onValueChange={setBankAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Select bank account" />
              </SelectTrigger>
              <SelectContent>
                {bankAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.code} - {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Linked Credit Note */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Linked Credit Note
            </label>
            <Select
              value={creditNoteId}
              onValueChange={setCreditNoteId}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={contactId ? "Select credit note" : "Select a customer first"}
                />
              </SelectTrigger>
              <SelectContent>
                {filteredCreditNotes.map((cn) => (
                  <SelectItem key={cn.id} value={cn.id}>
                    {cn.credit_note_number} ({formatCurrency(cn.total, cn.currency)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Amount */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Amount</label>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          {/* Currency */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Currency</label>
            <Input
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Notes</label>
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Additional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        {/* Save Button */}
        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate("/sales/refunds")}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={createRefund.isPending || !contactId || !refundDate || !refundMethod || !amount}
            className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-md hover:from-emerald-600 hover:to-emerald-700"
          >
            {createRefund.isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </Card>
    </div>
  )
}
