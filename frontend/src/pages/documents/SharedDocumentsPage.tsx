import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { FileText, Download, Search, Users, ChevronRight, ArrowLeft, Loader2, Building2 } from "lucide-react"
import { Card } from "../../components/ui/card"
import { Input } from "../../components/ui/input"
import api from "../../lib/api"
import { formatDate } from "../../lib/utils"

interface ClientSummary {
  org_id: string
  org_name: string
  org_type: string
  document_count: number
  last_shared_at: string | null
}

interface ClientListResponse {
  clients: ClientSummary[]
  total: number
  page: number
  pages: number
}

interface SharedDoc {
  share_id: string
  document_id: string
  filename: string
  file_type: string
  file_url: string
  file_size: number
  category: string | null
  status: string
  shared_at: string
  note: string | null
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function SharedDocumentsPage() {
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [page, setPage] = useState(1)
  const [selectedClient, setSelectedClient] = useState<ClientSummary | null>(null)

  // Debounce search
  const handleSearch = (v: string) => {
    setSearch(v)
    clearTimeout((handleSearch as any)._t)
    ;(handleSearch as any)._t = setTimeout(() => {
      setDebouncedSearch(v)
      setPage(1)
    }, 350)
  }

  const { data: clientList, isLoading: loadingClients } = useQuery<ClientListResponse>({
    queryKey: ["shared-clients", debouncedSearch, page],
    queryFn: () =>
      api
        .get("/sharing/clients", { params: { search: debouncedSearch, page, limit: 50 } })
        .then((r) => r.data),
    enabled: !selectedClient,
  })

  const { data: docs = [], isLoading: loadingDocs } = useQuery<SharedDoc[]>({
    queryKey: ["shared-client-docs", selectedClient?.org_id],
    queryFn: () =>
      api.get(`/sharing/client/${selectedClient!.org_id}/documents`).then((r) => r.data),
    enabled: !!selectedClient,
  })

  // ── Document detail view ──────────────────────
  if (selectedClient) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedClient(null)}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
        </div>

        <div>
          <div className="text-xs text-muted-foreground">Shared Documents</div>
          <div className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            {selectedClient.org_name}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {selectedClient.document_count} document{selectedClient.document_count !== 1 ? "s" : ""} shared with you
          </div>
        </div>

        <Card className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
          {loadingDocs ? (
            <div className="py-14 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading documents…
            </div>
          ) : docs.length === 0 ? (
            <div className="py-16 text-center">
              <FileText className="mx-auto h-10 w-10 text-muted-foreground/30 mb-3" />
              <div className="text-sm font-medium text-foreground">No documents</div>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {docs.map((doc) => (
                <div key={doc.share_id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/30 transition-colors">
                  <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{doc.filename}</div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {doc.category && (
                        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground capitalize">
                          {doc.category}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">{formatBytes(doc.file_size)}</span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">{formatDate(doc.shared_at)}</span>
                      {doc.note && (
                        <span className="text-xs text-muted-foreground italic">"{doc.note}"</span>
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
      </div>
    )
  }

  // ── Client list view ──────────────────────────
  const clients = clientList?.clients ?? []
  const total = clientList?.total ?? 0
  const pages = clientList?.pages ?? 1

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Documents</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Shared with Me</div>
        <div className="mt-1 text-sm text-muted-foreground">
          {total > 0 ? `${total} client${total !== 1 ? "s" : ""} have shared documents with you` : "Documents your clients share will appear here"}
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search clients…"
          className="pl-9"
        />
      </div>

      <Card className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
        {loadingClients ? (
          <div className="py-14 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading clients…
          </div>
        ) : clients.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="mx-auto h-10 w-10 text-muted-foreground/30 mb-3" />
            <div className="text-base font-semibold text-foreground">
              {debouncedSearch ? "No clients match your search" : "No shared documents yet"}
            </div>
            <div className="mt-1 text-sm text-muted-foreground max-w-xs mx-auto">
              {debouncedSearch ? "Try a different name" : "When a client shares documents with you, they will appear here"}
            </div>
          </div>
        ) : (
          <>
            <div className="divide-y divide-border/40">
              {clients.map((client) => (
                <button
                  key={client.org_id}
                  onClick={() => setSelectedClient(client)}
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors text-left"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary font-semibold text-sm">
                    {client.org_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{client.org_name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {client.document_count} document{client.document_count !== 1 ? "s" : ""}
                      {client.last_shared_at && ` · Last shared ${formatDate(client.last_shared_at)}`}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>

            {/* Pagination */}
            {pages > 1 && (
              <div className="flex items-center justify-between border-t border-border/40 px-5 py-3">
                <span className="text-xs text-muted-foreground">
                  Page {clientList?.page} of {pages}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-40 transition-colors"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(pages, p + 1))}
                    disabled={page >= pages}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-40 transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  )
}
