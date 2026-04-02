import { useState, Fragment } from "react"
import { Loader2, Download, Printer } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { formatCurrency, downloadCSV, printReport } from "../../lib/utils"
import api from "../../lib/api"

interface CreditorBill {
  bill_number: string
  date: string
  due_date: string
  total: number
  paid: number
  balance: number
  status: string
}

interface CreditorVendor {
  vendor_name: string
  bills: CreditorBill[]
  total_invoiced: number
  total_paid: number
  total_balance: number
}

interface CreditorLedgerReport {
  customers: CreditorVendor[]
  grand_total_invoiced: number
  grand_total_paid: number
  grand_total_balance: number
}

export default function CreditorLedgerPage() {
  const thisYear = new Date().getFullYear()
  const [fromDate, setFromDate] = useState(`${thisYear}-01-01`)
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10))
  const [queryParams, setQueryParams] = useState({ fromDate: `${thisYear}-01-01`, toDate: new Date().toISOString().slice(0, 10) })

  const { data, isLoading, isFetching } = useQuery<CreditorLedgerReport>({
    queryKey: ["report-creditor-ledger", queryParams],
    queryFn: () => api.get(`/reports/creditor-ledger?start_date=${queryParams.fromDate}&end_date=${queryParams.toDate}`).then(r => r.data),
  })

  const statusColor = (s: string) => {
    switch (s) {
      case "paid": return "bg-emerald-100 text-emerald-700"
      case "partial": return "bg-amber-100 text-amber-700"
      case "overdue": return "bg-rose-100 text-rose-700"
      case "sent": return "bg-blue-100 text-blue-700"
      default: return "bg-muted text-muted-foreground"
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Reports</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Creditor Ledger</div>
        <div className="mt-1 text-sm text-muted-foreground">Outstanding bills grouped by vendor</div>
      </div>
      {data && data.customers.length > 0 && (
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={() => {
            const rows: string[][] = [
              ["Creditor Ledger", `${queryParams.fromDate} to ${queryParams.toDate}`],
              [],
              ["Vendor", "Bill #", "Date", "Due Date", "Total", "Paid", "Balance", "Status"],
            ]
            data.customers.forEach(v => {
              v.bills.forEach(bill => {
                rows.push([v.vendor_name, bill.bill_number, bill.date, bill.due_date, bill.total.toFixed(2), bill.paid.toFixed(2), bill.balance.toFixed(2), bill.status])
              })
              rows.push(["", "", "", "Subtotal", v.total_invoiced.toFixed(2), v.total_paid.toFixed(2), v.total_balance.toFixed(2), ""])
            })
            rows.push([], ["", "", "", "Grand Total", data.grand_total_invoiced.toFixed(2), data.grand_total_paid.toFixed(2), data.grand_total_balance.toFixed(2), ""])
            downloadCSV(`creditor-ledger-${queryParams.fromDate}-${queryParams.toDate}.csv`, rows)
          }}>
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
        ) : !data || data.customers.length === 0 ? (
          <div className="py-12 text-center">
            <div className="text-sm font-semibold text-foreground">No creditor records found</div>
            <div className="mt-1 text-xs text-muted-foreground">Try adjusting the date range</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Bill #</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Due Date</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Total</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Paid</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Balance</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.customers.map((vendor, vi) => (
                <Fragment key={vi}>
                  <tr className="bg-muted/20">
                    <td colSpan={7} className="px-4 py-2.5 text-sm font-semibold text-foreground">{vendor.vendor_name}</td>
                  </tr>
                  {vendor.bills.map((bill, bi) => (
                    <tr key={`${vi}-${bi}`} className="border-b border-border hover:bg-muted/30">
                      <td className="px-4 py-2.5 text-sm font-medium text-foreground">{bill.bill_number}</td>
                      <td className="px-4 py-2.5 text-sm text-foreground">{bill.date}</td>
                      <td className="px-4 py-2.5 text-sm text-foreground">{bill.due_date}</td>
                      <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{formatCurrency(bill.total)}</td>
                      <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{formatCurrency(bill.paid)}</td>
                      <td className={`px-4 py-2.5 text-right text-sm tabular-nums font-medium ${bill.balance > 0 ? "text-rose-600" : "text-foreground"}`}>{formatCurrency(bill.balance)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium capitalize ${statusColor(bill.status)}`}>{bill.status}</span>
                      </td>
                    </tr>
                  ))}
                  <tr className="border-b border-border bg-muted/10">
                    <td colSpan={3} className="px-4 py-2 text-sm font-medium text-muted-foreground text-right">Subtotal</td>
                    <td className="px-4 py-2 text-right text-sm tabular-nums font-semibold text-foreground">{formatCurrency(vendor.total_invoiced)}</td>
                    <td className="px-4 py-2 text-right text-sm tabular-nums font-semibold text-foreground">{formatCurrency(vendor.total_paid)}</td>
                    <td className="px-4 py-2 text-right text-sm tabular-nums font-semibold text-foreground">{formatCurrency(vendor.total_balance)}</td>
                    <td />
                  </tr>
                </Fragment>
              ))}
              <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                <td colSpan={3} className="px-4 py-2.5 text-sm text-foreground text-right">Grand Total</td>
                <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{formatCurrency(data.grand_total_invoiced)}</td>
                <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{formatCurrency(data.grand_total_paid)}</td>
                <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{formatCurrency(data.grand_total_balance)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
