import { QueryError } from "../../components/ui/query-error"
import { useState, Fragment } from "react"
import { useNavigate } from "react-router-dom"
import { Loader2, Download, Printer } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { formatCurrency, downloadCSV, printReport } from "../../lib/utils"
import api from "../../lib/api"

interface CreditorLine {
  date: string | null
  reference: string
  type: string
  debit: number
  credit: number
  balance: number
}

interface CreditorVendor {
  vendor_name: string
  lines: CreditorLine[]
  total_debit: number
  total_credit: number
  balance: number
}

interface CreditorLedgerReport {
  vendors: CreditorVendor[]
  grand_total_debit: number
  grand_total_credit: number
  grand_total_balance: number
}

export default function CreditorLedgerPage() {
  const navigate = useNavigate()

  const DOC_ROUTES: Record<string, (id: string) => string> = {
    invoice: id => `/sales/invoices/${id}/edit`,
    credit_note: id => `/sales/credit-notes/${id}/edit`,
    debit_note: id => `/sales/debit-notes/${id}/edit`,
    sales_payment: id => `/sales/payments/${id}/edit`,
    sales_refund: id => `/sales/refunds/${id}/edit`,
    payment: id => `/sales/payments/${id}/edit`,
    refund: id => `/sales/refunds/${id}/edit`,
    bill: id => `/purchases/bills/${id}/edit`,
    purchase_credit_note: id => `/purchases/credit-notes/${id}/edit`,
    purchase_debit_note: id => `/purchases/debit-notes/${id}/edit`,
    purchase_payment: id => `/purchases/payments/${id}/edit`,
    purchase_refund: id => `/purchases/refunds/${id}/edit`,
    manual_journal: id => `/accounting/journals/${id}/edit`,
  }
  const openDoc = (route?: string | null, id?: string | null) => {
    if (!route || !id) return
    const to = DOC_ROUTES[route]
    if (to) navigate(to(id))
  }
  const thisYear = new Date().getFullYear()
  const [fromDate, setFromDate] = useState(`${thisYear}-01-01`)
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10))
  const [queryParams, setQueryParams] = useState({ fromDate: `${thisYear}-01-01`, toDate: new Date().toISOString().slice(0, 10) })

  const { data, isLoading, isFetching, isError, error } = useQuery<CreditorLedgerReport>({
    queryKey: ["report-creditor-ledger", queryParams],
    queryFn: () => api.get(`/reports/creditor-ledger?start_date=${queryParams.fromDate}&end_date=${queryParams.toDate}`).then(r => r.data),
  })

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Reports</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Creditor Ledger</div>
        <div className="mt-1 text-sm text-muted-foreground">Running Debit/Credit ledger per vendor</div>
      </div>
      {data && (data.vendors?.length ?? 0) > 0 && (
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={() => {
            const rows: string[][] = [
              ["Creditor Ledger", `${queryParams.fromDate} to ${queryParams.toDate}`],
              [],
              ["Vendor", "Date", "Reference", "Type", "Debit", "Credit", "Balance"],
            ]
            data?.vendors?.forEach(v => {
              v.lines.forEach(l => {
                rows.push([v.vendor_name, l.date ?? "", l.reference, l.type, l.debit > 0 ? l.debit.toFixed(2) : "", l.credit > 0 ? l.credit.toFixed(2) : "", l.balance.toFixed(2)])
              })
              rows.push(["", "", "", "Subtotal", v.total_debit.toFixed(2), v.total_credit.toFixed(2), v.balance.toFixed(2)])
            })
            rows.push([], ["", "", "", "Grand Total", data.grand_total_debit.toFixed(2), data.grand_total_credit.toFixed(2), data.grand_total_balance.toFixed(2)])
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
              ) : isError ? (
        <Card className="rounded-2xl border-border bg-card p-4 shadow-sm"><QueryError error={error} message="Couldn't generate this report." /></Card>
      ) : !data || (data.vendors?.length ?? 0) === 0 ? (
          <div className="py-12 text-center">
            <div className="text-sm font-semibold text-foreground">No creditor records found</div>
            <div className="mt-1 text-xs text-muted-foreground">Try adjusting the date range</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Reference</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Debit</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Credit</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Balance</th>
              </tr>
            </thead>
            <tbody>
              {(data?.vendors ?? []).map((vendor, vi) => (
                <Fragment key={vi}>
                  <tr className="bg-muted/20">
                    <td colSpan={6} className="px-4 py-2.5 text-sm font-semibold text-foreground">{vendor.vendor_name}</td>
                  </tr>
                  {vendor.lines.map((l, li) => (
                    <tr
                      key={`${vi}-${li}`}
                      className={`border-b border-border hover:bg-muted/30 ${(l as any).doc_id ? "cursor-pointer" : ""}`}
                      title={(l as any).doc_id ? "Open source document" : undefined}
                      onClick={() => openDoc((l as any).doc_route, (l as any).doc_id)}
                    >
                      <td className="px-4 py-2.5 text-sm text-foreground">{l.date}</td>
                      <td className="px-4 py-2.5 text-sm font-medium text-foreground">{l.reference}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{l.type}</td>
                      <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{l.debit > 0 ? formatCurrency(l.debit) : "—"}</td>
                      <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{l.credit > 0 ? formatCurrency(l.credit) : "—"}</td>
                      <td className={`px-4 py-2.5 text-right text-sm tabular-nums font-medium ${l.balance > 0 ? "text-rose-600" : "text-foreground"}`}>{formatCurrency(l.balance)}</td>
                    </tr>
                  ))}
                  <tr className="border-b border-border bg-muted/10">
                    <td colSpan={3} className="px-4 py-2 text-sm font-medium text-muted-foreground text-right">Subtotal</td>
                    <td className="px-4 py-2 text-right text-sm tabular-nums font-semibold text-foreground">{formatCurrency(vendor.total_debit)}</td>
                    <td className="px-4 py-2 text-right text-sm tabular-nums font-semibold text-foreground">{formatCurrency(vendor.total_credit)}</td>
                    <td className="px-4 py-2 text-right text-sm tabular-nums font-semibold text-foreground">{formatCurrency(vendor.balance)}</td>
                  </tr>
                </Fragment>
              ))}
              <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                <td colSpan={3} className="px-4 py-2.5 text-sm text-foreground text-right">Grand Total</td>
                <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{formatCurrency(data.grand_total_debit)}</td>
                <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{formatCurrency(data.grand_total_credit)}</td>
                <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{formatCurrency(data.grand_total_balance)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
