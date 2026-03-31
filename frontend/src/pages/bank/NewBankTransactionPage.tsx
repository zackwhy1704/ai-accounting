import { useState } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import api from "../../lib/api"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"
import { useToast } from "../../components/ui/toast"

interface BankAccount {
  id: string
  name: string
  currency: string
}

interface Contact {
  id: string
  name: string
}

interface TransactionForm {
  transaction_date: string
  description: string
  amount: string
  bank_account_id: string
  contact_id: string
  reference_number: string
  payment_method: string
  category: string
  notes: string
}

const PAYMENT_METHODS = [
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "online_payment", label: "Online Payment" },
  { value: "fpx", label: "FPX" },
  { value: "card", label: "Card" },
]

export default function NewBankTransactionPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const type: "income" | "expense" = location.pathname.includes("money-in") ? "income" : "expense"
  const title = type === "income" ? "Money In" : "Money Out"
  const cancelPath = type === "income" ? "/bank/money-in" : "/bank/money-out"

  const today = new Date().toISOString().split("T")[0]

  const [form, setForm] = useState<TransactionForm>({
    transaction_date: today,
    description: "",
    amount: "",
    bank_account_id: "",
    contact_id: "",
    reference_number: "",
    payment_method: "bank_transfer",
    category: "",
    notes: "",
  })

  const set = (key: keyof TransactionForm) => (val: string) =>
    setForm(prev => ({ ...prev, [key]: val }))

  const { data: bankAccounts = [] } = useQuery<BankAccount[]>({
    queryKey: ["bank-accounts"],
    queryFn: async () => {
      const res = await api.get("/bank-accounts")
      return res.data
    },
  })

  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["contacts"],
    queryFn: async () => {
      const res = await api.get("/contacts")
      return res.data
    },
  })

  const mutation = useMutation({
    mutationFn: async (data: TransactionForm) => {
      const res = await api.post("/bank-transactions", {
        ...data,
        amount: parseFloat(data.amount),
        transaction_type: type,
        contact_id: data.contact_id || null,
      })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bank-transactions"] })
      toast(`${title} transaction created`, "success")
      navigate(cancelPath)
    },
    onError: () => toast("Failed to create transaction", "warning"),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.transaction_date || !form.description || !form.amount) return
    mutation.mutate(form)
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Bank</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">New {title}</div>
        <div className="mt-1 text-sm text-muted-foreground">
          {type === "income" ? "Record a payment received" : "Record a payment made"}
        </div>
      </div>

      <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Date <span className="text-rose-500">*</span>
              </label>
              <Input
                required
                type="date"
                value={form.transaction_date}
                onChange={e => set("transaction_date")(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Description <span className="text-rose-500">*</span>
              </label>
              <Input
                required
                placeholder="e.g. Payment from client"
                value={form.description}
                onChange={e => set("description")(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Amount <span className="text-rose-500">*</span>
              </label>
              <Input
                required
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={form.amount}
                onChange={e => set("amount")(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Bank Account</label>
              <Select value={form.bank_account_id} onValueChange={set("bank_account_id")}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {bankAccounts.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Contact (optional)</label>
              <Select value={form.contact_id} onValueChange={set("contact_id")}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select contact" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {contacts.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Reference No.</label>
              <Input
                placeholder="e.g. INV-001"
                value={form.reference_number}
                onChange={e => set("reference_number")(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Payment Method</label>
              <Select value={form.payment_method} onValueChange={set("payment_method")}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Category</label>
              <Input
                placeholder="e.g. Sales Revenue"
                value={form.category}
                onChange={e => set("category")(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Notes</label>
            <textarea
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              rows={3}
              placeholder="Additional notes..."
              value={form.notes}
              onChange={e => set("notes")(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              className="h-9 rounded-xl px-4 text-xs font-semibold"
              onClick={() => navigate(-1)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending || !form.transaction_date || !form.description || !form.amount}
              className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-4 text-xs font-semibold text-white"
            >
              {mutation.isPending ? "Saving..." : "Save Transaction"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
