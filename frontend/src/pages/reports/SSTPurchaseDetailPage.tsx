import { useState } from "react"
import { Loader2, Download, Printer } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { formatCurrency, downloadCSV, printReport } from "../../lib/utils"
import api from "../../lib/api"

interface SSTPurchaseItem {
  bill_number: string
  date: string
  vendor_name: string
  description: string
  quantity: number
  unit_price: number
  taxable_amount: number
  tax_rate: number
  tax_amount: number
}

interface SSTPurchaseDetailReport {
  items: SSTPurchaseItem[]
  total_taxable: number
  total_tax: number
}

export default function SSTPurchaseDetailPage() {
  const thisYear = new Date().getFullYear()
  const [fromDate, setFromDate] = useState(`${thisYear}-01-01`)
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10))
  const [queryParams, setQueryParams] = useState({ fromDate: `${thisYear}-01-01`, toDate: new Date().toISOString().slice(0, 10) })

  const { data, isLoading, isFetching } = useQuery<SSTPurchaseDetailReport>({
    queryKey: ["report-sst-purchase-detail", queryParams],
    queryFn: () => api.get(`/reports/sst-purchase-detail?start_date=${queryParams.fromDate}&end_date=${queryParams.toDate}`).then(r => r.data),
  })

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Reports</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">SST Purchase Detail</div>
        <div className="mt-1 text-sm text-muted-foreground">Purchase tax detail by bill line item</div>
      </div>
      {data && data.items.length > 0 && (
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={() => downloadCSV(`sst-purchase-detail-${queryParams.fromDate}-${queryParams.toDate}.csv`, [
            ["SST Purchase Detail", `${queryParams.fromDate} to ${queryParams.toDate}`],
            [],
            ["Bill #", "Date", "Vendor", "Description", "Qty", "Unit Price", "Taxable Amount", "Tax Rate %", "Tax Amount"],
            ...data.items.map(i => [i.bill_number, i.date, i.vendor_name, i.description, String(i.quantity), i.unit_price.toFixed(2), i.taxable_amount.toFixed(2), i.tax_rate.toFixed(2), i.tax_amount.toFixed(2)]),
            [],
            ["", "", "", "", "", "", data.total_taxable.toFixed(2), "", data.total_tax.toFixed(2)],
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
            <div className="text-sm font-semibold text-foreground">No SST purchase records found</div>
            <div className="mt-1 text-xs text-muted-foreground">Try adjusting the date range</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Bill #</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Vendor</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Description</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Qty</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Unit Price</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Taxable Amt</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Tax %</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Tax Amt</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item, i) => (
                <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5 text-sm font-medium text-foreground">{item.bill_number}</td>
                  <td className="px-4 py-2.5 text-sm text-foreground">{item.date}</td>
                  <td className="px-4 py-2.5 text-sm text-foreground">{item.vendor_name}</td>
                  <td className="px-4 py-2.5 text-sm text-foreground">{item.description}</td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{item.quantity}</td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{formatCurrency(item.unit_price)}</td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{formatCurrency(item.taxable_amount)}</td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{item.tax_rate}%</td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{formatCurrency(item.tax_amount)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                <td colSpan={6} className="px-4 py-2.5 text-sm text-foreground text-right">Total</td>
                <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{formatCurrency(data.total_taxable)}</td>
                <td />
                <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{formatCurrency(data.total_tax)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
