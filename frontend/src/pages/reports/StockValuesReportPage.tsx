import { Loader2, Download, Printer } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { formatCurrency, downloadCSV, printReport } from "../../lib/utils"
import api from "../../lib/api"

interface StockItem {
  code: string
  name: string
  product_type: string
  unit: string
  qty_on_hand: number
  cost_price: number
  total_value: number
}

interface StockValuesReport {
  items: StockItem[]
  total_value: number
}

export default function StockValuesReportPage() {
  const { data, isLoading } = useQuery<StockValuesReport>({
    queryKey: ["report-stock-values"],
    queryFn: () => api.get("/reports/stock-values").then(r => r.data),
  })

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Reports</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Stock Values</div>
        <div className="mt-1 text-sm text-muted-foreground">Current stock on hand and valuation</div>
      </div>
      {data && data.items.length > 0 && (
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={() => downloadCSV("stock-values.csv", [
            ["Stock Values Report"],
            [],
            ["Code", "Name", "Type", "Unit", "Qty on Hand", "Cost Price", "Total Value"],
            ...data.items.map(i => [i.code, i.name, i.product_type, i.unit, String(i.qty_on_hand), i.cost_price.toFixed(2), i.total_value.toFixed(2)]),
            [],
            ["", "", "", "", "", "Total", data.total_value.toFixed(2)],
          ])}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={printReport}>
            <Printer className="mr-1.5 h-3.5 w-3.5" /> Print / PDF
          </Button>
        </div>
      )}

      <Card className="rounded-2xl border-border bg-card shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)] overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Generating report…
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="py-12 text-center">
            <div className="text-sm font-semibold text-foreground">No stock items found</div>
            <div className="mt-1 text-xs text-muted-foreground">Add products to see stock values</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Code</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Unit</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Qty on Hand</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Cost Price</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Total Value</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item, i) => (
                <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5 text-sm font-medium text-foreground">{item.code}</td>
                  <td className="px-4 py-2.5 text-sm text-foreground">{item.name}</td>
                  <td className="px-4 py-2.5 text-sm text-foreground capitalize">{item.product_type}</td>
                  <td className="px-4 py-2.5 text-sm text-foreground">{item.unit}</td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{item.qty_on_hand}</td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{formatCurrency(item.cost_price)}</td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{formatCurrency(item.total_value)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                <td colSpan={6} className="px-4 py-2.5 text-sm text-foreground text-right">Total Value</td>
                <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{formatCurrency(data.total_value)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
