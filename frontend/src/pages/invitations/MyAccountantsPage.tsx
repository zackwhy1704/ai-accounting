import { useState, useRef } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Building2, Link2, Link2Off, Loader2, Clock, CheckCircle2,
  UserPlus, X, Search, AlertCircle, Globe, Mail,
} from "lucide-react"
import { Card } from "../../components/ui/card"
import api from "../../lib/api"
import { useToast } from "../../components/ui/toast"
import { formatDate } from "../../lib/utils"
import { useNavigate } from "react-router-dom"

interface LinkedFirm {
  link_id: string
  firm_org_id: string
  firm_name: string
  firm_logo_url: string | null
  firm_email: string | null
  linked_at: string | null
}

interface PendingInvite {
  link_id: string
  token: string
  firm_name: string
  firm_logo_url: string | null
  note: string | null
  created_at: string
}

interface FirmPreview {
  name: string
  slug: string
  logo_url: string | null
  description: string | null
  website: string | null
  contact_email: string | null
}

// ── Link Accountant modal ─────────────────────────────────────────────────────

function LinkAccountantModal({ onClose }: { onClose: () => void }) {
  const [slug, setSlug] = useState("")
  const [note, setNote] = useState("")
  const [preview, setPreview] = useState<FirmPreview | null>(null)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [looking, setLooking] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { toast } = useToast()
  const qc = useQueryClient()

  const handleSlugChange = (value: string) => {
    setSlug(value)
    setPreview(null)
    setLookupError(null)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    const trimmed = value.trim().toLowerCase()
    if (!trimmed || trimmed.length < 3) return

    debounceRef.current = setTimeout(async () => {
      setLooking(true)
      try {
        const res = await api.get(`/invitations/lookup-firm/${trimmed}`)
        setPreview(res.data)
        setLookupError(null)
      } catch (e: any) {
        setPreview(null)
        setLookupError(e?.response?.data?.detail ?? "Firm not found")
      } finally {
        setLooking(false)
      }
    }, 500)
  }

  const [linkError, setLinkError] = useState<string | null>(null)
  const [linked, setLinked] = useState(false)
  const [linkedFirmName, setLinkedFirmName] = useState("")

  const link = useMutation({
    mutationFn: () =>
      api.post("/invitations/link-by-slug", { firm_slug: slug.trim().toLowerCase(), note: note.trim() || null }),
    onSuccess: (res) => {
      setLinked(true)
      setLinkedFirmName(res.data.firm_name)
      setLinkError(null)
      qc.invalidateQueries({ queryKey: ["my-linked-firms"] })
      qc.invalidateQueries({ queryKey: ["my-links-count"] })
      setTimeout(() => {
        toast(`Linked to ${res.data.firm_name}`, "success")
        onClose()
      }, 1200)
    },
    onError: (e: any) => {
      setLinkError(e?.response?.data?.detail ?? "Failed to link. Please try again.")
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-card border border-border shadow-xl p-6">
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="text-base font-semibold text-foreground">Link an Accountant</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Enter your accountant firm's slug to connect your account
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Slug input */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Firm slug *
              <span className="ml-1 font-normal text-muted-foreground/70">
                (e.g. "abc-accounting" from accruly.io/abc-accounting)
              </span>
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="your-accountant-firm"
                autoFocus
                className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              {looking && (
                <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>

            {/* Lookup error */}
            {lookupError && slug.trim().length >= 3 && !looking && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-rose-600">
                <AlertCircle className="h-3.5 w-3.5" />
                {lookupError}
              </div>
            )}
          </div>

          {/* Firm preview card */}
          {preview && (
            <div className="rounded-xl border border-border bg-muted/40 p-4 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-sm">
                {preview.logo_url ? (
                  <img src={preview.logo_url} alt={preview.name} className="h-10 w-10 rounded-xl object-contain" />
                ) : (
                  preview.name.charAt(0).toUpperCase()
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-foreground">{preview.name}</div>
                {preview.description && (
                  <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{preview.description}</div>
                )}
                <div className="flex flex-wrap gap-3 mt-1.5">
                  {preview.contact_email && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Mail className="h-3 w-3" />
                      {preview.contact_email}
                    </span>
                  )}
                  {preview.website && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Globe className="h-3 w-3" />
                      {preview.website}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Optional note */}
          {preview && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Message to firm (optional)
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Hi, I'd like to link my account for the 2025 tax year."
                rows={3}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
            </div>
          )}
        </div>

        {linkError && (
          <div className="mt-3 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/40 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
            {linkError}
          </div>
        )}

        {linked ? (
          <div className="mt-5 py-4 flex flex-col items-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <Link2 className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="text-sm font-semibold text-foreground">Linked to {linkedFirmName}!</div>
            <div className="text-xs text-muted-foreground">Closing…</div>
          </div>
        ) : (
          <div className="mt-5 flex gap-3">
            <button
              onClick={onClose}
              disabled={link.isPending}
              className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted/50 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => { setLinkError(null); link.mutate() }}
              disabled={!preview || link.isPending}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
            >
              {link.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Linking…</>
              ) : (
                <><Link2 className="h-4 w-4" /> Link Accountant</>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MyAccountantsPage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [showLink, setShowLink] = useState(false)

  const { data: linked = [], isLoading: loadingLinked } = useQuery<LinkedFirm[]>({
    queryKey: ["my-linked-firms"],
    queryFn: () => api.get("/invitations/my-links").then((r) => r.data),
  })

  const { data: pending = [], isLoading: loadingPending } = useQuery<PendingInvite[]>({
    queryKey: ["pending-invites"],
    queryFn: () => api.get("/invitations/pending-for-me").then((r) => r.data),
  })

  const unlink = useMutation({
    mutationFn: (linkId: string) => api.delete(`/invitations/${linkId}`),
    onSuccess: () => {
      toast("Accountant unlinked", "success")
      qc.invalidateQueries({ queryKey: ["my-linked-firms"] })
      qc.invalidateQueries({ queryKey: ["my-links-count"] })
    },
    onError: () => toast("Failed to unlink", "warning"),
  })

  const isLoading = loadingLinked || loadingPending

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Documents</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">My Accountants</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Accounting firms linked to your account. They can only see documents you choose to share.
          </div>
        </div>
        <button
          onClick={() => setShowLink(true)}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <UserPlus className="h-4 w-4" />
          Link Accountant
        </button>
      </div>

      {isLoading ? (
        <div className="py-14 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      ) : (
        <>
          {/* Pending invitations from firms */}
          {pending.length > 0 && (
            <Card className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800/40 shadow-sm">
              <div className="px-5 py-3 border-b border-amber-200 dark:border-amber-800/40">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-600" />
                  <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">
                    Pending Invitations ({pending.length})
                  </span>
                </div>
              </div>
              <div className="divide-y divide-amber-200 dark:divide-amber-800/40">
                {pending.map((inv) => (
                  <div key={inv.link_id} className="flex items-center gap-4 px-5 py-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/30">
                      {inv.firm_logo_url ? (
                        <img src={inv.firm_logo_url} alt={inv.firm_name} className="h-8 w-8 rounded-lg object-contain" />
                      ) : (
                        <Building2 className="h-5 w-5 text-amber-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">{inv.firm_name}</div>
                      {inv.note && (
                        <div className="text-xs text-slate-500 italic mt-0.5">"{inv.note}"</div>
                      )}
                      <div className="text-xs text-slate-400 mt-0.5">Sent {formatDate(inv.created_at)}</div>
                    </div>
                    <button
                      onClick={() => navigate(`/accept-client-invite?token=${inv.token}`)}
                      className="shrink-0 rounded-xl bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
                    >
                      Review
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Empty state */}
          {linked.length === 0 && pending.length === 0 ? (
            <Card className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
              <div className="py-16 text-center">
                <Link2 className="mx-auto h-10 w-10 text-muted-foreground/30 mb-3" />
                <div className="text-base font-semibold text-foreground">No accountants linked yet</div>
                <div className="mt-1 text-sm text-muted-foreground max-w-xs mx-auto">
                  Link your accounting firm by entering their firm slug, or wait for them to send you an invitation.
                </div>
                <button
                  onClick={() => setShowLink(true)}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <UserPlus className="h-4 w-4" />
                  Link Your Accountant
                </button>
              </div>
            </Card>
          ) : linked.length > 0 ? (
            <Card className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
              <div className="px-5 py-3 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Linked Accountants ({linked.length})
                  </span>
                </div>
              </div>
              <div className="divide-y divide-border/40">
                {linked.map((firm) => (
                  <div key={firm.link_id} className="flex items-center gap-4 px-5 py-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                      {firm.firm_logo_url ? (
                        <img src={firm.firm_logo_url} alt={firm.firm_name} className="h-8 w-8 rounded-lg object-contain" />
                      ) : (
                        <Building2 className="h-5 w-5 text-blue-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-foreground">{firm.firm_name}</div>
                      {firm.firm_email && (
                        <div className="text-xs text-muted-foreground">{firm.firm_email}</div>
                      )}
                      {firm.linked_at && (
                        <div className="text-xs text-muted-foreground mt-0.5">Linked {formatDate(firm.linked_at)}</div>
                      )}
                    </div>
                    <button
                      onClick={() => unlink.mutate(firm.link_id)}
                      disabled={unlink.isPending}
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 disabled:opacity-50 transition-colors"
                    >
                      <Link2Off className="h-3.5 w-3.5" />
                      Unlink
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </>
      )}

      {showLink && <LinkAccountantModal onClose={() => setShowLink(false)} />}
    </div>
  )
}
