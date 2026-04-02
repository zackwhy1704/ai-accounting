import { useState } from "react"
import { Loader2, Download, Printer } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { downloadCSV, printReport } from "../../lib/utils"
import api from "../../lib/api"

interface InventoryItem {
  code: string
  name: string
  opening_qty: number
  adjustments_in: number
  adjustments_out: number
  closing_qty: number
}

interface InventorySummaryReport {
  items: InventoryItem[]
}

export default function InventorySummaryPage() {
  const thisYear = new Date().getFullYear()
  const [fromDate, setFromDate] = useState(`${thisYear}-01-01`)
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10))
  const [queryParams, setQueryParams] = useState({ fromDate: `${thisYear}-01-01`, toDate: new Date().toISOString().slice(0, 10) })

  const { data, isLoading, isFetching } = useQuery<InventorySummaryReport>({
    queryKey: ["report-inventory-summary", queryParams],
    queryFn: () => api.get(`/reports/inventory-summary?start_date=${queryParams.fromDate}&end_date=${queryParams.toDate}`).then(r => r.data),
  })

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Reports</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Inventory Summary</div>
        <div className="mt-1 text-sm text-muted-foreground">Stock movements and closing quantities for a period</div>
      </div>
      {data && data.items.length > 0 && (
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={() => downloadCSV(`inventory-summary-${queryParams.fromDate}-${queryParams.toDate}.csv`, [
            ["Inventory Summary", `${queryParams.fromDate} to ${queryParams.toDate}`],
            [],
            ["Code", "Name", "Opening Qty", "Adjustments In", "Adjustments Out", "Closing Qty"],
            ...data.items.map(i => [i.code, i.name, String(i.opening_qty), String(i.adjustments_in), String(i.adjustments_out), String(i.closing_qty)]),
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

      <Card className="rounded-2xl border-border bg-card shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)] overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Generating report…
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="py-12 text-center">
            <div className="text-sm font-semibold text-foreground">No inventory records found</div>
            <div className="mt-1 text-xs text-muted-foreground">Try adjusting the date range</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Code</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Opening Qty</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Adjustments In</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Adjustments Out</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Closing Qty</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item, i) => (
                <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5 text-sm font-medium text-foreground">{item.code}</td>
                  <td className="px-4 py-2.5 text-sm text-foreground">{item.name}</td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{item.opening_qty}</td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums text-emerald-600">{item.adjustments_in}</td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums text-rose-600">{item.adjustments_out}</td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums font-medium text-foreground">{item.closing_qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
