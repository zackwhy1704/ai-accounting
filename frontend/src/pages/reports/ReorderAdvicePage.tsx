import { Loader2, Download, Printer, ShoppingCart } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { downloadCSV, printReport } from "../../lib/utils"
import api from "../../lib/api"

interface AdviceRow {
  code: string | null
  name: string
  unit: string | null
  qty_on_hand: number
  reorder_point: number
  sold_last_period: number
  daily_usage: number
  suggested_order_qty: number
}

export default function ReorderAdvicePage() {
  const { data, isLoading } = useQuery<{ rows: AdviceRow[]; usage_days: number }>({
    queryKey: ["report-reorder-advice"],
    queryFn: () => api.get("/reports/stock-reorder-advice").then(r => r.data),
  })
  const rows = data?.rows ?? []

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Reports</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Reorder Advice</div>
        <div className="mt-1 text-sm text-muted-foreground">
          Products at or below their reorder point, with a suggested order quantity from the last {data?.usage_days ?? 90} days of sales
        </div>
      </div>

      {rows.length > 0 && (
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={() => downloadCSV("reorder-advice.csv", [
            ["Product", "On Hand", "Reorder Point", "Sold (period)", "Daily Usage", "Suggested Order"],
            ...rows.map(r => [`${r.code ?? ""} ${r.name}`, String(r.qty_on_hand), String(r.reorder_point), String(r.sold_last_period), String(r.daily_usage), String(r.suggested_order_qty)]),
          ])}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={printReport}>
            <Printer className="mr-1.5 h-3.5 w-3.5" /> Print
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Checking stock levels…
        </div>
      ) : rows.length === 0 ? (
        <Card className="rounded-2xl border-border bg-card p-12 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
            <ShoppingCart className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="text-sm font-semibold text-foreground">Nothing needs reordering</div>
          <div className="mt-1 text-xs text-muted-foreground">Products drop in here when on-hand quantity reaches their reorder point</div>
        </Card>
      ) : (
        <Card className="rounded-2xl border-border bg-card shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Product</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">On Hand</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Reorder Point</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Sold ({data?.usage_days}d)</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Suggested Order</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={`${r.code}-${r.name}`} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5 text-sm text-foreground">
                    <span className="font-mono text-xs text-muted-foreground mr-2">{r.code}</span>{r.name}
                  </td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums text-rose-600 font-medium">{r.qty_on_hand}</td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums text-muted-foreground">{r.reorder_point}</td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums text-muted-foreground">{r.sold_last_period}</td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums font-semibold text-foreground">
                    {r.suggested_order_qty} {r.unit ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
