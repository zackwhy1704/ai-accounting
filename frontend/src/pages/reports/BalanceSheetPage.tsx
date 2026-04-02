import { useState } from "react"
import { Loader2 } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { formatCurrency } from "../../lib/utils"
import api from "../../lib/api"

interface BalanceSheetReport {
  as_of_date: string
  assets: number
  liabilities: number
  equity: number
  liabilities_and_equity: number
  is_balanced: boolean
}

export default function BalanceSheetPage() {
  const today = new Date().toISOString().slice(0, 10)
  const [asAt, setAsAt] = useState(today)
  const [activeAsAt, setActiveAsAt] = useState(today)

  const { data, isLoading, isFetching } = useQuery<BalanceSheetReport>({
    queryKey: ["report-balance-sheet", activeAsAt],
    queryFn: () => api.get(`/reports/balance-sheet?as_of_date=${activeAsAt}`).then(r => r.data),
  })

  const Row = ({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) => (
    <div className={`flex items-center justify-between border-b border-border py-2.5 last:border-0 ${bold ? "bg-muted/30" : ""}`}>
      <span className={`text-sm ${bold ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{label}</span>
      <span className={`text-sm tabular-nums ${bold ? "font-bold" : ""} text-foreground`}>{value}</span>
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Reports</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Balance Sheet</div>
        <div className="mt-1 text-sm text-muted-foreground">Assets, liabilities and equity as at a given date</div>
      </div>

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

      {data && (
        <div className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium border ${data.is_balanced ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-rose-50 border-rose-200 text-rose-700"}`}>
          {data.is_balanced ? "Balance sheet is balanced (Assets = Liabilities + Equity)" : "Warning: Balance sheet is out of balance"}
        </div>
      )}

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Generating report…
        </div>
      ) : data ? (
        <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
          <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assets</div>
          <div className="space-y-0 divide-y divide-border rounded-xl border border-border px-4">
            <Row label="Total Assets" value={formatCurrency(data.assets)} bold />
          </div>

          <div className="mt-6 mb-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Liabilities</div>
          <div className="space-y-0 divide-y divide-border rounded-xl border border-border px-4">
            <Row label="Total Liabilities" value={formatCurrency(data.liabilities)} />
          </div>

          <div className="mt-6 mb-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Equity</div>
          <div className="space-y-0 divide-y divide-border rounded-xl border border-border px-4">
            <Row label="Total Equity" value={formatCurrency(data.equity)} />
          </div>

          <div className="mt-6 space-y-0 divide-y divide-border rounded-xl border-2 border-border px-4">
            <Row label="Liabilities + Equity" value={formatCurrency(data.liabilities_and_equity)} bold />
          </div>
        </Card>
      ) : null}
    </div>
  )
}
