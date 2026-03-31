import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Building2, Link2, Link2Off, Loader2, Clock, CheckCircle2 } from "lucide-react"
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

export default function MyAccountantsPage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const navigate = useNavigate()

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
    },
    onError: () => toast("Failed to unlink", "warning"),
  })

  const isLoading = loadingLinked || loadingPending

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="text-xs text-muted-foreground">Documents</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">My Accountants</div>
        <div className="mt-1 text-sm text-muted-foreground">
          Accounting firms linked to your account. They can only see documents you choose to share.
        </div>
      </div>

      {isLoading ? (
        <div className="py-14 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      ) : (
        <>
          {/* Pending invitations */}
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

          {/* Linked firms */}
          {linked.length === 0 && pending.length === 0 ? (
            <Card className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
              <div className="py-16 text-center">
                <Link2 className="mx-auto h-10 w-10 text-muted-foreground/30 mb-3" />
                <div className="text-base font-semibold text-foreground">No accountants linked yet</div>
                <div className="mt-1 text-sm text-muted-foreground max-w-xs mx-auto">
                  Ask your accountant or bookkeeper to send you an invitation from their Accruly account.
                </div>
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
    </div>
  )
}
