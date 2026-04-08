import { useState, useEffect, useRef } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { useBankTransfer, useUpdateBankTransfer } from "../../lib/hooks"
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

interface TransferForm {
  transfer_date: string
  from_account_id: string
  to_account_id: string
  amount: string
  reference_number: string
  notes: string
}

export default function EditBankTransferPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data } = useBankTransfer(id)
  const updateMutation = useUpdateBankTransfer()

  const [form, setForm] = useState<TransferForm>({
    transfer_date: new Date().toISOString().split("T")[0],
    from_account_id: "",
    to_account_id: "",
    amount: "",
    reference_number: "",
    notes: "",
  })

  const populated = useRef(false)
  useEffect(() => {
    if (data && !populated.current) {
      populated.current = true
      setForm({
        transfer_date: data.transfer_date ? data.transfer_date.slice(0, 10) : new Date().toISOString().split("T")[0],
        from_account_id: data.from_account_id || "",
        to_account_id: data.to_account_id || "",
        amount: data.amount != null ? String(data.amount) : "",
        reference_number: data.reference_number || "",
        notes: data.notes || "",
      })
    }
  }, [data])

  const set = (key: keyof TransferForm) => (val: string) =>
    setForm(prev => ({ ...prev, [key]: val }))

  const { data: bankAccounts = [] } = useQuery<BankAccount[]>({
    queryKey: ["bank-accounts"],
    queryFn: async () => {
      const res = await api.get("/bank-accounts")
      return res.data
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.transfer_date || !form.from_account_id || !form.to_account_id || !form.amount) return
    updateMutation.mutate(
      {
        id,
        ...form,
        amount: parseFloat(form.amount),
      },
      {
        onSuccess: () => {
          toast("Transfer updated", "success")
          navigate("/bank/transfers")
        },
        onError: () => toast("Failed to update transfer", "warning"),
      }
    )
  }

  const isValid =
    form.transfer_date &&
    form.from_account_id &&
    form.to_account_id &&
    form.amount &&
    form.from_account_id !== form.to_account_id

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Bank</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Edit Bank Transfer</div>
        <div className="mt-1 text-sm text-muted-foreground">Update this fund transfer between accounts</div>
      </div>

      <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Transfer Date <span className="text-rose-500">*</span>
              </label>
              <Input
                required
                type="date"
                value={form.transfer_date}
                onChange={e => set("transfer_date")(e.target.value)}
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
              <label className="text-sm font-medium text-foreground">
                From Account <span className="text-rose-500">*</span>
              </label>
              <Select value={form.from_account_id} onValueChange={set("from_account_id")}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {bankAccounts.map(a => (
                    <SelectItem key={a.id} value={a.id} disabled={a.id === form.to_account_id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                To Account <span className="text-rose-500">*</span>
              </label>
              <Select value={form.to_account_id} onValueChange={set("to_account_id")}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {bankAccounts.map(a => (
                    <SelectItem key={a.id} value={a.id} disabled={a.id === form.from_account_id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Reference No.</label>
              <Input
                placeholder="e.g. TRF-001"
                value={form.reference_number}
                onChange={e => set("reference_number")(e.target.value)}
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

          {form.from_account_id && form.to_account_id && form.from_account_id === form.to_account_id && (
            <p className="text-xs text-rose-600">From and To accounts cannot be the same.</p>
          )}

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
              disabled={updateMutation.isPending || !isValid}
              className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-4 text-xs font-semibold text-white"
            >
              {updateMutation.isPending ? "Saving..." : "Save Transfer"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
