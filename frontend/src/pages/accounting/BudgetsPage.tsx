import { useEffect, useMemo, useState } from "react"
import { Loader2, Save, Plus } from "lucide-react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { useToast } from "../../components/ui/toast"
import { formatCurrency } from "../../lib/utils"
import { useAccounts } from "../../lib/hooks"
import api from "../../lib/api"

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const PL_TYPES = ["revenue", "income", "expense", "cogs", "cost_of_sales"]

interface BudgetLine {
  id: string
  account_id: string
  account_code: string | null
  account_name: string | null
  amounts: number[]
  annual_total: number
}

export default function BudgetsPage() {
  const { toast } = useToast()
  const qc = useQueryClient()
  const { data: accounts = [] } = useAccounts()
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear())
  const [rows, setRows] = useState<Record<string, string[]>>({})
  const [addAccountId, setAddAccountId] = useState("")

  const { data: budget, isLoading } = useQuery<{ fiscal_year: number; lines: BudgetLine[] }>({
    queryKey: ["budget", fiscalYear],
    queryFn: () => api.get(`/budgets/${fiscalYear}`).then(r => r.data),
  })

  useEffect(() => {
    if (!budget) return
    const m: Record<string, string[]> = {}
    budget.lines.forEach(l => {
      m[l.account_id] = (l.amounts ?? []).map(a => (a ? String(a) : ""))
      while (m[l.account_id].length < 12) m[l.account_id].push("")
    })
    setRows(m)
  }, [budget])

  const plAccounts = useMemo(
    () => accounts.filter((a: any) => PL_TYPES.includes((a.type ?? "").toLowerCase()) && a.account_role !== "header" && a.account_role !== "subheader"),
    [accounts],
  )
  const accountById = useMemo(() => {
    const m: Record<string, any> = {}
    accounts.forEach((a: any) => { m[a.id] = a })
    return m
  }, [accounts])

  const availableToAdd = plAccounts.filter((a: any) => !(a.id in rows))

  const save = useMutation({
    mutationFn: () => {
      const lines = Object.entries(rows).map(([account_id, months]) => ({
        account_id,
        amounts: Array.from({ length: 12 }, (_, i) => parseFloat(months[i]) || 0),
      }))
      return api.put(`/budgets/${fiscalYear}`, { lines }).then(r => r.data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["budget", fiscalYear] })
      toast("Budget saved", "success")
    },
    onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to save budget", "warning"),
  })

  const setCell = (accountId: string, monthIdx: number, value: string) =>
    setRows(prev => ({
      ...prev,
      [accountId]: prev[accountId].map((v, i) => (i === monthIdx ? value : v)),
    }))

  const spreadAnnual = (accountId: string) => {
    const annual = prompt("Enter an annual amount to spread evenly across 12 months:")
    const val = parseFloat(annual ?? "")
    if (!isNaN(val)) {
      const monthly = (val / 12).toFixed(2)
      setRows(prev => ({ ...prev, [accountId]: Array(12).fill(monthly) }))
    }
  }

  const rowTotal = (accountId: string) =>
    (rows[accountId] ?? []).reduce((s, v) => s + (parseFloat(v) || 0), 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Accounting</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Budgets</div>
          <div className="mt-1 text-sm text-muted-foreground">Monthly budget per P&L account — shows as Budget vs Actual on the P&L report</div>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Fiscal year</label>
            <Input
              type="number"
              value={fiscalYear}
              onChange={e => setFiscalYear(Number(e.target.value) || new Date().getFullYear())}
              className="h-9 w-28 text-sm"
            />
          </div>
          <Button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending || Object.keys(rows).length === 0}
            className="h-9 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white"
          >
            {save.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
            Save Budget
          </Button>
        </div>
      </div>

      <Card className="rounded-2xl border-border bg-card p-4 shadow-sm">
        <div className="flex items-end gap-2">
          <div className="space-y-1.5 flex-1 max-w-md">
            <label className="text-xs font-medium text-muted-foreground">Add account to the budget</label>
            <select
              value={addAccountId}
              onChange={e => setAddAccountId(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="">Select a P&L account…</option>
              {availableToAdd.map((a: any) => (
                <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-9"
            disabled={!addAccountId}
            onClick={() => {
              setRows(prev => ({ ...prev, [addAccountId]: Array(12).fill("") }))
              setAddAccountId("")
            }}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add
          </Button>
        </div>
      </Card>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading budget…
        </div>
      ) : Object.keys(rows).length === 0 ? (
        <Card className="rounded-2xl border-border bg-card p-12 text-center shadow-sm">
          <div className="text-sm font-semibold text-foreground">No budget lines for {fiscalYear}</div>
          <div className="mt-1 text-xs text-muted-foreground">Add P&L accounts above and enter monthly amounts</div>
        </Card>
      ) : (
        <Card className="rounded-2xl border-border bg-card shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground sticky left-0 bg-muted/40">Account</th>
                {MONTHS.map(m => (
                  <th key={m} className="px-1 py-2.5 text-right text-xs font-medium text-muted-foreground">{m}</th>
                ))}
                <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">Total</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(rows).map(accountId => {
                const acct = accountById[accountId]
                return (
                  <tr key={accountId} className="border-b border-border last:border-0">
                    <td className="px-3 py-1.5 sticky left-0 bg-card">
                      <button
                        type="button"
                        className="text-left text-xs font-medium text-foreground hover:text-[#4D63FF]"
                        title="Click to spread an annual amount"
                        onClick={() => spreadAnnual(accountId)}
                      >
                        {acct ? `${acct.code} ${acct.name}` : accountId.slice(0, 8)}
                      </button>
                    </td>
                    {MONTHS.map((_, i) => (
                      <td key={i} className="px-0.5 py-1">
                        <Input
                          type="number"
                          value={rows[accountId][i] ?? ""}
                          onChange={e => setCell(accountId, i, e.target.value)}
                          className="h-8 w-[76px] px-1.5 text-right text-xs tabular-nums"
                        />
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-right text-xs font-semibold tabular-nums text-foreground">
                      {formatCurrency(rowTotal(accountId))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
