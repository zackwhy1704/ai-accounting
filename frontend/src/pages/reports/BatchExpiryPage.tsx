import { useState } from "react"
import { Loader2, Download, Printer, AlertTriangle } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { downloadCSV, printReport, formatDate } from "../../lib/utils"
import api from "../../lib/api"

interface ExpiryRow {
  product_code: string | null
  product_name: string
  batch_no: string
  expiry_date: string
  days_to_expiry: number
  expired: boolean
  qty_on_hand: number
}

export default function BatchExpiryPage() {
  const [withinDays, setWithinDays] = useState(90)
  const { data, isLoading } = useQuery<{ rows: ExpiryRow[] }>({
    queryKey: ["report-batch-expiry", withinDays],
    queryFn: () => api.get("/reports/batch-expiry", { params: { within_days: withinDays } }).then(r => r.data),
  })
  const rows = data?.rows ?? []

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Reports</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Batch Expiry</div>
        <div className="mt-1 text-sm text-muted-foreground">Batches with stock on hand that are expired or expiring soon</div>
      </div>

      <div className="flex items-end justify-between print:hidden">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Expiring within (days)</label>
          <Input
            type="number"
            value={withinDays}
            onChange={e => setWithinDays(Math.max(1, Number(e.target.value) || 90))}
            className="h-9 w-32 text-sm"
          />
        </div>
        {rows.length > 0 && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadCSV("batch-expiry.csv", [
              ["Product", "Batch", "Expiry", "Days Left", "Qty"],
              ...rows.map(r => [`${r.product_code ?? ""} ${r.product_name}`, r.batch_no, r.expiry_date.slice(0, 10), String(r.days_to_expiry), String(r.qty_on_hand)]),
            ])}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={printReport}>
              <Printer className="mr-1.5 h-3.5 w-3.5" /> Print
            </Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Checking batches…
        </div>
      ) : rows.length === 0 ? (
        <Card className="rounded-2xl border-border bg-card p-12 text-center shadow-sm">
          <div className="text-sm font-semibold text-foreground">No batches expiring within {withinDays} days</div>
          <div className="mt-1 text-xs text-muted-foreground">Batch-tracked products with expiry dates appear here</div>
        </Card>
      ) : (
        <Card className="rounded-2xl border-border bg-card shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Product</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Batch / Serial</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Expiry</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Days Left</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Qty</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={`${r.product_name}-${r.batch_no}`} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5 text-sm text-foreground">
                    <span className="font-mono text-xs text-muted-foreground mr-2">{r.product_code}</span>{r.product_name}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{r.batch_no}</td>
                  <td className="px-4 py-2.5 text-sm text-muted-foreground">{formatDate(r.expiry_date)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${r.expired ? "bg-rose-100 text-rose-700" : r.days_to_expiry <= 30 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                      {r.expired && <AlertTriangle className="h-3 w-3" />}
                      {r.expired ? "EXPIRED" : `${r.days_to_expiry}d`}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{r.qty_on_hand}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
