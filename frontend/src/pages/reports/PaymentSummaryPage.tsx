import { useState } from "react"
import { Loader2 } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { formatCurrency } from "../../lib/utils"
import api from "../../lib/api"

interface PaymentSummaryItem {
  customer_name: string
  invoice_count: number
  total_paid: number
}

interface PaymentSummaryReport {
  start_date: string
  end_date: string
  items: PaymentSummaryItem[]
  total: number
}

export default function PaymentSummaryPage() {
  const thisYear = new Date().getFullYear()
  const [fromDate, setFromDate] = useState(`${thisYear}-01-01`)
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10))
  const [queryParams, setQueryParams] = useState({ fromDate: `${thisYear}-01-01`, toDate: new Date().toISOString().slice(0, 10) })

  const { data, isLoading, isFetching } = useQuery<PaymentSummaryReport>({
    queryKey: ["report-payment-summary", queryParams],
    queryFn: () => api.get(`/reports/payment-summary?start_date=${queryParams.fromDate}&end_date=${queryParams.toDate}`).then(r => r.data),
  })

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Reports</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Payment Summary</div>
        <div className="mt-1 text-sm text-muted-foreground">Sales payments received by customer</div>
      </div>

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
            <div className="text-sm font-semibold text-foreground">No payments found</div>
            <div className="mt-1 text-xs text-muted-foreground">Try adjusting the date range</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Customer</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Invoices</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Total Paid</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item, i) => (
                <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5 text-sm font-medium text-foreground">{item.customer_name}</td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{item.invoice_count}</td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums font-medium text-foreground">{formatCurrency(item.total_paid)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-border bg-muted/40">
                <td colSpan={2} className="px-4 py-2.5 text-xs font-semibold text-foreground">Total</td>
                <td className="px-4 py-2.5 text-right text-xs font-bold tabular-nums text-foreground">{formatCurrency(data.total)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
