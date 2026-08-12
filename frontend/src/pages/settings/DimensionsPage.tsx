import { useState } from "react"
import { Loader2, Plus, Trash2, FolderKanban } from "lucide-react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { useToast } from "../../components/ui/toast"
import api from "../../lib/api"

interface Dimension {
  id: string
  code: string | null
  name: string
  description: string | null
  is_active: boolean
}

type Kind = "projects" | "departments"

function DimensionTable({ kind }: { kind: Kind }) {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [name, setName] = useState("")
  const [code, setCode] = useState("")

  const { data: rows = [], isLoading } = useQuery<Dimension[]>({
    queryKey: ["dimensions", kind],
    queryFn: () => api.get(`/dimensions/${kind}`, { params: { include_inactive: true } }).then(r => r.data),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ["dimensions", kind] })
  const singular = kind === "projects" ? "project" : "department"

  const create = useMutation({
    mutationFn: () => api.post(`/dimensions/${kind}`, { name, code: code || null }).then(r => r.data),
    onSuccess: () => { invalidate(); setName(""); setCode(""); toast(`${singular} created`, "success") },
    onError: (e: any) => toast(e?.response?.data?.detail ?? `Failed to create ${singular}`, "warning"),
  })

  const toggleActive = useMutation({
    mutationFn: (d: Dimension) => api.patch(`/dimensions/${kind}/${d.id}`, { is_active: !d.is_active }).then(r => r.data),
    onSuccess: () => invalidate(),
    onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to update", "warning"),
  })

  const deactivate = useMutation({
    mutationFn: (id: string) => api.delete(`/dimensions/${kind}/${id}`),
    onSuccess: () => { invalidate(); toast(`${singular} deactivated`, "success") },
    onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to deactivate", "warning"),
  })

  return (
    <Card className="rounded-2xl border-border bg-card p-5 shadow-sm">
      <div className="text-sm font-semibold capitalize text-foreground mb-3">{kind}</div>
      <div className="flex items-end gap-2 mb-4">
        <div className="space-y-1.5 w-32">
          <label className="text-xs font-medium text-muted-foreground">Code</label>
          <Input value={code} onChange={e => setCode(e.target.value)} placeholder="PRJ-01" className="h-9 text-sm" />
        </div>
        <div className="space-y-1.5 flex-1">
          <label className="text-xs font-medium text-muted-foreground">Name</label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder={`New ${singular} name`} className="h-9 text-sm" />
        </div>
        <Button
          type="button"
          onClick={() => create.mutate()}
          disabled={create.isPending || !name.trim()}
          className="h-9 bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] text-white"
        >
          {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {isLoading ? (
        <div className="py-6 text-center text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin inline" />
        </div>
      ) : rows.length === 0 ? (
        <div className="py-6 text-center text-xs text-muted-foreground">No {kind} yet</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Code</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Name</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(d => (
              <tr key={d.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2 text-xs font-mono text-muted-foreground">{d.code ?? "—"}</td>
                <td className="px-3 py-2 text-sm text-foreground">{d.name}</td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => toggleActive.mutate(d)}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${d.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
                  >
                    {d.is_active ? "active" : "inactive"}
                  </button>
                </td>
                <td className="px-3 py-2 text-right">
                  {d.is_active && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-rose-500"
                      onClick={() => { if (confirm(`Deactivate this ${singular}? Existing transactions keep their tag.`)) deactivate.mutate(d.id) }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}

export default function DimensionsPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Settings</div>
        <div className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
          <FolderKanban className="h-6 w-6 text-muted-foreground" /> Projects &amp; Departments
        </div>
        <div className="mt-1 text-sm text-muted-foreground">
          Tag invoices, bills and journal lines with a project or department, then filter the P&amp;L by either
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DimensionTable kind="projects" />
        <DimensionTable kind="departments" />
      </div>
    </div>
  )
}
