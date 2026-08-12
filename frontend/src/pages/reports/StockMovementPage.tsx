import { useState } from "react"
import { Loader2, Download, Printer } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { downloadCSV, printReport } from "../../lib/utils"
import api from "../../lib/api"

interface MovementRow {
  code: string | null
  name: string
  unit: string | null
  opening: number
  qty_in: number
  qty_out: number
  closing: number
}

export default function StockMovementPage() {
  const thisYear = new Date().getFullYear()
  const today = new Date().toISOString().slice(0, 10)
  const [fromDate, setFromDate] = useState(`${thisYear}-01-01`)
  const [toDate, setToDate] = useState(today)
  const [queryParams, setQueryParams] = useState({ fromDate: `${thisYear}-01-01`, toDate: today })

  const { data, isLoading, isFetching } = useQuery<{ rows: MovementRow[] }>({
    queryKey: ["report-stock-movement", queryParams],
    queryFn: () => api.get("/reports/stock-movement", {
      params: { start_date: queryParams.fromDate, end_date: queryParams.toDate },
    }).then(r => r.data),
  })
  const rows = data?.rows ?? []

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Reports</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Stock Movement</div>
        <div className="mt-1 text-sm text-muted-foreground">Opening, in, out and closing quantities per product for a period</div>
      </div>

      {rows.length > 0 && (
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={() => downloadCSV(`stock-movement-${queryParams.fromDate}-${queryParams.toDate}.csv`, [
            ["Product", "Opening", "In", "Out", "Closing"],
            ...rows.map(r => [`${r.code ?? ""} ${r.name}`, String(r.opening), String(r.qty_in), String(r.qty_out), String(r.closing)]),
          ])}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={printReport}>
            <Printer className="mr-1.5 h-3.5 w-3.5" /> Print
          </Button>
        </div>
      )}

      <Card className="rounded-2xl border-border bg-card p-4 shadow-sm">
        <div className="flex items-end gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">From Date</label>
            <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-9 text-sm w-44" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">To Date</label>
            <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-9 text-sm w-44" />
          </div>
          <Button type="button" onClick={() => setQueryParams({ fromDate, toDate })} className="h-9 bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-4 text-sm text-white" disabled={isFetching}>
            {isFetching ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
            Update
          </Button>
        </div>
      </Card>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Generating…
        </div>
      ) : rows.length === 0 ? (
        <Card className="rounded-2xl border-border bg-card p-12 text-center shadow-sm">
          <div className="text-sm font-semibold text-foreground">No stock movements in this period</div>
        </Card>
      ) : (
        <Card className="rounded-2xl border-border bg-card shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Product</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Opening</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">In</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Out</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Closing</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={`${r.code}-${r.name}`} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5 text-sm text-foreground">
                    <span className="font-mono text-xs text-muted-foreground mr-2">{r.code}</span>{r.name}
                  </td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums text-muted-foreground">{r.opening}</td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums text-emerald-600">{r.qty_in > 0 ? `+${r.qty_in}` : 0}</td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums text-rose-600">{r.qty_out > 0 ? `-${r.qty_out}` : 0}</td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums font-medium text-foreground">{r.closing}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
