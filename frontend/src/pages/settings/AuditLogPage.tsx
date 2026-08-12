import { useEffect, useState } from "react"
import { Loader2, ScrollText, Search } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { Card } from "../../components/ui/card"
import { Input } from "../../components/ui/input"
import { PaginationControls } from "../../components/ui/pagination-controls"
import api from "../../lib/api"

interface AuditRow {
  id: string
  action: string
  entity_type: string
  entity_id: string | null
  changes: Record<string, unknown> | null
  user_id: string | null
  user_email: string | null
  created_at: string | null
}

const ACTION_COLORS: Record<string, string> = {
  create: "bg-emerald-100 text-emerald-700",
  update: "bg-sky-100 text-sky-700",
  delete: "bg-rose-100 text-rose-700",
  void: "bg-rose-100 text-rose-700",
}

export default function AuditLogPage() {
  const [entityType, setEntityType] = useState("")
  const [action, setAction] = useState("")
  const [page, setPage] = useState(1)

  useEffect(() => { setPage(1) }, [entityType, action])

  const { data, isLoading, isError } = useQuery<{ items: AuditRow[]; total: number; pages: number }>({
    queryKey: ["audit-logs", { entityType, action, page }],
    queryFn: () => api.get("/audit-logs", {
      params: {
        page, limit: 50,
        ...(entityType ? { entity_type: entityType } : {}),
        ...(action ? { action } : {}),
      },
    }).then(r => r.data),
  })

  const rows = data?.items ?? []

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Settings</div>
        <div className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
          <ScrollText className="h-6 w-6 text-muted-foreground" /> Audit Log
        </div>
        <div className="mt-1 text-sm text-muted-foreground">Every change in your organization, by whom, and when (admin only)</div>
      </div>

      <Card className="rounded-2xl border-border bg-card p-4 shadow-sm">
        <div className="flex items-end gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Entity type</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={entityType} onChange={e => setEntityType(e.target.value)} placeholder="invoice, bill, contact…" className="h-9 w-56 pl-9 text-sm" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Action</label>
            <select value={action} onChange={e => setAction(e.target.value)} className="h-9 rounded-md border border-border bg-background px-3 text-sm">
              <option value="">All actions</option>
              {["create", "update", "delete", "void", "status_change", "email_sent", "invite"].map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading audit trail…
        </div>
      ) : isError ? (
        <Card className="rounded-2xl border-border bg-card p-8 text-center shadow-sm">
          <div className="text-sm font-semibold text-foreground">Couldn't load the audit log</div>
          <div className="mt-1 text-xs text-muted-foreground">You need an admin or owner role to view this page.</div>
        </Card>
      ) : (
        <Card className="rounded-2xl border-border bg-card shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">When</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">User</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Action</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Entity</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                    {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-foreground">{r.user_email ?? "system"}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${ACTION_COLORS[r.action] ?? "bg-slate-100 text-slate-600"}`}>
                      {r.action}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{r.entity_type}</td>
                  <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground max-w-[320px] truncate">
                    {r.changes ? JSON.stringify(r.changes) : r.entity_id ?? "—"}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-xs text-muted-foreground">No audit entries match</td></tr>
              )}
            </tbody>
          </table>
          <PaginationControls page={page} pages={data?.pages ?? 1} total={data?.total ?? 0} limit={50} onPageChange={setPage} />
        </Card>
      )}
    </div>
  )
}
