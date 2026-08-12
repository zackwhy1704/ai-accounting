import { Loader2, Download } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { formatCurrency, downloadCSV, printReport } from "../../lib/utils"
import { Printer } from "lucide-react"
import api from "../../lib/api"

interface AgingRow {
  code: string | null
  name: string
  qty_on_hand: number
  avg_cost: number
  value: number
  buckets: Record<string, number>
}

const BUCKETS = ["0-30", "31-60", "61-90", "91+"]

export default function StockAgingPage() {
  const { data, isLoading } = useQuery<{ as_of: string; rows: AgingRow[] }>({
    queryKey: ["report-stock-aging"],
    queryFn: () => api.get("/reports/stock-aging").then(r => r.data),
  })
  const rows = data?.rows ?? []

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Reports</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Stock Aging</div>
        <div className="mt-1 text-sm text-muted-foreground">How long your on-hand stock has been on the shelf (by receipt date)</div>
      </div>

      {rows.length > 0 && (
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={() => downloadCSV("stock-aging.csv", [
            ["Product", "Qty", "Avg Cost", "Value", ...BUCKETS],
            ...rows.map(r => [
              `${r.code ?? ""} ${r.name}`, String(r.qty_on_hand), r.avg_cost.toFixed(4), r.value.toFixed(2),
              ...BUCKETS.map(b => String(r.buckets[b] ?? 0)),
            ]),
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
          <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Generating…
        </div>
      ) : rows.length === 0 ? (
        <Card className="rounded-2xl border-border bg-card p-12 text-center shadow-sm">
          <div className="text-sm font-semibold text-foreground">No stock on hand</div>
          <div className="mt-1 text-xs text-muted-foreground">Tracked products with quantity will appear here</div>
        </Card>
      ) : (
        <Card className="rounded-2xl border-border bg-card shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Product</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Qty</th>
                {BUCKETS.map(b => (
                  <th key={b} className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">{b} days</th>
                ))}
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={`${r.code}-${r.name}`} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5 text-sm text-foreground">
                    <span className="font-mono text-xs text-muted-foreground mr-2">{r.code}</span>{r.name}
                  </td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{r.qty_on_hand}</td>
                  {BUCKETS.map(b => (
                    <td key={b} className={`px-4 py-2.5 text-right text-sm tabular-nums ${b === "91+" && (r.buckets[b] ?? 0) > 0 ? "text-rose-600 font-medium" : "text-muted-foreground"}`}>
                      {r.buckets[b] ?? 0}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{formatCurrency(r.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
