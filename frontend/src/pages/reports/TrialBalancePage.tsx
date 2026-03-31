import { useState } from "react"
import { Download, Loader2 } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { formatCurrency } from "../../lib/utils"
import api from "../../lib/api"

interface TrialBalanceLine {
  code: string
  name: string
  account_type: string
  debit: number
  credit: number
}

interface TrialBalanceReport {
  lines: TrialBalanceLine[]
  totals: { debit: number; credit: number }
  is_balanced: boolean
  as_at: string
}

const TYPE_ORDER = ["Assets", "Liabilities", "Equity", "Revenue", "Expenses"]

const normaliseType = (t: string) => {
  const map: Record<string, string> = {
    asset: "Assets", assets: "Assets",
    liability: "Liabilities", liabilities: "Liabilities",
    equity: "Equity",
    revenue: "Revenue", income: "Revenue",
    expense: "Expenses", expenses: "Expenses",
  }
  return map[t.toLowerCase()] ?? t
}

export default function TrialBalancePage() {
  const today = new Date().toISOString().slice(0, 10)
  const [asAt, setAsAt] = useState(today)
  const [activeAsAt, setActiveAsAt] = useState(today)

  const { data, isLoading, isFetching } = useQuery<TrialBalanceReport>({
    queryKey: ["report-trial-balance", activeAsAt],
    queryFn: () => api.get(`/reports?type=trial_balance&as_at=${activeAsAt}`).then(r => r.data),
  })

  const grouped = (data?.lines ?? []).reduce<Record<string, TrialBalanceLine[]>>((acc, l) => {
    const type = normaliseType(l.account_type)
    if (!acc[type]) acc[type] = []
    acc[type].push(l)
    return acc
  }, {})

  const sortedGroups = Object.entries(grouped).sort(
    ([a], [b]) => TYPE_ORDER.indexOf(a) - TYPE_ORDER.indexOf(b)
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Reports</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Trial Balance</div>
          <div className="mt-1 text-sm text-muted-foreground">Account debit and credit balances as at a given date</div>
        </div>
        <Button type="button" variant="secondary" className="h-9 rounded-xl px-3 text-xs">
          <Download className="mr-2 h-4 w-4" /> Download PDF
        </Button>
      </div>

      {/* Filter panel */}
      <Card className="rounded-2xl border-border bg-card p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="flex items-end gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">As At</label>
            <Input type="date" value={asAt} onChange={e => setAsAt(e.target.value)} className="h-9 text-sm w-48" />
          </div>
          <Button type="button" onClick={() => setActiveAsAt(asAt)} className="h-9 bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-4 text-sm text-white" disabled={isFetching}>
            {isFetching ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
            Update
          </Button>
        </div>
      </Card>

      {/* Balance status */}
      {data && (
        <div className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium border ${data.is_balanced ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-rose-50 border-rose-200 text-rose-700"}`}>
          {data.is_balanced ? "Trial balance is balanced" : "Warning: Trial balance is out of balance — please review your journal entries"}
        </div>
      )}

      <Card className="rounded-2xl border-border bg-card shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)] overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Generating report…
          </div>
        ) : !data || data.lines.length === 0 ? (
          <div className="py-12 text-center">
            <div className="text-sm font-semibold text-foreground">No data available</div>
            <div className="mt-1 text-xs text-muted-foreground">No journal entries found for the selected date</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Code</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Account Name</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Debit</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Credit</th>
              </tr>
            </thead>
            <tbody>
              {sortedGroups.map(([type, lines]) => (
                <>
                  <tr key={`group-${type}`} className="bg-muted/20">
                    <td colSpan={4} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {type}
                    </td>
                  </tr>
                  {lines.map(l => (
                    <tr key={l.code} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{l.code}</td>
                      <td className="px-4 py-2.5 text-sm text-foreground">{l.name}</td>
                      <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{l.debit > 0 ? formatCurrency(l.debit) : "—"}</td>
                      <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{l.credit > 0 ? formatCurrency(l.credit) : "—"}</td>
                    </tr>
                  ))}
                </>
              ))}
              {data.totals && (
                <tr className="border-t-2 border-border bg-muted/40">
                  <td colSpan={2} className="px-4 py-2.5 text-xs font-semibold text-foreground">Total</td>
                  <td className="px-4 py-2.5 text-right text-xs font-bold tabular-nums text-foreground">{formatCurrency(data.totals.debit)}</td>
                  <td className="px-4 py-2.5 text-right text-xs font-bold tabular-nums text-foreground">{formatCurrency(data.totals.credit)}</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
