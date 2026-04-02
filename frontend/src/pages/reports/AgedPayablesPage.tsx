import { useState } from "react"
import { Loader2 } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { formatCurrency, formatDate } from "../../lib/utils"
import api from "../../lib/api"

interface BucketEntry {
  bill_number: string
  contact_name: string
  amount_due: number
  due_date: string | null
  days_overdue: number
}

interface BucketSummary {
  count: number
  total: number
}

interface AgedPayablesReport {
  as_of_date: string
  currency: string
  buckets: Record<string, BucketEntry[]>
  summary: Record<string, BucketSummary>
  grand_total: number
}

const BUCKET_LABELS: Record<string, string> = {
  current: "Current",
  "1_30": "1–30 Days",
  "31_60": "31–60 Days",
  "61_90": "61–90 Days",
  over_90: "90+ Days",
}

const BUCKET_COLORS: Record<string, string> = {
  current: "text-foreground",
  "1_30": "text-amber-600",
  "31_60": "text-orange-600",
  "61_90": "text-rose-600",
  over_90: "text-rose-800",
}

const BUCKET_ORDER = ["current", "1_30", "31_60", "61_90", "over_90"]

export default function AgedPayablesPage() {
  const [periodDate, setPeriodDate] = useState(new Date().toISOString().slice(0, 10))
  const [activePeriodDate, setActivePeriodDate] = useState(periodDate)

  const { data, isLoading, isFetching } = useQuery<AgedPayablesReport>({
    queryKey: ["report-ap-aging", activePeriodDate],
    queryFn: () => api.get(`/reports/ap-aging?as_of_date=${activePeriodDate}`).then(r => r.data),
  })

  const hasData = data && data.grand_total > 0

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Reports</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Aged Payables Summary</div>
        <div className="mt-1 text-sm text-muted-foreground">Outstanding supplier balances by aging period</div>
      </div>

      <Card className="rounded-2xl border-border bg-card p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="flex items-end gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">As Of Date</label>
            <Input type="date" value={periodDate} onChange={e => setPeriodDate(e.target.value)} className="h-9 text-sm w-48" />
          </div>
          <Button type="button" onClick={() => setActivePeriodDate(periodDate)} className="h-9 bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-4 text-sm text-white" disabled={isFetching}>
            {isFetching ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
            Update
          </Button>
        </div>
      </Card>

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-5 gap-3">
          {BUCKET_ORDER.map(key => (
            <Card key={key} className="rounded-xl border-border bg-card p-3 shadow-sm">
              <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{BUCKET_LABELS[key]}</div>
              <div className={`mt-1 text-lg font-bold tabular-nums ${BUCKET_COLORS[key]}`}>
                {formatCurrency(data.summary[key]?.total ?? 0)}
              </div>
              <div className="text-[10px] text-muted-foreground">{data.summary[key]?.count ?? 0} bill(s)</div>
            </Card>
          ))}
        </div>
      )}

      <Card className="rounded-2xl border-border bg-card shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)] overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Generating report…
          </div>
        ) : !hasData ? (
          <div className="py-12 text-center">
            <div className="text-sm font-semibold text-foreground">No outstanding payables</div>
            <div className="mt-1 text-xs text-muted-foreground">All bills are paid or no data for the selected period</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Bill</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Supplier</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Due Date</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Days Overdue</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Aging</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Amount Due</th>
              </tr>
            </thead>
            <tbody>
              {BUCKET_ORDER.map(bucket => {
                const entries = data.buckets[bucket] ?? []
                if (entries.length === 0) return null
                return entries.map((entry, i) => (
                  <tr key={`${bucket}-${i}`} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2.5 text-sm font-medium text-foreground">{entry.bill_number}</td>
                    <td className="px-4 py-2.5 text-sm text-foreground">{entry.contact_name}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{entry.due_date ? formatDate(entry.due_date) : "—"}</td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums text-muted-foreground">{entry.days_overdue}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-medium ${BUCKET_COLORS[bucket]}`}>{BUCKET_LABELS[bucket]}</span>
                    </td>
                    <td className={`px-4 py-2.5 text-right text-sm tabular-nums font-medium ${BUCKET_COLORS[bucket]}`}>
                      {formatCurrency(entry.amount_due)}
                    </td>
                  </tr>
                ))
              })}
              <tr className="border-t-2 border-border bg-muted/40">
                <td colSpan={5} className="px-4 py-2.5 text-xs font-semibold text-foreground">Grand Total</td>
                <td className="px-4 py-2.5 text-right text-sm font-bold tabular-nums text-foreground">{formatCurrency(data.grand_total)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
