import { useState, useEffect, useRef, useMemo } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { useSalesRefund, useUpdateSalesRefund, useContacts, useAccounts, useCreditNotes } from "../../../lib/hooks"
import { formatCurrency } from "../../../lib/utils"
import { Card } from "../../../components/ui/card"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select"
import { SearchableSelect } from "../../../components/ui/searchable-select"

const refundMethods = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "online_payment", label: "Online Payment" },
]

export default function EditRefundPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: refund, isLoading } = useSalesRefund(id)
  const { data: contacts = [] } = useContacts()
  const { data: accounts = [] } = useAccounts()
  const { data: creditNotes = [] } = useCreditNotes()
  const updateRefund = useUpdateSalesRefund()
  const populated = useRef(false)

  const [refundNumber, setRefundNumber] = useState("")
  const [contactId, setContactId] = useState("")
  const [refundDate, setRefundDate] = useState(new Date().toISOString().slice(0, 10))
  const [refundMethod, setRefundMethod] = useState("")
  const [reference, setReference] = useState("")
  const [bankAccountId, setBankAccountId] = useState("")
  const [creditNoteId, setCreditNoteId] = useState("")
  const [amount, setAmount] = useState("")
  const [currency, setCurrency] = useState("MYR")
  const [notes, setNotes] = useState("")

  useEffect(() => {
    if (!refund || populated.current) return
    setRefundNumber(refund.refund_number ?? "")
    setContactId(String(refund.contact_id ?? ""))
    setRefundDate(refund.refund_date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10))
    setRefundMethod(refund.refund_method ?? "")
    setReference(refund.reference ?? "")
    setBankAccountId(String(refund.bank_account_id ?? ""))
    setCreditNoteId(String(refund.credit_note_id ?? ""))
    setAmount(String(refund.amount ?? ""))
    setCurrency(refund.currency ?? "MYR")
    setNotes(refund.notes ?? "")
    populated.current = true
  }, [refund])

  const bankAccounts = useMemo(
    () => accounts.filter((a: any) => a.type === "bank" || a.type === "cash"),
    [accounts]
  )

  const filteredCreditNotes = useMemo(
    () => (contactId
      ? creditNotes.filter((cn: any) =>
          String(cn.contact_id) === String(contactId) &&
          cn.status !== "void"
        )
      : []),
    [creditNotes, contactId]
  )

  const handleSave = () => {
    if (!contactId || !refundDate || !refundMethod || !amount) return

    updateRefund.mutate(
      {
        id,
        contact_id: contactId,
        refund_number: refundNumber || undefined,
        refund_date: refundDate,
        refund_method: refundMethod,
        reference: reference || null,
        bank_account_id: bankAccountId || null,
        credit_note_id: creditNoteId || null,
        amount: parseFloat(amount),
        currency,
        notes: notes || null,
      } as any,
      { onSuccess: () => navigate("/sales/refunds") }
    )
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!refund) {
    return <div className="p-6 text-muted-foreground">Refund not found.</div>
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Edit Refund</h1>
        <p className="mt-1 text-sm text-muted-foreground">Edit refund details for this customer</p>
      </div>

      <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="grid gap-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Refund #</label>
            <Input value={refundNumber} onChange={e => setRefundNumber(e.target.value)} placeholder="Auto-generated (REF-0001)" />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Customer</label>
            <SearchableSelect
              value={contactId}
              onChange={setContactId}
              placeholder="Search or select customer"
              options={contacts
                .filter((c: any) => c.type === "customer" || c.type === "both")
                .map((c: any) => ({ value: c.id, label: c.name, hint: c.email ?? "" }))}
              footerAction={{ label: "+ Add New Customer", onClick: () => navigate("/contacts/new") }}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Refund Date</label>
            <Input type="date" value={refundDate} onChange={e => setRefundDate(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Refund Method</label>
            <Select value={refundMethod} onValueChange={setRefundMethod}>
              <SelectTrigger><SelectValue placeholder="Select refund method" /></SelectTrigger>
              <SelectContent>
                {refundMethods.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Reference</label>
            <Input placeholder="e.g. REF-001" value={reference} onChange={e => setReference(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Bank Account</label>
            <SearchableSelect
              value={bankAccountId}
              onChange={setBankAccountId}
              placeholder="Search or select bank account"
              options={bankAccounts.map((a: any) => ({
                value: a.id,
                label: a.account_number ? `${a.name} (${a.account_number})` : a.name,
                hint: a.account_number ?? "",
              }))}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Linked Credit Note</label>
            <SearchableSelect
              value={creditNoteId}
              onChange={setCreditNoteId}
              placeholder={contactId ? "Search credit note" : "Select a customer first"}
              allowClear
              options={filteredCreditNotes.map((cn: any) => ({
                value: cn.id,
                label: `${cn.credit_note_number} (${formatCurrency(cn.total, cn.currency)})`,
                hint: cn.reference ?? "",
              }))}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Amount</label>
            <Input type="number" min="0" step="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Currency</label>
            <Input value={currency} onChange={e => setCurrency(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Notes</label>
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              placeholder="Additional notes..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate("/sales/refunds")}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={updateRefund.isPending || !contactId || !refundDate || !refundMethod || !amount || parseFloat(amount) <= 0}
            className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-md hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {updateRefund.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </Card>
    </div>
  )
}
