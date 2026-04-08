import { useState, useEffect, useRef } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useBankAccount, useUpdateBankAccount } from "../../lib/hooks"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"
import { useToast } from "../../components/ui/toast"

interface BankAccountForm {
  name: string
  account_type: string
  bank_name: string
  account_number: string
  currency: string
  opening_balance: string
}

export default function EditBankAccountPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data } = useBankAccount(id)
  const updateMutation = useUpdateBankAccount()

  const [form, setForm] = useState<BankAccountForm>({
    name: "",
    account_type: "current",
    bank_name: "",
    account_number: "",
    currency: "MYR",
    opening_balance: "0",
  })

  const populated = useRef(false)
  useEffect(() => {
    if (data && !populated.current) {
      populated.current = true
      setForm({
        name: data.name || "",
        account_type: data.account_type || "current",
        bank_name: data.bank_name || "",
        account_number: data.account_number || "",
        currency: data.currency || "MYR",
        opening_balance: data.opening_balance != null ? String(data.opening_balance) : "0",
      })
    }
  }, [data])

  const set = (key: keyof BankAccountForm) => (val: string) =>
    setForm(prev => ({ ...prev, [key]: val }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name) return
    updateMutation.mutate(
      {
        id,
        ...form,
        opening_balance: parseFloat(form.opening_balance) || 0,
      },
      {
        onSuccess: () => {
          toast("Bank account updated", "success")
          navigate("/bank/accounts")
        },
        onError: () => toast("Failed to update bank account", "warning"),
      }
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Bank</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Edit Bank Account</div>
        <div className="mt-1 text-sm text-muted-foreground">Update your bank or cash account details</div>
      </div>

      <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Account Name <span className="text-rose-500">*</span>
              </label>
              <Input
                required
                placeholder="e.g. Maybank Current Account"
                value={form.name}
                onChange={e => set("name")(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Account Type</label>
              <Select value={form.account_type} onValueChange={set("account_type")}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current">Current</SelectItem>
                  <SelectItem value="savings">Savings</SelectItem>
                  <SelectItem value="credit">Credit</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Bank Name</label>
              <Input
                placeholder="e.g. Maybank"
                value={form.bank_name}
                onChange={e => set("bank_name")(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Account Number</label>
              <Input
                placeholder="e.g. 1234-5678-9012"
                value={form.account_number}
                onChange={e => set("account_number")(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Currency</label>
              <Select value={form.currency} onValueChange={set("currency")}>
                <SelectTrigger className="h-9">
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

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Opening Balance</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={form.opening_balance}
                onChange={e => set("opening_balance")(e.target.value)}
              />
            </div>
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
              disabled={updateMutation.isPending || !form.name}
              className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-4 text-xs font-semibold text-white"
            >
              {updateMutation.isPending ? "Saving..." : "Save Account"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
