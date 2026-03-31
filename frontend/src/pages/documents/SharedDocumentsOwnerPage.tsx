import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  FileText, Share2, Trash2, Loader2, UserCheck, Plus, X,
  ChevronDown, ChevronUp, Building2, Link2, ArrowUpRight,
} from "lucide-react"
import { Card } from "../../components/ui/card"
import api from "../../lib/api"
import { formatDate } from "../../lib/utils"
import { useToast } from "../../components/ui/toast"
import { useNavigate } from "react-router-dom"

interface ShareEntry {
  share_id: string
  shared_with_email: string
  note: string | null
  shared_at: string
}

interface SharedDoc {
  document_id: string
  filename: string
  file_type: string
  file_url: string
  file_size: number
  category: string | null
  status: string
  uploaded_at: string
  shares: ShareEntry[]
}

interface LinkedFirm {
  link_id: string
  firm_org_id: string
  firm_name: string
  firm_logo_url: string | null
  contact_email: string
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function ShareModal({
  doc,
  linkedFirms,
  onClose,
}: {
  doc: SharedDoc
  linkedFirms: LinkedFirm[]
  onClose: () => void
}) {
  const [mode, setMode] = useState<"firm" | "email">(linkedFirms.length > 0 ? "firm" : "email")
  const [selectedFirm, setSelectedFirm] = useState<LinkedFirm | null>(
    linkedFirms.length === 1 ? linkedFirms[0] : null
  )
  const [email, setEmail] = useState("")
  const [note, setNote] = useState("")
  const { toast } = useToast()
  const qc = useQueryClient()
  const navigate = useNavigate()

  const alreadySharedEmails = new Set(doc.shares.map((s) => s.shared_with_email))
  const availableFirms = linkedFirms.filter((f) => !alreadySharedEmails.has(f.contact_email))

  const share = useMutation({
    mutationFn: (accountantEmail: string) =>
      api.post("/sharing/share", {
        document_id: doc.document_id,
        accountant_email: accountantEmail,
        note: note.trim() || null,
      }),
    onSuccess: () => {
      toast("Document shared", "success")
      qc.invalidateQueries({ queryKey: ["my-shared-docs"] })
      onClose()
    },
    onError: (e: any) => {
      toast(e?.response?.data?.detail || "Failed to share", "warning")
    },
  })

  const revoke = useMutation({
    mutationFn: (shareEmail: string) =>
      api.delete("/sharing/share", {
        data: { document_id: doc.document_id, accountant_email: shareEmail },
      }),
    onSuccess: () => {
      toast("Share removed", "success")
      qc.invalidateQueries({ queryKey: ["my-shared-docs"] })
    },
    onError: () => toast("Failed to remove share", "warning"),
  })

  const handleShare = () => {
    const target = mode === "firm" ? selectedFirm?.contact_email : email.trim()
    if (!target) return
    share.mutate(target)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-card border border-border shadow-xl p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-sm font-semibold text-foreground truncate max-w-[300px]">{doc.filename}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Manage who can see this document</div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground ml-2 shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Current shares */}
        {doc.shares.length > 0 && (
          <div className="mb-4 space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Currently shared with</div>
            {doc.shares.map((s) => (
              <div key={s.share_id} className="flex items-center gap-3 rounded-xl bg-muted/40 px-3 py-2.5">
                <UserCheck className="h-4 w-4 text-green-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{s.shared_with_email}</div>
                  {s.note && <div className="text-xs text-muted-foreground italic">"{s.note}"</div>}
                  <div className="text-xs text-muted-foreground">{formatDate(s.shared_at)}</div>
                </div>
                <button
                  onClick={() => revoke.mutate(s.shared_with_email)}
                  disabled={revoke.isPending}
                  className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add share */}
        <div className="space-y-3">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Share with
          </div>

          {/* Mode tabs */}
          {linkedFirms.length > 0 && (
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => setMode("firm")}
                className={`flex-1 py-2 text-xs font-medium transition-colors ${
                  mode === "firm"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted/50"
                }`}
              >
                My Accountants
              </button>
              <button
                onClick={() => setMode("email")}
                className={`flex-1 py-2 text-xs font-medium transition-colors ${
                  mode === "email"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted/50"
                }`}
              >
                Other Email
              </button>
            </div>
          )}

          {mode === "firm" && linkedFirms.length > 0 ? (
            availableFirms.length === 0 ? (
              <div className="rounded-xl bg-muted/40 px-3 py-3 text-xs text-muted-foreground text-center">
                All linked accountants already have access to this document.
              </div>
            ) : (
              <div className="space-y-2">
                {availableFirms.map((firm) => (
                  <button
                    key={firm.link_id}
                    onClick={() => setSelectedFirm(selectedFirm?.link_id === firm.link_id ? null : firm)}
                    className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      selectedFirm?.link_id === firm.link_id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/30"
                    }`}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/20">
                      {firm.firm_logo_url ? (
                        <img src={firm.firm_logo_url} alt={firm.firm_name} className="h-6 w-6 rounded object-contain" />
                      ) : (
                        <Building2 className="h-4 w-4 text-blue-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground">{firm.firm_name}</div>
                      <div className="text-xs text-muted-foreground">{firm.contact_email}</div>
                    </div>
                    <div className={`h-4 w-4 rounded-full border-2 shrink-0 ${
                      selectedFirm?.link_id === firm.link_id
                        ? "border-primary bg-primary"
                        : "border-border"
                    }`} />
                  </button>
                ))}
              </div>
            )
          ) : (
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="accountant@example.com"
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          )}

          {linkedFirms.length === 0 && (
            <button
              type="button"
              onClick={() => navigate("/my-accountants")}
              className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
            >
              <Link2 className="h-3 w-3" />
              Link an accountant first for easier sharing
              <ArrowUpRight className="h-3 w-3" />
            </button>
          )}

          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />

          <button
            onClick={handleShare}
            disabled={
              share.isPending ||
              (mode === "firm" ? !selectedFirm : !email.trim())
            }
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {share.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
            Share Document
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SharedDocumentsOwnerPage() {
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null)
  const [sharingDoc, setSharingDoc] = useState<SharedDoc | null>(null)

  const { data: docs = [], isLoading } = useQuery<SharedDoc[]>({
    queryKey: ["my-shared-docs"],
    queryFn: () => api.get("/sharing/my-shared").then((r) => r.data),
  })

  const { data: linkedFirms = [] } = useQuery<LinkedFirm[]>({
    queryKey: ["linked-firms"],
    queryFn: () => api.get("/sharing/linked-firms").then((r) => r.data),
  })

  const sharedDocs = docs.filter((d) => d.shares.length > 0)
  const unsharedDocs = docs.filter((d) => d.shares.length === 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Documents</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Shared Documents</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Manage which documents you've shared with your accountant
          </div>
        </div>
        {linkedFirms.length === 0 && (
          <a
            href="/my-accountants"
            className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
          >
            <Link2 className="h-3.5 w-3.5" />
            Link Accountant
          </a>
        )}
      </div>

      {linkedFirms.length === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800/40 px-4 py-3 flex items-start gap-3">
          <Building2 className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-xs text-amber-800 dark:text-amber-300">
            <strong>No accountants linked yet.</strong> Ask your accountant to send you an invitation, or{" "}
            <a href="/my-accountants" className="underline font-medium">go to My Accountants</a> to manage links.
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="py-14 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      ) : docs.length === 0 ? (
        <Card className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
          <div className="py-16 text-center">
            <Share2 className="mx-auto h-10 w-10 text-muted-foreground/30 mb-3" />
            <div className="text-base font-semibold text-foreground">No documents yet</div>
            <div className="mt-1 text-sm text-muted-foreground max-w-xs mx-auto">
              Upload documents first, then share them with your accountant from here
            </div>
            <a
              href="/upload"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Upload Documents
            </a>
          </div>
        </Card>
      ) : (
        <>
          {sharedDocs.length > 0 && (
            <Card className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
              <div className="px-5 py-3 border-b border-border/40">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Shared ({sharedDocs.length})
                </div>
              </div>
              <div className="divide-y divide-border/40">
                {sharedDocs.map((doc) => (
                  <div key={doc.document_id}>
                    <div className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/30 transition-colors">
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
                          <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                            <UserCheck className="h-3 w-3" />
                            {doc.shares.length} recipient{doc.shares.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => setExpandedDoc(expandedDoc === doc.document_id ? null : doc.document_id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                        >
                          {expandedDoc === doc.document_id
                            ? <ChevronUp className="h-4 w-4" />
                            : <ChevronDown className="h-4 w-4" />}
                        </button>
                        <button
                          onClick={() => setSharingDoc(doc)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                        >
                          <Plus className="h-3.5 w-3.5" /> Manage
                        </button>
                      </div>
                    </div>

                    {expandedDoc === doc.document_id && (
                      <div className="px-5 pb-3 pt-0 bg-muted/20">
                        <div className="space-y-1.5 pl-9">
                          {doc.shares.map((s) => (
                            <div key={s.share_id} className="flex items-center gap-2 text-xs text-muted-foreground">
                              <UserCheck className="h-3.5 w-3.5 text-green-500 shrink-0" />
                              <span className="font-medium text-foreground">{s.shared_with_email}</span>
                              {s.note && <span className="italic">· "{s.note}"</span>}
                              <span className="ml-auto">{formatDate(s.shared_at)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {unsharedDocs.length > 0 && (
            <Card className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
              <div className="px-5 py-3 border-b border-border/40">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Not yet shared ({unsharedDocs.length})
                </div>
              </div>
              <div className="divide-y divide-border/40">
                {unsharedDocs.map((doc) => (
                  <div key={doc.document_id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/30 transition-colors">
                    <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{doc.filename}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {doc.category && (
                          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground capitalize">
                            {doc.category}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">{formatBytes(doc.file_size)}</span>
                        <span className="text-xs text-muted-foreground">· {formatDate(doc.uploaded_at)}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => setSharingDoc(doc)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors shrink-0"
                    >
                      <Share2 className="h-3.5 w-3.5" /> Share
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {sharingDoc && (
        <ShareModal
          doc={sharingDoc}
          linkedFirms={linkedFirms}
          onClose={() => setSharingDoc(null)}
        />
      )}
    </div>
  )
}
