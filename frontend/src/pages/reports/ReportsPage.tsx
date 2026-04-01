import { useState } from "react"
import { TrendingUp, Users, Building2, Scale, Loader2 } from "lucide-react"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { formatCurrency } from "../../lib/utils"
import api from "../../lib/api"

type ReportType = "profit_loss" | "ar_aging" | "ap_aging" | "trial_balance"

interface ReportCard {
  id: ReportType
  title: string
  desc: string
  icon: React.ReactNode
  color: string
}

const REPORTS: ReportCard[] = [
  {
    id: "profit_loss",
    title: "Profit & Loss",
    desc: "Revenue, expenses, and net income for a period",
    icon: <TrendingUp className="h-5 w-5" />,
    color: "from-emerald-500 to-teal-600",
  },
  {
    id: "ar_aging",
    title: "AR Aging",
    desc: "Outstanding receivables by aging bucket",
    icon: <Users className="h-5 w-5" />,
    color: "from-blue-500 to-indigo-600",
  },
  {
    id: "ap_aging",
    title: "AP Aging",
    desc: "Outstanding payables by aging bucket",
    icon: <Building2 className="h-5 w-5" />,
    color: "from-violet-500 to-purple-600",
  },
  {
    id: "trial_balance",
    title: "Trial Balance",
    desc: "Account balances across all ledger accounts",
    icon: <Scale className="h-5 w-5" />,
    color: "from-amber-500 to-orange-600",
  },
]

export default function ReportsPage() {
  const [selected, setSelected] = useState<ReportType | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10))
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10))

  const run = async (type: ReportType) => {
    setSelected(type)
    setLoading(true)
    setResult(null)
    try {
      let resp
      if (type === "profit_loss") {
        resp = await api.get(`/reports/profit-loss?start_date=${startDate}&end_date=${endDate}`)
      } else if (type === "ar_aging") {
        resp = await api.get(`/reports/ar-aging?as_of_date=${asOf}`)
      } else if (type === "ap_aging") {
        resp = await api.get(`/reports/ap-aging?as_of_date=${asOf}`)
      } else {
        resp = await api.get(`/reports/trial-balance?as_of_date=${asOf}`)
      }
      setResult(resp.data)
    } catch {
      setResult({ error: "Failed to generate report" })
    } finally {
      setLoading(false)
    }
  }

  const renderResult = () => {
    if (!result || loading) return null
    if ("error" in result) return <div className="text-rose-600 text-sm">{String(result.error)}</div>

    if (selected === "profit_loss") {
      const sections = result.sections as Record<string, Record<string, number>>
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-border bg-emerald-50 dark:bg-emerald-950/20 p-4">
              <div className="text-xs text-muted-foreground">Revenue</div>
              <div className="mt-1 text-xl font-bold text-emerald-700">{formatCurrency(sections.revenue.total)}</div>
              <div className="text-xs text-muted-foreground">{sections.revenue.invoice_count} invoices</div>
            </div>
            <div className="rounded-xl border border-border bg-rose-50 dark:bg-rose-950/20 p-4">
              <div className="text-xs text-muted-foreground">Expenses</div>
              <div className="mt-1 text-xl font-bold text-rose-700">{formatCurrency(sections.expenses.total)}</div>
              <div className="text-xs text-muted-foreground">{sections.expenses.bill_count} bills</div>
            </div>
            <div className={`rounded-xl border border-border p-4 ${Number(result.net_income) >= 0 ? "bg-blue-50 dark:bg-blue-950/20" : "bg-amber-50 dark:bg-amber-950/20"}`}>
              <div className="text-xs text-muted-foreground">Net Income</div>
              <div className={`mt-1 text-xl font-bold ${Number(result.net_income) >= 0 ? "text-blue-700" : "text-amber-700"}`}>{formatCurrency(Number(result.net_income))}</div>
            </div>
          </div>
        </div>
      )
    }

    if (selected === "ar_aging" || selected === "ap_aging") {
      const summary = result.summary as Record<string, { count: number; total: number }>
      const labels: Record<string, string> = { current: "Current", "1_30": "1-30 days", "31_60": "31-60 days", "61_90": "61-90 days", over_90: "90+ days" }
      const colors: Record<string, string> = { current: "text-emerald-700", "1_30": "text-amber-700", "31_60": "text-orange-700", "61_90": "text-rose-700", over_90: "text-rose-900" }
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-5 gap-3">
            {Object.entries(summary).map(([bucket, data]) => (
              <div key={bucket} className="rounded-xl border border-border bg-card p-3">
                <div className="text-xs text-muted-foreground">{labels[bucket]}</div>
                <div className={`mt-1 text-base font-bold ${colors[bucket] ?? "text-foreground"}`}>{formatCurrency(data.total)}</div>
                <div className="text-xs text-muted-foreground">{data.count} items</div>
              </div>
            ))}
          </div>
          <div className="text-sm font-semibold text-foreground">Total: {formatCurrency(Number(result.grand_total))}</div>
        </div>
      )
    }

    if (selected === "trial_balance") {
      const lines = result.lines as Array<{ code: string; name: string; type: string; debit: number; credit: number; balance: number }>
      const totals = result.totals as { debit: number; credit: number }
      return (
        <div>
          <div className={`mb-3 text-xs font-semibold ${result.is_balanced ? "text-emerald-700" : "text-rose-700"}`}>
            {result.is_balanced ? "✓ Trial Balance is balanced" : "⚠ Trial Balance is out of balance"}
          </div>
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Code</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Account</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Debit</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Credit</th>
                </tr>
              </thead>
              <tbody>
                {lines.map(l => (
                  <tr key={l.code} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-1.5 text-muted-foreground">{l.code}</td>
                    <td className="px-3 py-1.5 text-foreground">{l.name}</td>
                    <td className="px-3 py-1.5 text-right text-foreground">{l.debit > 0 ? formatCurrency(l.debit) : ""}</td>
                    <td className="px-3 py-1.5 text-right text-foreground">{l.credit > 0 ? formatCurrency(l.credit) : ""}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border bg-muted/40">
                  <td colSpan={2} className="px-3 py-2 text-xs font-semibold text-foreground">Total</td>
                  <td className="px-3 py-2 text-right text-xs font-semibold text-foreground">{formatCurrency(totals.debit)}</td>
                  <td className="px-3 py-2 text-right text-xs font-semibold text-foreground">{formatCurrency(totals.credit)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )
    }
    return null
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Analytics</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Reports</div>
        <div className="mt-1 max-w-2xl text-sm text-muted-foreground">Generate financial reports for your business</div>
      </div>

      {/* Date Pickers */}
      <Card className="rounded-2xl border-border bg-card p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Start Date (P&L)</label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">End Date (P&L)</label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">As Of Date (Aging / TB)</label>
            <Input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} className="h-9 text-sm" />
          </div>
        </div>
      </Card>

      {/* Report Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {REPORTS.map(r => (
          <button
            key={r.id}
            type="button"
            onClick={() => run(r.id)}
            className="rounded-2xl border border-border bg-card p-5 text-left hover:shadow-md transition-shadow"
          >
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${r.color} text-white shadow`}>
              {r.icon}
            </div>
            <div className="mt-3 text-sm font-semibold text-foreground">{r.title}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{r.desc}</div>
          </button>
        ))}
      </div>

      {/* Result */}
      {(loading || result) && (
        <Card className="rounded-2xl border-border bg-card p-5 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-semibold text-foreground">
              {REPORTS.find(r => r.id === selected)?.title}
            </div>
          </div>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Generating report...
            </div>
          ) : renderResult()}
        </Card>
      )}
    </div>
  )
}
