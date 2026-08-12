import { useState } from "react"
import { Loader2, UserPlus, Trash2, Users } from "lucide-react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { useToast } from "../../components/ui/toast"
import { formatDate } from "../../lib/utils"
import api from "../../lib/api"

interface Member {
  user_id: string
  email: string
  full_name: string
  role: string
  is_active: boolean
  joined_at: string | null
  is_you: boolean
}

interface Invite {
  id: string
  email: string
  role: string
  expires_at: string | null
  expired: boolean
}

const ROLES = ["admin", "accountant", "bookkeeper", "viewer"]
const ROLE_COLORS: Record<string, string> = {
  owner: "bg-violet-100 text-violet-700",
  admin: "bg-sky-100 text-sky-700",
  accountant: "bg-emerald-100 text-emerald-700",
  bookkeeper: "bg-amber-100 text-amber-700",
  viewer: "bg-slate-100 text-slate-600",
}

export default function TeamPage() {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [email, setEmail] = useState("")
  const [role, setRole] = useState("viewer")

  const { data: members = [], isLoading } = useQuery<Member[]>({
    queryKey: ["org-users"],
    queryFn: () => api.get("/org/users").then(r => r.data),
  })
  const { data: invites = [] } = useQuery<Invite[]>({
    queryKey: ["org-user-invites"],
    queryFn: () => api.get("/org/users/invites").then(r => r.data).catch(() => []),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["org-users"] })
    qc.invalidateQueries({ queryKey: ["org-user-invites"] })
  }

  const invite = useMutation({
    mutationFn: () => api.post("/org/users/invite", { email, role }).then(r => r.data),
    onSuccess: (d: any) => {
      invalidate()
      setEmail("")
      if (d.emailed) {
        toast(`Invitation emailed to ${d.email}`, "success")
      } else {
        navigator.clipboard?.writeText(d.invite_link).catch(() => {})
        toast("Invite created — link copied to clipboard (email not configured)", "success")
      }
    },
    onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to send invite", "warning"),
  })

  const changeRole = useMutation({
    mutationFn: ({ userId, newRole }: { userId: string; newRole: string }) =>
      api.patch(`/org/users/${userId}`, { role: newRole }).then(r => r.data),
    onSuccess: () => { invalidate(); toast("Role updated", "success") },
    onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to change role", "warning"),
  })

  const removeMember = useMutation({
    mutationFn: (userId: string) => api.delete(`/org/users/${userId}`),
    onSuccess: () => { invalidate(); toast("Member removed", "success") },
    onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to remove member", "warning"),
  })

  const cancelInvite = useMutation({
    mutationFn: (inviteId: string) => api.delete(`/org/users/invites/${inviteId}`),
    onSuccess: () => { invalidate(); toast("Invite cancelled", "success") },
    onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to cancel invite", "warning"),
  })

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Settings</div>
        <div className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
          <Users className="h-6 w-6 text-muted-foreground" /> Team
        </div>
        <div className="mt-1 text-sm text-muted-foreground">Invite colleagues into your organization and manage their roles</div>
      </div>

      <Card className="rounded-2xl border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5 flex-1 min-w-[220px] max-w-md">
            <label className="text-xs font-medium text-muted-foreground">Email</label>
            <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="colleague@company.com" className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Role</label>
            <select value={role} onChange={e => setRole(e.target.value)} className="h-9 rounded-md border border-border bg-background px-3 text-sm">
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <Button
            type="button"
            onClick={() => invite.mutate()}
            disabled={invite.isPending || !email.includes("@")}
            className="h-9 bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] text-white"
          >
            {invite.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <UserPlus className="mr-2 h-3.5 w-3.5" />}
            Invite
          </Button>
        </div>
      </Card>

      {invites.length > 0 && (
        <Card className="rounded-2xl border-border bg-card shadow-sm overflow-hidden">
          <div className="p-4 text-sm font-semibold text-foreground">Pending invites</div>
          <table className="w-full text-sm">
            <tbody>
              {invites.map(i => (
                <tr key={i.id} className="border-t border-border">
                  <td className="px-4 py-2.5 text-sm text-foreground">{i.email}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${ROLE_COLORS[i.role] ?? "bg-slate-100 text-slate-600"}`}>{i.role}</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {i.expired ? "Expired" : i.expires_at ? `Expires ${formatDate(i.expires_at)}` : ""}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-rose-500" onClick={() => cancelInvite.mutate(i.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading team…
        </div>
      ) : (
        <Card className="rounded-2xl border-border bg-card shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Member</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Role</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Joined</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.user_id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5">
                    <div className="text-sm font-medium text-foreground">
                      {m.full_name} {m.is_you && <span className="text-xs text-muted-foreground">(you)</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">{m.email}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    {m.role === "owner" ? (
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${ROLE_COLORS.owner}`}>owner</span>
                    ) : (
                      <select
                        value={m.role}
                        onChange={e => changeRole.mutate({ userId: m.user_id, newRole: e.target.value })}
                        className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                        disabled={m.is_you}
                      >
                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{m.joined_at ? formatDate(m.joined_at) : "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    {!m.is_you && m.role !== "owner" && (
                      <Button
                        type="button" variant="ghost" size="icon" className="h-7 w-7 text-rose-500"
                        onClick={() => { if (confirm(`Remove ${m.full_name} from the organization?`)) removeMember.mutate(m.user_id) }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
