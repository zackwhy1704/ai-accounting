import { useState } from "react"
import { Loader2 } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { formatCurrency } from "../../lib/utils"
import api from "../../lib/api"

interface AgedRow {
  supplier_name: string
  current: number
  period_1: number
  period_2: number
  period_3: number
  period_4_plus: number
  total: number
}

interface AgedPayablesReport {
  rows: AgedRow[]
  totals: {
    current: number
    period_1: number
    period_2: number
    period_3: number
    period_4_plus: number
    total: number
  }
}

const CURRENCIES = ["MYR", "SGD", "USD", "HKD", "AUD", "EUR"]

export default function AgedPayablesPage() {
  const [periodDate, setPeriodDate] = useState(new Date().toISOString().slice(0, 10))
  const [periods, setPeriods] = useState("4")
  const [daysPeriod, setDaysPeriod] = useState("30")
  const [currency, setCurrency] = useState("MYR")
  const [queryParams, setQueryParams] = useState({ periodDate, periods, daysPeriod, currency })

  const { data, isLoading, isFetching } = useQuery<AgedPayablesReport>({
    queryKey: ["report-ap-aging", queryParams],
    queryFn: () =>
      api
        .get(`/reports/ap-aging?as_of_date=${queryParams.periodDate}`)
        .then(r => r.data),
  })

  const handleUpdate = () => {
    setQueryParams({ periodDate, periods, daysPeriod, currency })
  }

  const daysNum = parseInt(daysPeriod, 10) || 30

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Reports</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Aged Payables Summary</div>
          <div className="mt-1 text-sm text-muted-foreground">Outstanding supplier balances by aging period</div>
        </div>
      </div>

      {/* Filter panel */}
      <Card className="rounded-2xl border-border bg-card p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Period Date</label>
            <Input type="date" value={periodDate} onChange={e => setPeriodDate(e.target.value)} className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Periods</label>
            <Input type="number" min="1" max="12" value={periods} onChange={e => setPeriods(e.target.value)} className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Days / Period</label>
            <Input type="number" min="1" value={daysPeriod} onChange={e => setDaysPeriod(e.target.value)} className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Currency</label>
            <select
              value={currency}
              onChange={e => setCurrency(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <Button type="button" onClick={handleUpdate} className="h-9 bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-4 text-sm text-white" disabled={isFetching}>
            {isFetching ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
            Update
          </Button>
        </div>
      </Card>

      {/* Data table */}
      <Card className="rounded-2xl border-border bg-card shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)] overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Generating report…
          </div>
        ) : !data || data.rows.length === 0 ? (
          <div className="py-12 text-center">
            <div className="text-sm font-semibold text-foreground">No outstanding payables</div>
            <div className="mt-1 text-xs text-muted-foreground">All bills are paid or no data for the selected period</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Supplier</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Current</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">1–{daysNum} Days</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">{daysNum + 1}–{daysNum * 2} Days</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">{daysNum * 2 + 1}–{daysNum * 3} Days</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">{daysNum * 3 + 1}+ Days</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, i) => (
                <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5 text-sm font-medium text-foreground">{row.supplier_name}</td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{row.current > 0 ? formatCurrency(row.current, currency) : "—"}</td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums text-amber-600">{row.period_1 > 0 ? formatCurrency(row.period_1, currency) : "—"}</td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums text-orange-600">{row.period_2 > 0 ? formatCurrency(row.period_2, currency) : "—"}</td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums text-rose-600">{row.period_3 > 0 ? formatCurrency(row.period_3, currency) : "—"}</td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums text-rose-800">{row.period_4_plus > 0 ? formatCurrency(row.period_4_plus, currency) : "—"}</td>
                  <td className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums text-foreground">{formatCurrency(row.total, currency)}</td>
                </tr>
              ))}
              {data.totals && (
                <tr className="border-t-2 border-border bg-muted/40">
                  <td className="px-4 py-2.5 text-xs font-semibold text-foreground">Total</td>
                  <td className="px-4 py-2.5 text-right text-xs font-semibold tabular-nums text-foreground">{formatCurrency(data.totals.current, currency)}</td>
                  <td className="px-4 py-2.5 text-right text-xs font-semibold tabular-nums text-foreground">{formatCurrency(data.totals.period_1, currency)}</td>
                  <td className="px-4 py-2.5 text-right text-xs font-semibold tabular-nums text-foreground">{formatCurrency(data.totals.period_2, currency)}</td>
                  <td className="px-4 py-2.5 text-right text-xs font-semibold tabular-nums text-foreground">{formatCurrency(data.totals.period_3, currency)}</td>
                  <td className="px-4 py-2.5 text-right text-xs font-semibold tabular-nums text-foreground">{formatCurrency(data.totals.period_4_plus, currency)}</td>
                  <td className="px-4 py-2.5 text-right text-xs font-semibold tabular-nums text-foreground">{formatCurrency(data.totals.total, currency)}</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
