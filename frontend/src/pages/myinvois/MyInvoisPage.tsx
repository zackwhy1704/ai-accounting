import { useMemo, useState } from "react"
import {
  Loader2, Send, FileText, CheckCircle2, XCircle, Clock, AlertCircle,
  ExternalLink, Ban, Layers, Settings2, ShieldCheck, Save,
} from "lucide-react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { useToast } from "../../components/ui/toast"
import { formatCurrency, formatDate } from "../../lib/utils"
import api from "../../lib/api"

type SubmissionStatus = "submitted" | "valid" | "validated" | "pending" | "invalid" | "rejected" | "cancelled"

interface EInvoiceSubmission {
  id: string
  invoice_no: string
  invoice_date: string | null
  amount: number
  currency: string
  source_type?: string
  submission_id: string | null
  submission_status: SubmissionStatus
  uuid: string | null
  long_id?: string | null
  validation_link?: string | null
  submission_date: string | null
  validation_status: string | null
  rejection_reason: string | null
  can_cancel?: boolean
}

interface EInvoiceConfig {
  einvoice_enabled: boolean
  einvoice_supplier_tin: string | null
  einvoice_sandbox: boolean
  tax_regime: string
  country: string
  brn: string | null
  msic_code: string | null
  msic_description: string | null
  einvoice_phone: string | null
  einvoice_email: string | null
  einvoice_address_line1: string | null
  einvoice_city: string | null
  einvoice_postcode: string | null
  einvoice_state_code: string | null
}

type Tab = "transactions" | "documents" | "settings"

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  submitted: { label: "Submitted", className: "bg-sky-100 text-sky-700", icon: <Clock className="h-3 w-3" /> },
  valid: { label: "Valid", className: "bg-emerald-100 text-emerald-700", icon: <CheckCircle2 className="h-3 w-3" /> },
  validated: { label: "Valid", className: "bg-emerald-100 text-emerald-700", icon: <CheckCircle2 className="h-3 w-3" /> },
  pending: { label: "Not Submitted", className: "bg-amber-100 text-amber-700", icon: <Clock className="h-3 w-3" /> },
  invalid: { label: "Invalid", className: "bg-rose-100 text-rose-700", icon: <XCircle className="h-3 w-3" /> },
  rejected: { label: "Rejected", className: "bg-rose-100 text-rose-700", icon: <XCircle className="h-3 w-3" /> },
  cancelled: { label: "Cancelled", className: "bg-slate-100 text-slate-600", icon: <AlertCircle className="h-3 w-3" /> },
}

const MY_STATES: Array<[string, string]> = [
  ["01", "Johor"], ["02", "Kedah"], ["03", "Kelantan"], ["04", "Melaka"],
  ["05", "Negeri Sembilan"], ["06", "Pahang"], ["07", "Pulau Pinang"], ["08", "Perak"],
  ["09", "Perlis"], ["10", "Selangor"], ["11", "Terengganu"], ["12", "Sabah"],
  ["13", "Sarawak"], ["14", "WP Kuala Lumpur"], ["15", "WP Labuan"], ["16", "WP Putrajaya"],
  ["17", "Not Applicable"],
]

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${cfg.className}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  )
}

export default function MyInvoisPage() {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>("transactions")
  const [showConsolidated, setShowConsolidated] = useState(false)
  const now = new Date()
  const [consYear, setConsYear] = useState(String(now.getFullYear()))
  const [consMonth, setConsMonth] = useState(String(now.getMonth() + 1))

  const { data: submissions = [], isLoading } = useQuery<EInvoiceSubmission[]>({
    queryKey: ["einvoice-submissions"],
    queryFn: () => api.get("/einvoice/submissions").then(r => r.data),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ["einvoice-submissions"] })

  const submitMutation = useMutation({
    mutationFn: (invoiceId: string) => api.post(`/einvoice/submit/${invoiceId}`).then(r => r.data),
    onSuccess: (d: any) => {
      invalidate()
      toast(d?.status === "invalid" ? `Rejected by LHDN: ${d?.status_reason ?? "see details"}` : "Submitted to LHDN", d?.status === "invalid" ? "warning" : "success")
    },
    onError: (e: any) => toast(e?.response?.data?.detail ?? "Submission failed", "warning"),
  })

  const batchMutation = useMutation({
    mutationFn: (invoiceIds: string[]) => api.post("/einvoice/submit/batch", { invoice_ids: invoiceIds }).then(r => r.data),
    onSuccess: (d: any) => {
      invalidate()
      toast(`Batch complete: ${d.submitted}/${d.results.length} submitted`, "success")
    },
    onError: (e: any) => toast(e?.response?.data?.detail ?? "Batch submission failed", "warning"),
  })

  const consolidatedMutation = useMutation({
    mutationFn: () => api.post("/einvoice/submit/consolidated", { year: Number(consYear), month: Number(consMonth) }).then(r => r.data),
    onSuccess: () => {
      invalidate()
      setShowConsolidated(false)
      toast("Consolidated e-invoice submitted", "success")
    },
    onError: (e: any) => toast(e?.response?.data?.detail ?? "Consolidated submission failed", "warning"),
  })

  const cancelMutation = useMutation({
    mutationFn: ({ submissionId, reason }: { submissionId: string; reason: string }) =>
      api.post(`/einvoice/cancel/${submissionId}`, { reason }).then(r => r.data),
    onSuccess: () => {
      invalidate()
      toast("Document cancelled at LHDN", "success")
    },
    onError: (e: any) => toast(e?.response?.data?.detail ?? "Cancellation failed", "warning"),
  })

  const refreshMutation = useMutation({
    mutationFn: (submissionUid: string) => api.get(`/einvoice/status/${submissionUid}`).then(r => r.data),
    onSuccess: () => {
      invalidate()
      toast("Status refreshed from LHDN", "success")
    },
    onError: (e: any) => toast(e?.response?.data?.detail ?? "Status check failed", "warning"),
  })

  const pendingInvoices = useMemo(
    () => submissions.filter(s => s.submission_status === "pending" && (s.source_type ?? "invoice") === "invoice"),
    [submissions],
  )

  const stats = {
    total: submissions.filter(s => s.submission_status !== "pending").length,
    valid: submissions.filter(s => ["valid", "validated", "submitted"].includes(s.submission_status)).length,
    invalid: submissions.filter(s => ["invalid", "rejected"].includes(s.submission_status)).length,
    pending: submissions.filter(s => s.submission_status === "pending").length,
  }

  const cancelWithReason = (s: EInvoiceSubmission) => {
    const reason = prompt(`Cancel ${s.invoice_no} at LHDN?\n\nEnter a cancellation reason (LHDN allows cancellation within 72 hours of validation):`)
    if (reason && s.submission_id) cancelMutation.mutate({ submissionId: s.submission_id, reason })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs text-muted-foreground">MyInvois</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">MyInvois (LHDN)</div>
          <div className="mt-1 text-sm text-muted-foreground">Malaysia e-invoice compliance portal</div>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setShowConsolidated(v => !v)}>
            <Layers className="mr-1.5 h-3.5 w-3.5" /> Consolidated
          </Button>
          <Button
            type="button"
            className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white"
            disabled={pendingInvoices.length === 0 || batchMutation.isPending}
            onClick={() => {
              if (confirm(`Submit ${pendingInvoices.length} pending invoice(s) to LHDN?`))
                batchMutation.mutate(pendingInvoices.map(s => s.id))
            }}
          >
            {batchMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Submit All Pending ({pendingInvoices.length})
          </Button>
        </div>
      </div>

      {showConsolidated && (
        <Card className="rounded-2xl border-border bg-card p-4 shadow-sm">
          <div className="text-sm font-semibold text-foreground mb-1">Monthly consolidated e-invoice</div>
          <div className="text-xs text-muted-foreground mb-3">
            Bundles the month's cash sales and invoices for buyers without a TIN under the LHDN "General Public" buyer.
          </div>
          <div className="flex items-end gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Year</label>
              <Input type="number" value={consYear} onChange={e => setConsYear(e.target.value)} className="h-9 w-28 text-sm" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Month (1-12)</label>
              <Input type="number" min={1} max={12} value={consMonth} onChange={e => setConsMonth(e.target.value)} className="h-9 w-28 text-sm" />
            </div>
            <Button
              type="button"
              onClick={() => consolidatedMutation.mutate()}
              disabled={consolidatedMutation.isPending}
              className="h-9 bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-4 text-sm text-white"
            >
              {consolidatedMutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-2 h-3.5 w-3.5" />}
              Submit Consolidated
            </Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Submitted", value: stats.total, color: "text-foreground", bg: "bg-muted/40" },
          { label: "Valid", value: stats.valid, color: "text-emerald-700", bg: "bg-emerald-50 dark:bg-emerald-950/20" },
          { label: "Invalid", value: stats.invalid, color: "text-rose-700", bg: "bg-rose-50 dark:bg-rose-950/20" },
          { label: "Not Submitted", value: stats.pending, color: "text-amber-700", bg: "bg-amber-50 dark:bg-amber-950/20" },
        ].map(stat => (
          <div key={stat.label} className={`rounded-xl border border-border p-4 ${stat.bg}`}>
            <div className="text-xs text-muted-foreground">{stat.label}</div>
            <div className={`mt-1 text-2xl font-bold ${stat.color}`}>{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-1">
        {(["transactions", "documents", "settings"] as Tab[]).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors ${tab === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
          >
            {t === "settings" ? "e-Invoice Profile" : t}
          </button>
        ))}
      </div>

      {tab === "settings" ? (
        <EInvoiceSettingsTab />
      ) : isLoading ? (
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
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Document</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Amount</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">LHDN Link</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map(s => (
                <tr key={`${s.source_type ?? "invoice"}-${s.id}`} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5">
                    <div className="text-sm font-medium text-foreground">{s.invoice_no}</div>
                    {(s.source_type ?? "invoice") !== "invoice" && (
                      <div className="text-[10px] uppercase text-muted-foreground">{(s.source_type ?? "").replace("_", " ")}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-muted-foreground">{s.invoice_date ? formatDate(s.invoice_date) : "—"}</td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{formatCurrency(s.amount, s.currency)}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={s.submission_status} /></td>
                  <td className="px-4 py-2.5">
                    {s.validation_link ? (
                      <a
                        href={s.validation_link}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-[#4D63FF] hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" /> Validation link
                      </a>
                    ) : s.uuid ? (
                      <span className="text-xs font-mono text-muted-foreground max-w-[160px] truncate inline-block align-middle">{s.uuid}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="inline-flex items-center gap-1">
                      {s.submission_status === "pending" && (s.source_type ?? "invoice") === "invoice" && (
                        <Button
                          type="button"
                          className="h-7 rounded-lg bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-2 text-xs text-white"
                          onClick={() => submitMutation.mutate(s.id)}
                          disabled={submitMutation.isPending}
                        >
                          {submitMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Send className="mr-1 h-3 w-3" /> Submit</>}
                        </Button>
                      )}
                      {s.submission_status === "submitted" && s.submission_id && (
                        <Button
                          type="button"
                          variant="outline"
                          className="h-7 rounded-lg px-2 text-xs"
                          onClick={() => refreshMutation.mutate(s.uuid ? s.uuid : s.submission_id!)}
                          disabled={refreshMutation.isPending}
                          title="Check status with LHDN"
                        >
                          <Clock className="mr-1 h-3 w-3" /> Check
                        </Button>
                      )}
                      {s.can_cancel && (
                        <Button
                          type="button"
                          variant="outline"
                          className="h-7 rounded-lg px-2 text-xs text-rose-600"
                          onClick={() => cancelWithReason(s)}
                          disabled={cancelMutation.isPending}
                        >
                          <Ban className="mr-1 h-3 w-3" /> Cancel
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {submissions.filter(s => s.submission_status !== "pending").map(s => (
            <Card key={`${s.source_type ?? "invoice"}-${s.id}`} className="rounded-2xl border-border bg-card p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.06)]">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">{s.invoice_no}</div>
                  <div className="text-xs text-muted-foreground">{s.invoice_date ? formatDate(s.invoice_date) : "—"}</div>
                </div>
                <StatusBadge status={s.submission_status} />
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
                {s.uuid && (
                  <div>
                    <div className="text-muted-foreground mb-0.5">LHDN UUID</div>
                    <div className="font-mono text-[10px] text-foreground break-all">{s.uuid}</div>
                  </div>
                )}
                {s.validation_link && (
                  <a href={s.validation_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#4D63FF] hover:underline">
                    <ExternalLink className="h-3 w-3" /> Public validation link
                  </a>
                )}
                {s.rejection_reason && (
                  <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-rose-700">
                    <div className="font-medium mb-0.5">Reason</div>
                    <div>{s.rejection_reason}</div>
                  </div>
                )}
              </div>
              {s.can_cancel && (
                <div className="mt-3">
                  <Button type="button" variant="outline" className="w-full h-8 rounded-lg text-xs text-rose-600" onClick={() => cancelWithReason(s)}>
                    <Ban className="mr-1 h-3 w-3" /> Cancel at LHDN (within 72h)
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function EInvoiceSettingsTab() {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [form, setForm] = useState<Partial<EInvoiceConfig> | null>(null)
  const [tin, setTin] = useState("")
  const [tinIdType, setTinIdType] = useState("BRN")
  const [tinIdValue, setTinIdValue] = useState("")
  const [tinResult, setTinResult] = useState<string | null>(null)

  const { data: config, isLoading } = useQuery<EInvoiceConfig>({
    queryKey: ["einvoice-config"],
    queryFn: () => api.get("/einvoice/config").then(r => r.data),
  })

  const effective: Partial<EInvoiceConfig> = { ...(config ?? {}), ...(form ?? {}) }
  const set = (key: keyof EInvoiceConfig, value: unknown) => setForm(f => ({ ...(f ?? {}), [key]: value }))

  const save = useMutation({
    mutationFn: () => api.put("/einvoice/config", form ?? {}).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["einvoice-config"] })
      setForm(null)
      toast("e-Invoice profile saved", "success")
    },
    onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to save profile", "warning"),
  })

  const validateTin = useMutation({
    mutationFn: () => api.post("/einvoice/validate-tin", { tin, id_type: tinIdType, id_value: tinIdValue }).then(r => r.data),
    onSuccess: (d: any) => setTinResult(d.valid ? "✓ TIN is valid" : "✗ TIN not found / does not match"),
    onError: (e: any) => setTinResult(e?.response?.data?.detail ?? "Validation failed (LHDN credentials required)"),
  })

  if (isLoading) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading profile…
      </div>
    )
  }

  const field = (label: string, key: keyof EInvoiceConfig, placeholder = "") => (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Input
        value={(effective[key] as string) ?? ""}
        onChange={e => set(key, e.target.value)}
        placeholder={placeholder}
        className="h-9 text-sm"
      />
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <Card className="rounded-2xl border-border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm font-semibold text-foreground">Supplier profile</div>
        </div>
        <div className="text-xs text-muted-foreground mb-4">
          These fields populate the mandatory supplier party in every UBL e-invoice. LHDN rejects documents with missing MSIC or TIN.
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {field("Supplier TIN", "einvoice_supplier_tin", "C1234567890")}
          {field("Business Registration No (BRN)", "brn", "202001012345")}
          {field("MSIC Code (5 digits)", "msic_code", "62010")}
          {field("MSIC Description", "msic_description", "Computer programming activities")}
          {field("Phone", "einvoice_phone", "+60123456789")}
          {field("Email", "einvoice_email", "billing@company.com")}
          {field("Address Line", "einvoice_address_line1")}
          {field("City", "einvoice_city")}
          {field("Postcode", "einvoice_postcode")}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">State</label>
            <select
              value={effective.einvoice_state_code ?? "17"}
              onChange={e => set("einvoice_state_code", e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
            >
              {MY_STATES.map(([code, name]) => (
                <option key={code} value={code}>{code} — {name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Environment</label>
            <select
              value={effective.einvoice_sandbox === false ? "production" : "sandbox"}
              onChange={e => set("einvoice_sandbox", e.target.value === "sandbox")}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="sandbox">Sandbox (preprod)</option>
              <option value="production">Production</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">e-Invoice enabled</label>
            <select
              value={effective.einvoice_enabled ? "yes" : "no"}
              onChange={e => set("einvoice_enabled", e.target.value === "yes")}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="yes">Enabled</option>
              <option value="no">Disabled</option>
            </select>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || !form}
            className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white"
          >
            {save.isPending ? <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Saving…</> : <><Save className="mr-2 h-3.5 w-3.5" /> Save Profile</>}
          </Button>
        </div>
      </Card>

      <Card className="rounded-2xl border-border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm font-semibold text-foreground">Verify a customer TIN</div>
        </div>
        <div className="text-xs text-muted-foreground mb-4">Checks the TIN against LHDN's official taxpayer validation API.</div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">TIN</label>
            <Input value={tin} onChange={e => setTin(e.target.value)} placeholder="C9876543210" className="h-9 w-44 text-sm" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">ID Type</label>
            <select value={tinIdType} onChange={e => setTinIdType(e.target.value)} className="h-9 rounded-md border border-border bg-background px-3 text-sm">
              {["BRN", "NRIC", "PASSPORT", "ARMY"].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">ID Value</label>
            <Input value={tinIdValue} onChange={e => setTinIdValue(e.target.value)} placeholder="201901054321" className="h-9 w-44 text-sm" />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => { setTinResult(null); validateTin.mutate() }}
            disabled={validateTin.isPending || !tin || !tinIdValue}
            className="h-9"
          >
            {validateTin.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="mr-2 h-3.5 w-3.5" />}
            Validate
          </Button>
          {tinResult && (
            <div className={`text-sm ${tinResult.startsWith("✓") ? "text-emerald-600" : "text-rose-600"}`}>{tinResult}</div>
          )}
        </div>
      </Card>
    </div>
  )
}
