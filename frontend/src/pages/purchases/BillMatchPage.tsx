import { Loader2, ArrowLeft, CheckCircle2, AlertTriangle } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate, useParams } from "react-router-dom"
import { Card } from "../../components/ui/card"
import { formatCurrency } from "../../lib/utils"
import api from "../../lib/api"

interface MatchRow {
  description: string
  po_qty: number
  po_unit_price: number | null
  received_qty: number
  bill_qty: number
  bill_unit_price: number | null
  qty_variance: number | null
  price_variance: number | null
  issues: string[]
  matched: boolean
}

interface MatchResult {
  bill_number: string
  po_number: string | null
  has_po: boolean
  has_grn: boolean
  fully_matched: boolean
  rows: MatchRow[]
}

const ISSUE_LABELS: Record<string, string> = {
  billed_more_than_ordered: "Billed more than ordered",
  billed_more_than_received: "Billed more than received",
  received_more_than_ordered: "Received more than ordered",
  price_mismatch: "Price differs from PO",
  not_on_po: "Not on the PO",
}

export default function BillMatchPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data, isLoading } = useQuery<MatchResult>({
    queryKey: ["three-way-match", id],
    queryFn: () => api.get(`/bills/${id}/three-way-match`).then(r => r.data),
    enabled: !!id,
  })

  return (
    <div className="flex flex-col gap-4">
      <div>
        <button type="button" onClick={() => navigate("/purchases/bills")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Bills
        </button>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          3-Way Match {data ? `— ${data.bill_number}` : ""}
        </div>
        <div className="mt-1 text-sm text-muted-foreground">
          Ordered (PO) vs received (GRN) vs billed — review variances before approving the bill
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Matching…
        </div>
      ) : data ? (
        <>
          <div className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium border ${
            data.fully_matched
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : "bg-amber-50 border-amber-200 text-amber-700"
          }`}>
            {data.fully_matched ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {data.fully_matched
              ? `Fully matched against ${data.po_number ?? "PO"}${data.has_grn ? " and GRN" : ""}`
              : !data.has_po && !data.has_grn
                ? "No linked purchase order or GRN — link the bill to a PO to enable matching"
                : "Variances found — review before approving"}
          </div>

          <Card className="rounded-2xl border-border bg-card shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Line</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Ordered</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Received</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Billed</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">PO Price</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Bill Price</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Result</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={i} className={`border-b border-border last:border-0 ${r.matched ? "" : "bg-amber-50/40 dark:bg-amber-950/10"}`}>
                    <td className="px-4 py-2.5 text-sm text-foreground">{r.description}</td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums text-muted-foreground">{r.po_qty || "—"}</td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums text-muted-foreground">{r.received_qty || "—"}</td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{r.bill_qty || "—"}</td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums text-muted-foreground">
                      {r.po_unit_price !== null ? formatCurrency(r.po_unit_price) : "—"}
                    </td>
                    <td className={`px-4 py-2.5 text-right text-sm tabular-nums ${r.issues.includes("price_mismatch") ? "text-rose-600 font-medium" : "text-foreground"}`}>
                      {r.bill_unit_price !== null ? formatCurrency(r.bill_unit_price) : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      {r.matched ? (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" /> Matched
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {r.issues.map(issue => (
                            <span key={issue} className="inline-flex items-center gap-1 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                              <AlertTriangle className="h-3 w-3" /> {ISSUE_LABELS[issue] ?? issue}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-xs text-muted-foreground">Nothing to match</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </>
      ) : null}
    </div>
  )
}
