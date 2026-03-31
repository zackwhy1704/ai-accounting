import { useState } from "react"
import { Loader2, Send, FileText, CheckCircle2, XCircle, Clock, AlertCircle } from "lucide-react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Badge } from "../../components/ui/badge"
import { useToast } from "../../components/ui/toast"
import { formatCurrency, formatDate } from "../../lib/utils"
import api from "../../lib/api"

type SubmissionStatus = "submitted" | "validated" | "pending" | "rejected" | "cancelled"

interface EInvoiceSubmission {
  id: string
  invoice_no: string
  invoice_date: string
  amount: number
  currency: string
  submission_status: SubmissionStatus
  uuid: string | null
  submission_date: string | null
  validation_status: string | null
  rejection_reason: string | null
}

type Tab = "transactions" | "documents"

const STATUS_CONFIG: Record<SubmissionStatus, { label: string; className: string; icon: React.ReactNode }> = {
  submitted: { label: "Submitted", className: "bg-emerald-100 text-emerald-700", icon: <CheckCircle2 className="h-3 w-3" /> },
  validated: { label: "Validated", className: "bg-blue-100 text-blue-700", icon: <CheckCircle2 className="h-3 w-3" /> },
  pending: { label: "Pending", className: "bg-amber-100 text-amber-700", icon: <Clock className="h-3 w-3" /> },
  rejected: { label: "Rejected", className: "bg-rose-100 text-rose-700", icon: <XCircle className="h-3 w-3" /> },
  cancelled: { label: "Cancelled", className: "bg-slate-100 text-slate-600", icon: <AlertCircle className="h-3 w-3" /> },
}

export default function MyInvoisPage() {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>("transactions")

  const { data: submissions = [], isLoading } = useQuery<EInvoiceSubmission[]>({
    queryKey: ["einvoice-submissions"],
    queryFn: () => api.get("/einvoice/submissions").then(r => r.data),
  })

  const submitMutation = useMutation({
    mutationFn: (id: string) => api.post(`/einvoice/submissions/${id}/submit`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["einvoice-submissions"] })
      toast("Submitted to LHDN", "success")
    },
    onError: () => toast("Submission failed", "warning"),
  })

  // Summary stats
  const stats = {
    total: submissions.length,
    validated: submissions.filter(s => s.submission_status === "validated" || s.submission_status === "submitted").length,
    rejected: submissions.filter(s => s.submission_status === "rejected").length,
    pending: submissions.filter(s => s.submission_status === "pending").length,
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">MyInvois</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">MyInvois (LHDN)</div>
        <div className="mt-1 text-sm text-muted-foreground">Malaysia e-invoice compliance portal</div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total Submitted", value: stats.total, color: "text-foreground", bg: "bg-muted/40" },
          { label: "Validated", value: stats.validated, color: "text-emerald-700", bg: "bg-emerald-50 dark:bg-emerald-950/20" },
          { label: "Rejected", value: stats.rejected, color: "text-rose-700", bg: "bg-rose-50 dark:bg-rose-950/20" },
          { label: "Pending", value: stats.pending, color: "text-amber-700", bg: "bg-amber-50 dark:bg-amber-950/20" },
        ].map(stat => (
          <div key={stat.label} className={`rounded-xl border border-border p-4 ${stat.bg}`}>
            <div className="text-xs text-muted-foreground">{stat.label}</div>
            <div className={`mt-1 text-2xl font-bold ${stat.color}`}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1">
        {(["transactions", "documents"] as Tab[]).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors ${tab === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading submissions…
        </div>
      ) : submissions.length === 0 ? (
        <Card className="rounded-2xl border-border bg-card p-12 text-center shadow-[0_0_0_1px_rgba(15,23,42,0.06)]">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <FileText className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="text-sm font-semibold text-foreground">No e-invoice submissions yet</div>
          <div className="mt-1 text-xs text-muted-foreground">Invoices submitted to LHDN will appear here</div>
        </Card>
      ) : tab === "transactions" ? (
        <Card className="rounded-2xl border-border bg-card shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Invoice No.</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Amount</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">UUID</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map(s => {
                const statusCfg = STATUS_CONFIG[s.submission_status] ?? STATUS_CONFIG.pending
                return (
                  <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2.5 text-sm font-medium text-foreground">{s.invoice_no}</td>
                    <td className="px-4 py-2.5 text-sm text-muted-foreground">{formatDate(s.invoice_date)}</td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{formatCurrency(s.amount, s.currency)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${statusCfg.className}`}>
                        {statusCfg.icon}
                        {statusCfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground max-w-[180px] truncate">
                      {s.uuid ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {s.submission_status === "pending" && (
                        <Button
                          type="button"
                          className="h-7 rounded-lg bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-2 text-xs text-white"
                          onClick={() => submitMutation.mutate(s.id)}
                          disabled={submitMutation.isPending}
                        >
                          {submitMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Send className="mr-1 h-3 w-3" /> Submit</>}
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      ) : (
        // Documents tab — cards view
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {submissions.map(s => {
            const statusCfg = STATUS_CONFIG[s.submission_status] ?? STATUS_CONFIG.pending
            return (
              <Card key={s.id} className="rounded-2xl border-border bg-card p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.06)]">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">{s.invoice_no}</div>
                    <div className="text-xs text-muted-foreground">{formatDate(s.invoice_date)}</div>
                  </div>
                  <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${statusCfg.className}`}>
                    {statusCfg.icon}
                    {statusCfg.label}
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Amount</span>
                    <span className="font-medium text-foreground">{formatCurrency(s.amount, s.currency)}</span>
                  </div>
                  {s.submission_date && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Submitted</span>
                      <span className="text-foreground">{formatDate(s.submission_date)}</span>
                    </div>
                  )}
                  {s.validation_status && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Validation</span>
                      <span className="text-foreground">{s.validation_status}</span>
                    </div>
                  )}
                  {s.uuid && (
                    <div>
                      <div className="text-muted-foreground mb-0.5">LHDN UUID</div>
                      <div className="font-mono text-[10px] text-foreground break-all">{s.uuid}</div>
                    </div>
                  )}
                  {s.rejection_reason && (
                    <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-rose-700">
                      <div className="font-medium mb-0.5">Rejection Reason</div>
                      <div>{s.rejection_reason}</div>
                    </div>
                  )}
                </div>

                {s.submission_status === "pending" && (
                  <div className="mt-3">
                    <Button
                      type="button"
                      className="w-full h-8 rounded-lg bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] text-xs text-white"
                      onClick={() => submitMutation.mutate(s.id)}
                      disabled={submitMutation.isPending}
                    >
                      {submitMutation.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Send className="mr-1 h-3 w-3" />}
                      Submit to LHDN
                    </Button>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
