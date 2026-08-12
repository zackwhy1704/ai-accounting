import { useMemo, useState } from "react"
import { Loader2, Plus, Play, Pause, Trash2, Repeat, X } from "lucide-react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { useToast } from "../../components/ui/toast"
import { formatCurrency, formatDate } from "../../lib/utils"
import { useAccounts } from "../../lib/hooks"
import api from "../../lib/api"

interface RJLine { account_id: string; description?: string; debit: number; credit: number }
interface RecurringJournal {
  id: string
  name: string
  status: string
  frequency: string
  frequency_interval: number
  next_run_date: string | null
  last_run_date: string | null
  run_count: number
  max_runs: number | null
  reference: string | null
  description: string | null
  auto_post: boolean
  lines: RJLine[]
}

const EMPTY_LINE = { account_id: "", description: "", debit: "", credit: "" }

export default function RecurringJournalsPage() {
  const { toast } = useToast()
  const qc = useQueryClient()
  const { data: accounts = [] } = useAccounts()
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState("")
  const [frequency, setFrequency] = useState("monthly")
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [autoPost, setAutoPost] = useState(true)
  const [lines, setLines] = useState<Array<{ account_id: string; description: string; debit: string; credit: string }>>([
    { ...EMPTY_LINE }, { ...EMPTY_LINE },
  ])

  const postableAccounts = useMemo(
    () => accounts.filter((a: any) => a.account_role !== "header" && a.account_role !== "subheader"),
    [accounts],
  )

  const { data: page, isLoading } = useQuery<{ items: RecurringJournal[] }>({
    queryKey: ["recurring-journals"],
    queryFn: () => api.get("/recurring-journals", { params: { limit: 100 } }).then(r => r.data),
  })
  const journals = page?.items ?? []

  const invalidate = () => qc.invalidateQueries({ queryKey: ["recurring-journals"] })

  const totals = useMemo(() => {
    const dr = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0)
    const cr = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0)
    return { dr, cr, balanced: Math.abs(dr - cr) < 0.005 && dr > 0 }
  }, [lines])

  const create = useMutation({
    mutationFn: () => api.post("/recurring-journals", {
      name,
      frequency,
      start_date: new Date(startDate).toISOString(),
      auto_post: autoPost,
      lines: lines
        .filter(l => l.account_id)
        .map(l => ({ account_id: l.account_id, description: l.description || null, debit: parseFloat(l.debit) || 0, credit: parseFloat(l.credit) || 0 })),
    }).then(r => r.data),
    onSuccess: () => {
      invalidate()
      setShowForm(false)
      setName("")
      setLines([{ ...EMPTY_LINE }, { ...EMPTY_LINE }])
      toast("Recurring journal created", "success")
    },
    onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to create recurring journal", "warning"),
  })

  const runNow = useMutation({
    mutationFn: (id: string) => api.post(`/recurring-journals/${id}/run-now`).then(r => r.data),
    onSuccess: (d: any) => {
      invalidate()
      qc.invalidateQueries({ queryKey: ["manual-journals"] })
      toast(`Journal ${d.journal_number} created${d.posted ? " and posted" : " (draft)"}`, "success")
    },
    onError: (e: any) => toast(e?.response?.data?.detail ?? "Run failed", "warning"),
  })

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/recurring-journals/${id}`, { status }).then(r => r.data),
    onSuccess: () => invalidate(),
    onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to update", "warning"),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/recurring-journals/${id}`),
    onSuccess: () => { invalidate(); toast("Template deleted", "success") },
    onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to delete", "warning"),
  })

  const setLine = (i: number, key: keyof typeof EMPTY_LINE, value: string) =>
    setLines(prev => prev.map((l, idx) => (idx === i ? { ...l, [key]: value } : l)))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Accounting</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Recurring Journals</div>
          <div className="mt-1 text-sm text-muted-foreground">Balanced journal templates that post on a schedule</div>
        </div>
        <Button
          type="button"
          onClick={() => setShowForm(v => !v)}
          className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white"
        >
          {showForm ? <X className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
          {showForm ? "Close" : "New Template"}
        </Button>
      </div>

      {showForm && (
        <Card className="rounded-2xl border-border bg-card p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Monthly rent accrual" className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Frequency</label>
              <select value={frequency} onChange={e => setFrequency(e.target.value)} className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm">
                {["daily", "weekly", "monthly", "yearly"].map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Start date</label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <select
                  value={l.account_id}
                  onChange={e => setLine(i, "account_id", e.target.value)}
                  className="col-span-5 h-9 rounded-md border border-border bg-background px-2 text-sm"
                >
                  <option value="">Select account…</option>
                  {postableAccounts.map((a: any) => (
                    <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                  ))}
                </select>
                <Input value={l.description} onChange={e => setLine(i, "description", e.target.value)} placeholder="Line description" className="col-span-3 h-9 text-sm" />
                <Input type="number" value={l.debit} onChange={e => setLine(i, "debit", e.target.value)} placeholder="Debit" className="col-span-2 h-9 text-sm text-right" />
                <Input type="number" value={l.credit} onChange={e => setLine(i, "credit", e.target.value)} placeholder="Credit" className="col-span-1 h-9 text-sm text-right" />
                <Button type="button" variant="ghost" size="icon" className="col-span-1 h-8 w-8 text-rose-500" onClick={() => setLines(prev => prev.filter((_, idx) => idx !== i))} disabled={lines.length <= 2}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <Button type="button" variant="outline" size="sm" onClick={() => setLines(prev => [...prev, { ...EMPTY_LINE }])}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Line
              </Button>
              <div className={`text-sm tabular-nums ${totals.balanced ? "text-emerald-600" : "text-rose-600"}`}>
                Dr {formatCurrency(totals.dr)} / Cr {formatCurrency(totals.cr)} {totals.balanced ? "✓ balanced" : "✗ unbalanced"}
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={autoPost} onChange={e => setAutoPost(e.target.checked)} className="h-4 w-4" />
              Post to GL automatically on each run
            </label>
            <Button
              type="button"
              onClick={() => create.mutate()}
              disabled={create.isPending || !name.trim() || !totals.balanced}
              className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white"
            >
              {create.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-2 h-3.5 w-3.5" />}
              Create Template
            </Button>
          </div>
        </Card>
      )}

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…
        </div>
      ) : journals.length === 0 ? (
        <Card className="rounded-2xl border-border bg-card p-12 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Repeat className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="text-sm font-semibold text-foreground">No recurring journals</div>
          <div className="mt-1 text-xs text-muted-foreground">Create a template for repeating entries like rent or depreciation accruals</div>
        </Card>
      ) : (
        <Card className="rounded-2xl border-border bg-card shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Frequency</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Next Run</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Runs</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {journals.map(j => (
                <tr key={j.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5">
                    <div className="text-sm font-medium text-foreground">{j.name}</div>
                    <div className="text-[10px] text-muted-foreground">{j.auto_post ? "auto-post" : "creates drafts"} · {j.lines.length} lines</div>
                  </td>
                  <td className="px-4 py-2.5 text-sm capitalize text-muted-foreground">{j.frequency}</td>
                  <td className="px-4 py-2.5 text-sm text-muted-foreground">{j.next_run_date ? formatDate(j.next_run_date) : "—"}</td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{j.run_count}{j.max_runs ? ` / ${j.max_runs}` : ""}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${j.status === "active" ? "bg-emerald-100 text-emerald-700" : j.status === "paused" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                      {j.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="inline-flex items-center gap-1">
                      {j.status === "active" && (
                        <>
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Run now" onClick={() => runNow.mutate(j.id)} disabled={runNow.isPending}>
                            <Play className="h-3.5 w-3.5" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Pause" onClick={() => setStatus.mutate({ id: j.id, status: "paused" })}>
                            <Pause className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      {j.status === "paused" && (
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Resume" onClick={() => setStatus.mutate({ id: j.id, status: "active" })}>
                          <Play className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-rose-500" onClick={() => { if (confirm("Delete this recurring journal template?")) remove.mutate(j.id) }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
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
