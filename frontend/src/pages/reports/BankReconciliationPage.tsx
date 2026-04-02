import { useRef } from "react"
import { Loader2, Upload, Check, X, Sparkles, RefreshCw, Download, Printer } from "lucide-react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { formatCurrency, formatDate, downloadCSV, printReport } from "../../lib/utils"
import api from "../../lib/api"

interface BankStatementLine {
  id: string
  date: string
  description: string
  reference: string | null
  amount: number
  balance: number | null
  status: "unmatched" | "matched" | "reconciled"
  matched_transaction_id: string | null
  match_confidence: number | null
  match_reason: string | null
  matched_transaction?: {
    date: string
    description: string
    reference: string | null
  }
}

interface ReconciliationSummary {
  total: number
  matched: number
  reconciled: number
  unmatched: number
}

export default function BankReconciliationPage() {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: lines, isLoading: linesLoading } = useQuery<BankStatementLine[]>({
    queryKey: ["bank-reconciliation-lines"],
    queryFn: () => api.get("/bank-reconciliation/lines").then(r => r.data),
  })

  const { data: summary } = useQuery<ReconciliationSummary>({
    queryKey: ["bank-reconciliation-summary"],
    queryFn: () => api.get("/bank-reconciliation/summary").then(r => r.data),
  })

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["bank-reconciliation-lines"] })
    queryClient.invalidateQueries({ queryKey: ["bank-reconciliation-summary"] })
  }

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData()
      formData.append("file", file)
      return api.post("/bank-reconciliation/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })
    },
    onSuccess: () => invalidateAll(),
  })

  const autoMatchMutation = useMutation({
    mutationFn: () => api.post("/bank-reconciliation/auto-match"),
    onSuccess: () => invalidateAll(),
  })

  const confirmMutation = useMutation({
    mutationFn: (lineId: string) => api.post(`/bank-reconciliation/confirm/${lineId}`),
    onSuccess: () => invalidateAll(),
  })

  const rejectMutation = useMutation({
    mutationFn: (lineId: string) => api.post(`/bank-reconciliation/unmatch/${lineId}`),
    onSuccess: () => invalidateAll(),
  })

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      uploadMutation.mutate(file)
      e.target.value = ""
    }
  }

  const hasLines = lines && lines.length > 0

  const statusBadge = (status: BankStatementLine["status"]) => {
    const styles = {
      reconciled: "bg-emerald-100 text-emerald-700",
      matched: "bg-blue-100 text-blue-700",
      unmatched: "bg-gray-100 text-gray-500",
    }
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${styles[status]}`}>
        {status}
      </span>
    )
  }

  const confidenceBadge = (confidence: number) => {
    const color = confidence >= 0.9 ? "bg-emerald-100 text-emerald-700" : confidence >= 0.7 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
    return (
      <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${color}`}>
        {Math.round(confidence * 100)}%
      </span>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div>
        <div className="text-xs text-muted-foreground">Reports</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Bank Reconciliation</div>
        <div className="mt-1 text-sm text-muted-foreground">Upload bank statement and reconcile with book transactions</div>
      </div>
      {hasLines && (
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={() => downloadCSV(`bank-reconciliation-${new Date().toISOString().slice(0, 10)}.csv`, [
            ["Bank Reconciliation", new Date().toISOString().slice(0, 10)],
            [],
            ["Date", "Description", "Reference", "Amount", "Status", "Match Confidence", "Match Reason"],
            ...lines!.map(l => [l.date, l.description, l.reference ?? "", l.amount.toFixed(2), l.status, l.match_confidence != null ? `${Math.round(l.match_confidence * 100)}%` : "", l.match_reason ?? ""]),
          ])}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={printReport}>
            <Printer className="mr-1.5 h-3.5 w-3.5" /> Print / PDF
          </Button>
        </div>
      )}

      {/* Upload Section */}
      <Card className="rounded-2xl border-border bg-card p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)] print:hidden">
        <div className="flex items-center gap-4">
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
          <Button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="h-9 bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-4 text-sm text-white"
            disabled={uploadMutation.isPending}
          >
            {uploadMutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-2 h-3.5 w-3.5" />}
            Upload CSV
          </Button>
          {uploadMutation.isSuccess && (
            <span className="text-sm text-emerald-600 font-medium">
              <Check className="inline h-3.5 w-3.5 mr-1" />
              Statement imported successfully
            </span>
          )}
          {uploadMutation.isError && (
            <span className="text-sm text-red-600 font-medium">Upload failed. Please try again.</span>
          )}
        </div>
      </Card>

      {/* Summary Bar */}
      {summary && hasLines && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-4 gap-3">
            <Card className="rounded-xl border-border bg-card p-3 shadow-sm">
              <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Total Lines</div>
              <div className="mt-1 text-lg font-bold tabular-nums text-foreground">{summary.total}</div>
            </Card>
            <Card className="rounded-xl border-border bg-card p-3 shadow-sm">
              <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Matched</div>
              <div className="mt-1 text-lg font-bold tabular-nums text-blue-600">{summary.matched}</div>
            </Card>
            <Card className="rounded-xl border-border bg-card p-3 shadow-sm">
              <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Reconciled</div>
              <div className="mt-1 text-lg font-bold tabular-nums text-emerald-600">{summary.reconciled}</div>
            </Card>
            <Card className="rounded-xl border-border bg-card p-3 shadow-sm">
              <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Unmatched</div>
              <div className="mt-1 text-lg font-bold tabular-nums text-gray-500">{summary.unmatched}</div>
            </Card>
          </div>
          <div className="print:hidden">
            <Button
              type="button"
              onClick={() => autoMatchMutation.mutate()}
              className="h-9 bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-4 text-sm text-white"
              disabled={autoMatchMutation.isPending}
            >
              {autoMatchMutation.isPending ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-3.5 w-3.5" />
              )}
              Auto-Match
            </Button>
          </div>
        </div>
      )}

      {/* Statement Lines Table */}
      <Card className="rounded-2xl border-border bg-card shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)] overflow-hidden">
        {linesLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading statement lines…
          </div>
        ) : !hasLines ? (
          <div className="py-12 text-center">
            <div className="text-sm font-semibold text-foreground">No statement lines</div>
            <div className="mt-1 text-xs text-muted-foreground">Upload a bank statement CSV to get started</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Description</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Reference</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Amount</th>
                <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Match</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground print:hidden">Actions</th>
              </tr>
            </thead>
            <tbody>
              {lines!.map(line => (
                <tr key={line.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{formatDate(line.date)}</td>
                  <td className="px-4 py-2.5 text-sm text-foreground max-w-[200px] truncate">{line.description}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{line.reference ?? "—"}</td>
                  <td className={`px-4 py-2.5 text-right text-sm tabular-nums font-medium ${line.amount >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {formatCurrency(line.amount)}
                  </td>
                  <td className="px-4 py-2.5 text-center">{statusBadge(line.status)}</td>
                  <td className="px-4 py-2.5 text-sm">
                    {line.matched_transaction ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-foreground truncate max-w-[160px]" title={line.matched_transaction.description}>
                          {line.matched_transaction.description}
                        </span>
                        {line.match_confidence != null && confidenceBadge(line.match_confidence)}
                        {line.match_reason && (
                          <span className="text-muted-foreground cursor-help" title={line.match_reason}>
                            <RefreshCw className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right print:hidden">
                    {line.status === "matched" && (
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="default"
                          size="sm"
                          className="h-7 bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-2"
                          onClick={() => confirmMutation.mutate(line.id)}
                          disabled={confirmMutation.isPending}
                        >
                          <Check className="h-3 w-3 mr-1" /> Confirm
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 border-red-300 text-red-600 hover:bg-red-50 text-xs px-2"
                          onClick={() => rejectMutation.mutate(line.id)}
                          disabled={rejectMutation.isPending}
                        >
                          <X className="h-3 w-3 mr-1" /> Reject
                        </Button>
                      </div>
                    )}
                    {line.status === "reconciled" && (
                      <Check className="inline h-4 w-4 text-emerald-600" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
