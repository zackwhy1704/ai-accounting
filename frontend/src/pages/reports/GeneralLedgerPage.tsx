import { useState } from "react"
import { Loader2, Download, Printer } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { formatCurrency, formatDate, downloadCSV, printReport } from "../../lib/utils"
import api from "../../lib/api"

interface LedgerEntry {
  date: string
  description: string
  reference: string | null
  debit: number
  credit: number
  balance: number
}

interface LedgerAccount {
  account_code: string
  account_name: string
  account_type: string
  entries: LedgerEntry[]
  opening_balance: number
  closing_balance: number
}

interface GeneralLedgerReport {
  accounts: LedgerAccount[]
  from_date: string
  to_date: string
}

export default function GeneralLedgerPage() {
  const thisYear = new Date().getFullYear()
  const [fromDate, setFromDate] = useState(`${thisYear}-01-01`)
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10))
  const [account, setAccount] = useState("")
  const [queryParams, setQueryParams] = useState({ fromDate: `${thisYear}-01-01`, toDate: new Date().toISOString().slice(0, 10), account: "" })

  const { data, isLoading, isFetching } = useQuery<GeneralLedgerReport>({
    queryKey: ["report-general-ledger", queryParams],
    queryFn: () => {
      const params = new URLSearchParams({
        from_date: queryParams.fromDate,
        to_date: queryParams.toDate,
      })
      if (queryParams.account) params.set("account", queryParams.account)
      return api.get(`/reports/general-ledger?${params.toString()}`).then(r => r.data)
    },
  })

  const handleUpdate = () => {
    setQueryParams({ fromDate, toDate, account })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Reports</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">General Ledger</div>
          <div className="mt-1 text-sm text-muted-foreground">All transactions grouped by account</div>
        </div>
      </div>

      {data && data.accounts.length > 0 && (
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={() => {
            const rows: string[][] = [
              ["General Ledger", `${queryParams.fromDate} to ${queryParams.toDate}`],
              [],
              ["Account Code", "Account Name", "Date", "Description", "Reference", "Debit", "Credit", "Balance"],
            ]
            data.accounts.forEach(acc => {
              acc.entries.forEach(e => {
                rows.push([acc.account_code, acc.account_name, e.date, e.description, e.reference ?? "", e.debit > 0 ? e.debit.toFixed(2) : "", e.credit > 0 ? e.credit.toFixed(2) : "", e.balance.toFixed(2)])
              })
            })
            downloadCSV(`general-ledger-${queryParams.fromDate}-${queryParams.toDate}.csv`, rows)
          }}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={printReport}>
            <Printer className="mr-1.5 h-3.5 w-3.5" /> Print / PDF
          </Button>
        </div>
      )}

      {/* Filter panel */}
      <Card className="rounded-2xl border-border bg-card p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">From Date</label>
            <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">To Date</label>
            <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Account (search)</label>
            <Input placeholder="e.g. Cash, 1000" value={account} onChange={e => setAccount(e.target.value)} className="h-9 text-sm" />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <Button type="button" onClick={handleUpdate} className="h-9 bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-4 text-sm text-white" disabled={isFetching}>
            {isFetching ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
            Update
          </Button>
        </div>
      </Card>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Generating report…
        </div>
      ) : !data || data.accounts.length === 0 ? (
        <Card className="rounded-2xl border-border bg-card p-12 text-center shadow-[0_0_0_1px_rgba(15,23,42,0.06)]">
          <div className="text-sm font-semibold text-foreground">No transactions found</div>
          <div className="mt-1 text-xs text-muted-foreground">Try adjusting the date range or account filter</div>
        </Card>
      ) : (
        <div className="space-y-4">
          {data.accounts.map(acc => (
            <Card key={acc.account_code} className="rounded-2xl border-border bg-card shadow-[0_0_0_1px_rgba(15,23,42,0.06)] overflow-hidden">
              {/* Account header */}
              <div className="border-b border-border bg-muted/30 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-mono text-muted-foreground mr-2">{acc.account_code}</span>
                    <span className="text-sm font-semibold text-foreground">{acc.account_name}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>Opening: <span className="font-medium text-foreground">{formatCurrency(acc.opening_balance)}</span></span>
                    <span>Closing: <span className="font-semibold text-foreground">{formatCurrency(acc.closing_balance)}</span></span>
                  </div>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Date</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Description</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Reference</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Debit</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Credit</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {acc.entries.map((entry, i) => (
                    <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">{formatDate(entry.date)}</td>
                      <td className="px-4 py-2 text-sm text-foreground">{entry.description}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{entry.reference ?? "—"}</td>
                      <td className="px-4 py-2 text-right text-sm tabular-nums text-foreground">{entry.debit > 0 ? formatCurrency(entry.debit) : "—"}</td>
                      <td className="px-4 py-2 text-right text-sm tabular-nums text-foreground">{entry.credit > 0 ? formatCurrency(entry.credit) : "—"}</td>
                      <td className={`px-4 py-2 text-right text-sm tabular-nums font-medium ${entry.balance < 0 ? "text-rose-600" : "text-foreground"}`}>
                        {formatCurrency(entry.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
