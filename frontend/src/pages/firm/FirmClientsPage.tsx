import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Building2, UserPlus, Link2Off, Loader2, Clock, CheckCircle2,
  Mail, X, Send,
} from "lucide-react"
import { Card } from "../../components/ui/card"
import api from "../../lib/api"
import { useToast } from "../../components/ui/toast"
import { formatDate } from "../../lib/utils"

interface ClientLink {
  link_id: string
  status: string
  invited_email: string
  client_org_id: string | null
  client_name: string | null
  client_type: string | null
  note: string | null
  created_at: string
  accepted_at: string | null
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("")
  const [note, setNote] = useState("")
  const { toast } = useToast()
  const qc = useQueryClient()

  const send = useMutation({
    mutationFn: () => api.post("/invitations", { client_email: email.trim(), note: note.trim() || null }),
    onSuccess: () => {
      toast("Invitation sent", "success")
      qc.invalidateQueries({ queryKey: ["firm-clients"] })
      onClose()
    },
    onError: (e: any) => {
      toast(e?.response?.data?.detail || "Failed to send invitation", "warning")
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-card border border-border shadow-xl p-6">
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="text-base font-semibold text-foreground">Invite Client</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Send a branded invitation email to link their Accruly account with yours
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Client email address *
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="client@company.com"
                required
                autoFocus
                className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Message (optional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Hi, we'd like to link your account for tax filing this year."
              rows={3}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>
        </div>

        <div className="mt-5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => send.mutate()}
            disabled={!email.trim() || send.isPending}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send Invitation
          </button>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    declined: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    revoked: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  }
  return (
    <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium capitalize ${map[status] ?? map.pending}`}>
      {status}
    </span>
  )
}

export default function FirmClientsPage() {
  const [showInvite, setShowInvite] = useState(false)
  const { toast } = useToast()
  const qc = useQueryClient()

  const { data: clients = [], isLoading } = useQuery<ClientLink[]>({
    queryKey: ["firm-clients"],
    queryFn: () => api.get("/invitations/firm-clients").then((r) => r.data),
  })

  const unlink = useMutation({
    mutationFn: (linkId: string) => api.delete(`/invitations/${linkId}`),
    onSuccess: () => {
      toast("Client unlinked", "success")
      qc.invalidateQueries({ queryKey: ["firm-clients"] })
    },
    onError: () => toast("Failed to unlink", "warning"),
  })

  const active = clients.filter((c) => c.status === "active")
  const pending = clients.filter((c) => c.status === "pending")
  const others = clients.filter((c) => c.status !== "active" && c.status !== "pending")

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Practice</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Clients</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Manage your linked client accounts and send new invitations
          </div>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <UserPlus className="h-4 w-4" />
          Invite Client
        </button>
      </div>

      {isLoading ? (
        <div className="py-14 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      ) : clients.length === 0 ? (
        <Card className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
          <div className="py-16 text-center">
            <Building2 className="mx-auto h-10 w-10 text-muted-foreground/30 mb-3" />
            <div className="text-base font-semibold text-foreground">No clients yet</div>
            <div className="mt-1 text-sm text-muted-foreground max-w-xs mx-auto">
              Send an invitation to your client's email address to link their account.
            </div>
            <button
              onClick={() => setShowInvite(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <UserPlus className="h-4 w-4" />
              Invite Your First Client
            </button>
          </div>
        </Card>
      ) : (
        <>
          {/* Active clients */}
          {active.length > 0 && (
            <Card className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
              <div className="px-5 py-3 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Active Clients ({active.length})
                  </span>
                </div>
              </div>
              <div className="divide-y divide-border/40">
                {active.map((c) => (
                  <div key={c.link_id} className="flex items-center gap-4 px-5 py-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                      <Building2 className="h-5 w-5 text-blue-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          {c.client_name || c.invited_email}
                        </span>
                        <StatusBadge status={c.status} />
                      </div>
                      <div className="text-xs text-muted-foreground">{c.invited_email}</div>
                      {c.accepted_at && (
                        <div className="text-xs text-muted-foreground mt-0.5">Linked {formatDate(c.accepted_at)}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => unlink.mutate(c.link_id)}
                        disabled={unlink.isPending}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 disabled:opacity-50 transition-colors"
                      >
                        <Link2Off className="h-3.5 w-3.5" />
                        Unlink
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Pending invitations */}
          {pending.length > 0 && (
            <Card className="overflow-hidden rounded-2xl border border-amber-200/60 bg-card shadow-sm">
              <div className="px-5 py-3 border-b border-amber-200/60 dark:border-amber-800/30">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-500" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Pending Invitations ({pending.length})
                  </span>
                </div>
              </div>
              <div className="divide-y divide-border/40">
                {pending.map((c) => (
                  <div key={c.link_id} className="flex items-center gap-4 px-5 py-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                      <Mail className="h-5 w-5 text-amber-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">{c.invited_email}</span>
                        <StatusBadge status={c.status} />
                      </div>
                      <div className="text-xs text-muted-foreground">Invited {formatDate(c.created_at)}</div>
                    </div>
                    <button
                      onClick={() => unlink.mutate(c.link_id)}
                      disabled={unlink.isPending}
                      className="shrink-0 inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted/60 disabled:opacity-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Declined / revoked */}
          {others.length > 0 && (
            <Card className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
              <div className="px-5 py-3 border-b border-border/40">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Past Invitations ({others.length})
                </span>
              </div>
              <div className="divide-y divide-border/40">
                {others.map((c) => (
                  <div key={c.link_id} className="flex items-center gap-4 px-5 py-3.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">{c.invited_email}</span>
                        <StatusBadge status={c.status} />
                      </div>
                      <div className="text-xs text-muted-foreground">{formatDate(c.created_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {showInvite && <InviteModal onClose={() => setShowInvite(false)} />}
    </div>
  )
}
