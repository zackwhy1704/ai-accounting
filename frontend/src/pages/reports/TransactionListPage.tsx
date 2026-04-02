import { useState } from "react"
import { Loader2, Download, Printer } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { formatCurrency, downloadCSV, printReport } from "../../lib/utils"
import api from "../../lib/api"

interface TransactionEntry {
  account_code: string
  account_name: string
  debit: number
  credit: number
}

interface Transaction {
  date: string
  description: string
  reference: string
  source: string
  entries: TransactionEntry[]
}

interface TransactionListReport {
  transactions: Transaction[]
  total_debit: number
  total_credit: number
}

export default function TransactionListPage() {
  const thisYear = new Date().getFullYear()
  const [fromDate, setFromDate] = useState(`${thisYear}-01-01`)
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10))
  const [queryParams, setQueryParams] = useState({ fromDate: `${thisYear}-01-01`, toDate: new Date().toISOString().slice(0, 10) })

  const { data, isLoading, isFetching } = useQuery<TransactionListReport>({
    queryKey: ["report-transaction-list", queryParams],
    queryFn: () => api.get(`/reports/transaction-list?start_date=${queryParams.fromDate}&end_date=${queryParams.toDate}`).then(r => r.data),
  })

  const flatRows = data?.transactions.flatMap(t =>
    t.entries.map(e => ({ ...t, ...e }))
  ) ?? []

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Reports</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Transaction List</div>
        <div className="mt-1 text-sm text-muted-foreground">All transactions with journal entries for a period</div>
      </div>
      {data && flatRows.length > 0 && (
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={() => downloadCSV(`transaction-list-${queryParams.fromDate}-${queryParams.toDate}.csv`, [
            ["Transaction List", `${queryParams.fromDate} to ${queryParams.toDate}`],
            [],
            ["Date", "Description", "Reference", "Source", "Account Code", "Account", "Debit", "Credit"],
            ...flatRows.map(r => [r.date, r.description, r.reference, r.source, r.account_code, r.account_name, r.debit.toFixed(2), r.credit.toFixed(2)]),
            [],
            ["", "", "", "", "", "Total", data.total_debit.toFixed(2), data.total_credit.toFixed(2)],
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
        ) : !data || data.transactions.length === 0 ? (
          <div className="py-12 text-center">
            <div className="text-sm font-semibold text-foreground">No transactions found</div>
            <div className="mt-1 text-xs text-muted-foreground">Try adjusting the date range</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Description</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Reference</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Source</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Account</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Debit</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Credit</th>
              </tr>
            </thead>
            <tbody>
              {data.transactions.map((txn, ti) =>
                txn.entries.map((entry, ei) => (
                  <tr key={`${ti}-${ei}`} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2.5 text-sm text-foreground">{ei === 0 ? txn.date : ""}</td>
                    <td className="px-4 py-2.5 text-sm text-foreground">{ei === 0 ? txn.description : ""}</td>
                    <td className="px-4 py-2.5 text-sm text-foreground">{ei === 0 ? txn.reference : ""}</td>
                    <td className="px-4 py-2.5 text-sm text-foreground">{ei === 0 ? txn.source : ""}</td>
                    <td className="px-4 py-2.5 text-sm text-foreground">
                      <span className="text-muted-foreground">{entry.account_code}</span> {entry.account_name}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{entry.debit ? formatCurrency(entry.debit) : ""}</td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{entry.credit ? formatCurrency(entry.credit) : ""}</td>
                  </tr>
                ))
              )}
              <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                <td colSpan={5} className="px-4 py-2.5 text-sm text-foreground">Total</td>
                <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{formatCurrency(data.total_debit)}</td>
                <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{formatCurrency(data.total_credit)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
