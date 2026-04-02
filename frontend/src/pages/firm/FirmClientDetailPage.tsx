import { useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import {
  ArrowLeft, FileText, Download, Loader2,
  BarChart3, Receipt, ShoppingCart, Users, AlertCircle,
} from "lucide-react"
import { Card } from "../../components/ui/card"
import { Badge } from "../../components/ui/badge"
import api from "../../lib/api"
import { formatDate, formatCurrency, cn } from "../../lib/utils"

// ── Types ─────────────────────────────────────────────────────────────────────

interface ClientOrg {
  id: string
  name: string
  org_type: string
  country: string
  currency: string
  industry: string | null
  onboarding_completed: boolean
  is_archived: boolean
  created_at: string
  metrics: {
    invoices: number
    bills: number
    documents: number
    pending_documents: number
    users: number
    total_revenue: number
    total_expenses: number
  }
}

interface ClientDocument {
  id: string
  filename: string
  file_url: string
  file_type: string
  file_size: number
  status: string
  category: string | null
  ai_confidence: number | null
  linked_bill_id: string | null
  linked_invoice_id: string | null
  uploaded_at: string
  processed_at: string | null
}

type TabKey = "overview" | "documents"

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const docStatusColors: Record<string, string> = {
  uploaded: "bg-slate-500/10 text-slate-600 border-slate-300/20",
  processing: "bg-amber-500/10 text-amber-700 border-amber-400/20",
  processed: "bg-emerald-500/10 text-emerald-700 border-emerald-400/20",
  failed: "bg-rose-500/10 text-rose-700 border-rose-400/20",
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function FirmClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>()
  const navigate = useNavigate()
  const [tab, setTab] = useState<TabKey>("overview")

  // Get firm dashboard to find this client's metrics
  const { data: dashboard, isLoading: loadingDash } = useQuery<{
    clients: ClientOrg[]
    firm_name: string
  }>({
    queryKey: ["firm-dashboard"],
    queryFn: () => api.get("/firm/dashboard").then((r) => r.data),
  })

  const client = dashboard?.clients.find((c) => c.id === clientId)

  // Fetch documents for this client
  const { data: documents = [], isLoading: loadingDocs } = useQuery<ClientDocument[]>({
    queryKey: ["firm-client-documents", clientId],
    queryFn: () => api.get(`/firm/clients/${clientId}/documents`).then((r) => r.data),
    enabled: !!clientId && tab === "documents",
  })

  if (loadingDash) {
    return (
      <div className="py-20 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading client…
      </div>
    )
  }

  if (!client) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <AlertCircle className="h-8 w-8" />
        <div className="text-sm">Client not found or you don't have access.</div>
        <button
          onClick={() => navigate("/firm/clients")}
          className="text-xs text-primary hover:underline"
        >
          Back to Clients
        </button>
      </div>
    )
  }

  const m = client.metrics

  return (
    <div className="flex flex-col gap-5">
      {/* ── Header ── */}
      <div>
        <button
          onClick={() => navigate("/firm/clients")}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent transition-colors mb-3"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Clients
        </button>

        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-lg">
            {client.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">{client.name}</h1>
              <Badge variant="outline" className="rounded-lg px-2 py-0.5 text-[11px] font-semibold bg-primary/10 text-primary border-primary/20">
                Portal Client
              </Badge>
              {!client.onboarding_completed && (
                <Badge variant="outline" className="rounded-lg px-2 py-0.5 text-[11px] font-semibold bg-amber-500/10 text-amber-700 border-amber-400/20">
                  Onboarding incomplete
                </Badge>
              )}
            </div>
            <div className="mt-0.5 text-sm text-muted-foreground">
              {client.country} · {client.currency}
              {client.industry ? ` · ${client.industry}` : ""}
              {" · "}Joined {formatDate(client.created_at)}
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 rounded-xl bg-muted p-1 w-fit">
        {([
          { key: "overview", label: "Overview" },
          { key: "documents", label: `Documents${m.documents > 0 ? ` (${m.documents})` : ""}` },
        ] as { key: TabKey; label: string }[]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-lg px-4 py-1.5 text-xs font-medium transition-colors",
              tab === t.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview tab ── */}
      {tab === "overview" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[
            {
              icon: <Receipt className="h-5 w-5 text-sky-500" />,
              label: "Invoices",
              value: m.invoices,
              sub: `Total revenue ${formatCurrency(m.total_revenue, client.currency)}`,
              bg: "bg-sky-50 dark:bg-sky-900/20",
            },
            {
              icon: <ShoppingCart className="h-5 w-5 text-amber-500" />,
              label: "Bills",
              value: m.bills,
              sub: `Total expenses ${formatCurrency(m.total_expenses, client.currency)}`,
              bg: "bg-amber-50 dark:bg-amber-900/20",
            },
            {
              icon: <FileText className="h-5 w-5 text-violet-500" />,
              label: "Documents",
              value: m.documents,
              sub: m.pending_documents > 0 ? `${m.pending_documents} pending` : "All processed",
              bg: "bg-violet-50 dark:bg-violet-900/20",
            },
            {
              icon: <Users className="h-5 w-5 text-emerald-500" />,
              label: "Users",
              value: m.users,
              sub: "Workspace members",
              bg: "bg-emerald-50 dark:bg-emerald-900/20",
            },
            {
              icon: <BarChart3 className="h-5 w-5 text-rose-500" />,
              label: "Net Income",
              value: formatCurrency(m.total_revenue - m.total_expenses, client.currency),
              sub: "Revenue minus expenses",
              bg: "bg-rose-50 dark:bg-rose-900/20",
              wide: true,
            },
          ].map((item, i) => (
            <Card
              key={i}
              className={cn(
                "rounded-2xl border border-border p-4 shadow-sm",
                item.wide ? "col-span-2 sm:col-span-1" : ""
              )}
            >
              <div className={cn("inline-flex h-9 w-9 items-center justify-center rounded-xl mb-3", item.bg)}>
                {item.icon}
              </div>
              <div className="text-xl font-semibold text-foreground">{item.value}</div>
              <div className="text-xs font-medium text-foreground mt-0.5">{item.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{item.sub}</div>
            </Card>
          ))}
        </div>
      )}

      {/* ── Documents tab ── */}
      {tab === "documents" && (
        <Card className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
          {loadingDocs ? (
            <div className="py-14 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading documents…
            </div>
          ) : documents.length === 0 ? (
            <div className="py-16 text-center">
              <FileText className="mx-auto h-10 w-10 text-muted-foreground/30 mb-3" />
              <div className="text-sm font-medium text-foreground">No documents uploaded yet</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Documents this client uploads will appear here
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/30 transition-colors"
                >
                  <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{doc.filename}</div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
                          docStatusColors[doc.status] ?? ""
                        )}
                      >
                        {doc.status}
                      </Badge>
                      {doc.category && (
                        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground capitalize">
                          {doc.category}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">{formatBytes(doc.file_size)}</span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">{formatDate(doc.uploaded_at)}</span>
                      {doc.ai_confidence !== null && (
                        <span className="text-xs text-muted-foreground">
                          · AI {Math.round(doc.ai_confidence * 100)}%
                        </span>
                      )}
                    </div>
                  </div>
                  <a
                    href={doc.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors shrink-0"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
