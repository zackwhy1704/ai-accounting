import { useState } from "react"
import { Info, Loader2, Download } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { formatCurrency, downloadCSV } from "../../lib/utils"
import api from "../../lib/api"

interface GstF5 {
  period_start: string
  period_end: string
  currency: string
  boxes: {
    box1_standard_rated_supplies: number
    box5_taxable_purchases: number
    box6_output_tax: number
    box7_input_tax: number
    box8_net_gst_payable: number
  }
  net_payable: number
  net_refundable: number
}

const BOX_LABELS: Record<string, string> = {
  box1_standard_rated_supplies: "Box 1 — Total value of standard-rated supplies",
  box5_taxable_purchases: "Box 5 — Total value of taxable purchases",
  box6_output_tax: "Box 6 — Output tax due",
  box7_input_tax: "Box 7 — Input tax and refunds claimed",
  box8_net_gst_payable: "Box 8 — Net GST payable / (refundable)",
}

export default function SgCompliancePage() {
  const thisYear = new Date().getFullYear()
  const [fromDate, setFromDate] = useState(`${thisYear}-01-01`)
  const [toDate, setToDate] = useState(`${thisYear}-03-31`)
  const [query, setQuery] = useState<{ from: string; to: string } | null>(null)

  const { data, isLoading, isFetching } = useQuery<GstF5>({
    queryKey: ["gst-f5", query],
    queryFn: () => api.get(`/sg-compliance/gst-f5?quarter_start=${query!.from}&quarter_end=${query!.to}`).then(r => r.data),
    enabled: !!query,
  })

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Compliance</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Singapore GST</div>
        <div className="mt-1 text-sm text-muted-foreground">GST F5 quarterly return, computed from your general ledger</div>
      </div>

      <Card className="rounded-2xl border-border bg-card p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Quarter start</label>
            <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-9 text-sm w-44" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Quarter end</label>
            <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-9 text-sm w-44" />
          </div>
          <Button type="button" disabled={isFetching} onClick={() => setQuery({ from: fromDate, to: toDate })} className="h-9 bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-4 text-sm text-white">
            {isFetching ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null} Generate F5
          </Button>
        </div>
      </Card>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Computing…</div>
      ) : data ? (
        <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-sm font-semibold text-foreground">GST F5 — {data.period_start} to {data.period_end}</div>
            <Button variant="outline" size="sm" onClick={() => downloadCSV(`gst-f5-${data.period_start}.csv`, [
              ["GST F5 Return", `${data.period_start} to ${data.period_end}`],
              [],
              ...Object.entries(data.boxes).map(([k, v]) => [BOX_LABELS[k] ?? k, (v as number).toFixed(2)]),
            ])}><Download className="mr-1.5 h-3.5 w-3.5" /> CSV</Button>
          </div>
          <div className="divide-y divide-border rounded-xl border border-border">
            {Object.entries(data.boxes).map(([k, v]) => (
              <div key={k} className={`flex items-center justify-between px-4 py-2.5 ${k === "box8_net_gst_payable" ? "bg-muted/40 font-semibold" : ""}`}>
                <span className="text-sm text-muted-foreground">{BOX_LABELS[k] ?? k}</span>
                <span className="text-sm tabular-nums text-foreground">{formatCurrency(v as number, data.currency)}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 text-sm">
            {data.net_payable > 0
              ? <span>Net GST <b className="text-rose-600">payable</b>: {formatCurrency(data.net_payable, data.currency)}</span>
              : <span>Net GST <b className="text-emerald-600">refundable</b>: {formatCurrency(data.net_refundable, data.currency)}</span>}
          </div>
        </Card>
      ) : null}

      <Card className="rounded-2xl border border-border/60 bg-card shadow-sm p-6">
        <div className="flex items-start gap-2 rounded-xl bg-muted/50 px-4 py-3">
          <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            IRAS InvoiceNow (PEPPOL) e-invoicing integration is coming soon. The GST F5 figures above are derived
            from posted journal entries against your output/input tax accounts.
          </p>
        </div>
      </Card>
    </div>
  )
}
