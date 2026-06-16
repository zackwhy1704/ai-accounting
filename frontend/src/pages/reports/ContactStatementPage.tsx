import { QueryError } from "../../components/ui/query-error"
import { useState } from "react"
import { useSearchParams } from "react-router-dom"
import { Loader2, Download, Printer } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { SearchableSelect } from "../../components/ui/searchable-select"
import { useContacts } from "../../lib/hooks"
import { formatCurrency, downloadCSV, printReport } from "../../lib/utils"
import api from "../../lib/api"

interface StatementLine {
  ts: string | null
  type: string
  ref: string
  description: string
  amount: number
  balance: number
}

interface ContactStatement {
  contact_id: string
  contact_name: string
  start_date: string
  end_date: string
  currency: string
  lines: StatementLine[]
  closing_balance: number
}

const TYPE_LABEL: Record<string, string> = {
  invoice: "Invoice", payment: "Payment", credit_note: "Credit Note", refund: "Refund",
}

export default function ContactStatementPage() {
  const [searchParams] = useSearchParams()
  const thisYear = new Date().getFullYear()
  const { data: contacts = [] } = useContacts()
  const [contactId, setContactId] = useState(searchParams.get("contact_id") ?? "")
  const [fromDate, setFromDate] = useState(`${thisYear}-01-01`)
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10))
  const [query, setQuery] = useState<{ contactId: string; fromDate: string; toDate: string } | null>(
    searchParams.get("contact_id") ? { contactId: searchParams.get("contact_id")!, fromDate: `${thisYear}-01-01`, toDate: new Date().toISOString().slice(0, 10) } : null
  )

  const { data, isLoading, isFetching, isError, error } = useQuery<ContactStatement>({
    queryKey: ["contact-statement", query],
    queryFn: () => api.get(`/reports/contact-statement?contact_id=${query!.contactId}&start_date=${query!.fromDate}&end_date=${query!.toDate}`).then(r => r.data),
    enabled: !!query?.contactId,
  })

  const contactOptions = contacts.map((c: any) => ({ value: c.id, label: c.name }))

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Reports</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Contact Statement</div>
        <div className="mt-1 text-sm text-muted-foreground">All transactions and running balance for a contact in a period</div>
      </div>

      <Card className="rounded-2xl border-border bg-card p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5 min-w-[14rem]">
            <label className="text-xs font-medium text-muted-foreground">Contact</label>
            <SearchableSelect value={contactId} onChange={setContactId} options={contactOptions} placeholder="Select a contact…" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">From Date</label>
            <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-9 text-sm w-44" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">To Date</label>
            <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-9 text-sm w-44" />
          </div>
          <Button type="button" disabled={!contactId || isFetching} onClick={() => setQuery({ contactId, fromDate, toDate })} className="h-9 bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-4 text-sm text-white">
            {isFetching ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
            Generate
          </Button>
        </div>
      </Card>

      {data && (
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={() => downloadCSV(`statement-${data.contact_name}-${data.start_date}.csv`, [
            ["Statement", data.contact_name, `${data.start_date} to ${data.end_date}`],
            [],
            ["Date", "Type", "Reference", "Amount", "Balance"],
            ...data.lines.map(l => [l.ts ? new Date(l.ts).toLocaleDateString() : "", TYPE_LABEL[l.type] ?? l.type, l.ref, l.amount.toFixed(2), l.balance.toFixed(2)]),
            [],
            ["Closing Balance", "", "", "", data.closing_balance.toFixed(2)],
          ])}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={printReport}><Printer className="mr-1.5 h-3.5 w-3.5" /> Print / PDF</Button>
        </div>
      )}

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Generating…</div>
      ) : data ? (
        <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)] overflow-hidden">
          <div className="mb-4 text-sm font-semibold text-foreground">{data.contact_name}</div>
          {data.lines.length === 0 ? (
            <div className="text-sm text-muted-foreground">No transactions in this period.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-2 py-2 text-left">Date</th>
                  <th className="px-2 py-2 text-left">Type</th>
                  <th className="px-2 py-2 text-left">Reference</th>
                  <th className="px-2 py-2 text-right">Amount</th>
                  <th className="px-2 py-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map((l, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-2 py-2 text-muted-foreground">{l.ts ? new Date(l.ts).toLocaleDateString() : "—"}</td>
                    <td className="px-2 py-2">{TYPE_LABEL[l.type] ?? l.type}</td>
                    <td className="px-2 py-2 text-muted-foreground">{l.ref}</td>
                    <td className={`px-2 py-2 text-right tabular-nums ${l.amount < 0 ? "text-emerald-600" : "text-foreground"}`}>{formatCurrency(l.amount, data.currency)}</td>
                    <td className="px-2 py-2 text-right tabular-nums font-medium">{formatCurrency(l.balance, data.currency)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border font-semibold">
                  <td className="px-2 py-2.5" colSpan={4}>Closing Balance</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{formatCurrency(data.closing_balance, data.currency)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </Card>
      ) : isError ? (
        <Card className="rounded-2xl border-border bg-card p-4 shadow-sm"><QueryError error={error} message="Couldn't generate this report." /></Card>
      ) : null}
    </div>
  )
}
