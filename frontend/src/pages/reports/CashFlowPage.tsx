import { useState } from "react"
import { Loader2, Download, Printer } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { formatCurrency, downloadCSV, printReport } from "../../lib/utils"
import api from "../../lib/api"

interface CashFlowReport {
  start_date: string
  end_date: string
  opening_cash: number
  cash_inflows: number
  cash_outflows: number
  net_change: number
  closing_cash: number
}

export default function CashFlowPage() {
  const thisYear = new Date().getFullYear()
  const [fromDate, setFromDate] = useState(`${thisYear}-01-01`)
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10))
  const [queryParams, setQueryParams] = useState({ fromDate: `${thisYear}-01-01`, toDate: new Date().toISOString().slice(0, 10) })

  const { data, isLoading, isFetching } = useQuery<CashFlowReport>({
    queryKey: ["report-cash-flow", queryParams],
    queryFn: () => api.get(`/reports/cash-flow?start_date=${queryParams.fromDate}&end_date=${queryParams.toDate}`).then(r => r.data),
  })

  const Row = ({ label, value, bold = false, negative = false }: { label: string; value: string; bold?: boolean; negative?: boolean }) => (
    <div className={`flex items-center justify-between border-b border-border py-2.5 last:border-0 ${bold ? "bg-muted/30" : ""}`}>
      <span className={`text-sm ${bold ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{label}</span>
      <span className={`text-sm tabular-nums ${bold ? "font-bold" : ""} ${negative ? "text-rose-600" : "text-foreground"}`}>{value}</span>
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Reports</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Cash Flow Statement</div>
        <div className="mt-1 text-sm text-muted-foreground">Cash inflows and outflows for a period</div>
      </div>
      {data && (
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={() => downloadCSV(`cash-flow-${data.start_date}-${data.end_date}.csv`, [
            ["Cash Flow Statement", `${data.start_date} to ${data.end_date}`],
            [],
            ["Item", "Amount"],
            ["Opening Cash Balance", data.opening_cash.toFixed(2)],
            ["Cash Inflows (Receipts)", data.cash_inflows.toFixed(2)],
            ["Cash Outflows (Payments)", data.cash_outflows.toFixed(2)],
            ["Net Change in Cash", data.net_change.toFixed(2)],
            ["Closing Cash Balance", data.closing_cash.toFixed(2)],
          ])}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={printReport}>
            <Printer className="mr-1.5 h-3.5 w-3.5" /> Print / PDF
          </Button>
        </div>
      )}

      <Card className="rounded-2xl border-border bg-card p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="flex items-end gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">From Date</label>
            <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-9 text-sm w-48" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">To Date</label>
            <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-9 text-sm w-48" />
          </div>
          <Button type="button" onClick={() => setQueryParams({ fromDate, toDate })} className="h-9 bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-4 text-sm text-white" disabled={isFetching}>
            {isFetching ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
            Update
          </Button>
        </div>
      </Card>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Generating report…
        </div>
      ) : data ? (
        <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
          <div className="space-y-0 divide-y divide-border rounded-xl border border-border px-4">
            <Row label="Opening Cash Balance" value={formatCurrency(data.opening_cash)} />
            <Row label="Cash Inflows (Receipts)" value={formatCurrency(data.cash_inflows)} />
            <Row label="Cash Outflows (Payments)" value={`(${formatCurrency(data.cash_outflows)})`} negative />
            <Row label="Net Change in Cash" value={formatCurrency(data.net_change)} bold negative={data.net_change < 0} />
          </div>

          <div className="mt-6 space-y-0 divide-y divide-border rounded-xl border-2 border-border px-4">
            <Row label="Closing Cash Balance" value={formatCurrency(data.closing_cash)} bold />
          </div>
        </Card>
      ) : null}
    </div>
  )
}
