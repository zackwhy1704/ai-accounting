import { useState, useRef } from "react"
import { Plus, Loader2, Pencil, Check, X, Trash2, Upload, AlertCircle, CheckCircle2, FileUp } from "lucide-react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { formatCurrency } from "../../lib/utils"
import { useToast } from "../../components/ui/toast"
import api from "../../lib/api"

interface Account {
  id: string
  code: string
  name: string
  type: string
  subtype: string | null
  description: string | null
  balance: number
  currency: string
  is_system: boolean
}

interface ExtractedAccount {
  code: string
  name: string
  type: string
  subtype: string | null
  description: string | null
}

type AccountTypeFilter = "All" | "Assets" | "Liabilities" | "Equity" | "Revenue" | "Expenses"
const FILTER_TABS: AccountTypeFilter[] = ["All", "Assets", "Liabilities", "Equity", "Revenue", "Expenses"]

const TYPE_LABEL_MAP: Record<string, string> = {
  asset: "Assets", assets: "Assets",
  liability: "Liabilities", liabilities: "Liabilities",
  equity: "Equity",
  revenue: "Revenue", income: "Revenue",
  expense: "Expenses", expenses: "Expenses",
}
const LABEL_TO_TYPE: Record<string, string> = {
  Assets: "asset", Liabilities: "liability", Equity: "equity", Revenue: "revenue", Expenses: "expense",
}
const TYPE_COLOR: Record<string, string> = {
  Assets: "bg-blue-100 text-blue-700",
  Liabilities: "bg-rose-100 text-rose-700",
  Equity: "bg-purple-100 text-purple-700",
  Revenue: "bg-emerald-100 text-emerald-700",
  Expenses: "bg-amber-100 text-amber-700",
}
const TYPE_OPTIONS = ["asset", "liability", "equity", "revenue", "expense"]

interface EditState {
  code: string
  name: string
  type: string
  subtype: string
  description: string
}

export default function ChartOfAccountsPage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const [activeFilter, setActiveFilter] = useState<AccountTypeFilter>("All")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState>({ code: "", name: "", type: "", subtype: "", description: "" })
  const [showNewRow, setShowNewRow] = useState(false)
  const [newRow, setNewRow] = useState<EditState>({ code: "", name: "", type: "asset", subtype: "", description: "" })

  // PDF import state
  const [importOpen, setImportOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState("")
  const [extracted, setExtracted] = useState<ExtractedAccount[] | null>(null)
  const [editingExtracted, setEditingExtracted] = useState<ExtractedAccount[]>([])
  const [confirming, setConfirming] = useState(false)

  const { data: accounts = [], isLoading } = useQuery<Account[]>({
    queryKey: ["accounts"],
    queryFn: () => api.get("/accounts").then(r => r.data),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<EditState>) =>
      api.patch(`/accounts/${id}`, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] })
      setEditingId(null)
      toast("Account updated", "success")
    },
    onError: (e: any) => toast(e?.response?.data?.detail || "Failed to update account", "warning"),
  })

  const createMutation = useMutation({
    mutationFn: (data: EditState) => api.post("/accounts", { ...data, currency: "MYR" }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] })
      setShowNewRow(false)
      setNewRow({ code: "", name: "", type: "asset", subtype: "", description: "" })
      toast("Account created", "success")
    },
    onError: (e: any) => toast(e?.response?.data?.detail || "Failed to create account", "warning"),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/accounts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] })
      toast("Account removed", "success")
    },
    onError: (e: any) => toast(e?.response?.data?.detail || "Cannot delete this account", "warning"),
  })

  const confirmImportMutation = useMutation({
    mutationFn: (rows: ExtractedAccount[]) =>
      api.post("/accounts/import-pdf/confirm", rows).then(r => r.data),
    onSuccess: (data: Account[]) => {
      qc.invalidateQueries({ queryKey: ["accounts"] })
      toast(`${data.length} accounts imported`, "success")
      setImportOpen(false)
      setExtracted(null)
      setEditingExtracted([])
    },
    onError: (e: any) => toast(e?.response?.data?.detail || "Import failed", "warning"),
  })

  const startEdit = (a: Account) => {
    setEditingId(a.id)
    setEditState({ code: a.code, name: a.name, type: a.type, subtype: a.subtype ?? "", description: a.description ?? "" })
  }

  const saveEdit = (id: string) => {
    updateMutation.mutate({ id, ...editState })
  }

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportError("")
    setExtracted(null)
    const form = new FormData()
    form.append("file", file)
    try {
      const res = await api.post("/accounts/import-pdf", form, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120000,
      })
      setExtracted(res.data.accounts)
      setEditingExtracted(res.data.accounts.map((a: ExtractedAccount) => ({ ...a })))
    } catch (err: any) {
      setImportError(err?.response?.data?.detail || "Failed to extract accounts from PDF")
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  const updateExtractedRow = (i: number, field: keyof ExtractedAccount, value: string) => {
    setEditingExtracted(prev => {
      const updated = [...prev]
      updated[i] = { ...updated[i], [field]: value }
      return updated
    })
  }

  const removeExtractedRow = (i: number) => {
    setEditingExtracted(prev => prev.filter((_, idx) => idx !== i))
  }

  const normaliseType = (t: string | undefined | null) =>
    t ? (TYPE_LABEL_MAP[t.toLowerCase()] ?? "Other") : "Other"

  const filtered = activeFilter === "All" ? accounts : accounts.filter(a => normaliseType(a.type) === activeFilter)
  const grouped = filtered.reduce<Record<string, Account[]>>((acc, a) => {
    const type = normaliseType(a.type)
    if (!acc[type]) acc[type] = []
    acc[type].push(a)
    return acc
  }, {})
  const groupOrder = ["Assets", "Liabilities", "Equity", "Revenue", "Expenses"]
  const sortedGroups = Object.entries(grouped).sort(([a], [b]) => groupOrder.indexOf(a) - groupOrder.indexOf(b))

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Accounting</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Chart of Accounts</div>
          <div className="mt-1 text-sm text-muted-foreground">All accounts used in your general ledger</div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => { setImportOpen(true); setExtracted(null); setImportError("") }}
            className="h-9 rounded-xl px-3 text-xs font-semibold"
          >
            <FileUp className="mr-1.5 h-4 w-4" /> Import PDF
          </Button>
          <Button
            type="button"
            onClick={() => setShowNewRow(true)}
            className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white"
          >
            <Plus className="mr-1.5 h-4 w-4" /> New Account
          </Button>
        </div>
      </div>

      {/* PDF Import Panel */}
      {importOpen && (
        <Card className="rounded-2xl border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Import Chart of Accounts from PDF</p>
              <p className="text-xs text-muted-foreground mt-0.5">Upload a PDF and AI will extract account lines for review before saving</p>
            </div>
            <button type="button" onClick={() => { setImportOpen(false); setExtracted(null); setImportError("") }} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {!extracted ? (
            <div
              onClick={() => fileRef.current?.click()}
              className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/30 p-10 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors"
            >
              <Upload className="h-7 w-7 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium text-foreground">Click to upload PDF</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Max 10MB</p>
              <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={handlePdfUpload} />
              {importing && (
                <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Extracting accounts…
                </div>
              )}
              {importError && (
                <div className="mt-3 flex items-center gap-2 text-sm text-rose-600">
                  <AlertCircle className="h-4 w-4 shrink-0" /> {importError}
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="mb-3 flex items-center gap-2 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                {editingExtracted.length} accounts extracted — review and edit before saving
              </div>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Code</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Name</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Type</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Subtype</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Description</th>
                      <th className="px-3 py-2 w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {editingExtracted.map((row, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5">
                          <Input value={row.code} onChange={e => updateExtractedRow(i, "code", e.target.value)} className="h-7 w-20 rounded border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-1 font-mono" />
                        </td>
                        <td className="px-3 py-1.5">
                          <Input value={row.name} onChange={e => updateExtractedRow(i, "name", e.target.value)} className="h-7 w-44 rounded border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-1" />
                        </td>
                        <td className="px-3 py-1.5">
                          <select value={row.type} onChange={e => updateExtractedRow(i, "type", e.target.value)} className="h-7 rounded border border-border bg-card px-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40">
                            {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-1.5">
                          <Input value={row.subtype ?? ""} onChange={e => updateExtractedRow(i, "subtype", e.target.value)} className="h-7 w-24 rounded border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-1" placeholder="optional" />
                        </td>
                        <td className="px-3 py-1.5">
                          <Input value={row.description ?? ""} onChange={e => updateExtractedRow(i, "description", e.target.value)} className="h-7 w-40 rounded border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-1" placeholder="optional" />
                        </td>
                        <td className="px-3 py-1.5">
                          <button type="button" onClick={() => removeExtractedRow(i)} className="text-muted-foreground hover:text-rose-500">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <button type="button" onClick={() => { setExtracted(null); setEditingExtracted([]) }} className="text-xs text-muted-foreground hover:text-foreground">← Re-upload</button>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="secondary" onClick={() => { setImportOpen(false); setExtracted(null) }} className="h-8 rounded-lg px-3 text-xs">Cancel</Button>
                  <Button
                    type="button"
                    disabled={confirmImportMutation.isPending || editingExtracted.length === 0}
                    onClick={() => confirmImportMutation.mutate(editingExtracted.map(r => ({ ...r, currency: "MYR" })))}
                    className="h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 text-xs font-semibold text-white"
                  >
                    {confirmImportMutation.isPending ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Saving…</> : `Save ${editingExtracted.length} Accounts`}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {FILTER_TABS.map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveFilter(tab)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${activeFilter === tab ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
          >
            {tab}
          </button>
        ))}
      </div>

      <Card className="rounded-2xl border-border bg-card shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)] overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin inline" />
          </div>
        ) : accounts.length === 0 ? (
          <div className="py-12 text-center">
            <div className="text-sm font-semibold text-foreground">No accounts found</div>
            <div className="mt-1 text-xs text-muted-foreground">Create your first account or import from PDF</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground w-24">Code</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground w-28">Type</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground w-28">Subtype</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground w-32">Balance</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {/* Inline new account row */}
              {showNewRow && (
                <tr className="border-b border-border bg-blue-50/40 dark:bg-blue-900/10">
                  <td className="px-3 py-1.5">
                    <Input value={newRow.code} onChange={e => setNewRow(p => ({ ...p, code: e.target.value }))} placeholder="1000" className="h-8 w-20 rounded-lg text-xs font-mono" autoFocus />
                  </td>
                  <td className="px-3 py-1.5">
                    <Input value={newRow.name} onChange={e => setNewRow(p => ({ ...p, name: e.target.value }))} placeholder="Account name" className="h-8 rounded-lg text-xs" />
                  </td>
                  <td className="px-3 py-1.5">
                    <select value={newRow.type} onChange={e => setNewRow(p => ({ ...p, type: e.target.value }))} className="h-8 w-full rounded-lg border border-border bg-card px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40">
                      {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    <Input value={newRow.subtype} onChange={e => setNewRow(p => ({ ...p, subtype: e.target.value }))} placeholder="optional" className="h-8 rounded-lg text-xs" />
                  </td>
                  <td className="px-3 py-1.5 text-right text-xs text-muted-foreground">—</td>
                  <td className="px-3 py-1.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button type="button" onClick={() => createMutation.mutate(newRow)} disabled={!newRow.code || !newRow.name || createMutation.isPending} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                        {createMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      </button>
                      <button type="button" onClick={() => setShowNewRow(false)} className="flex items-center rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {sortedGroups.map(([type, accs]) => (
                <>
                  <tr key={`group-${type}`} className="bg-muted/20">
                    <td colSpan={6} className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {type}
                    </td>
                  </tr>
                  {accs.map(a => (
                    <tr key={a.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      {editingId === a.id ? (
                        <>
                          <td className="px-3 py-1.5">
                            <Input value={editState.code} onChange={e => setEditState(p => ({ ...p, code: e.target.value }))} className="h-8 w-20 rounded-lg text-xs font-mono" />
                          </td>
                          <td className="px-3 py-1.5">
                            <Input value={editState.name} onChange={e => setEditState(p => ({ ...p, name: e.target.value }))} className="h-8 rounded-lg text-xs" />
                          </td>
                          <td className="px-3 py-1.5">
                            <select value={editState.type} onChange={e => setEditState(p => ({ ...p, type: e.target.value }))} className="h-8 w-full rounded-lg border border-border bg-card px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40">
                              {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-1.5">
                            <Input value={editState.subtype} onChange={e => setEditState(p => ({ ...p, subtype: e.target.value }))} placeholder="optional" className="h-8 rounded-lg text-xs" />
                          </td>
                          <td className="px-3 py-1.5 text-right text-xs text-muted-foreground tabular-nums">
                            {formatCurrency(a.balance ?? 0, a.currency)}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button type="button" onClick={() => saveEdit(a.id)} disabled={updateMutation.isPending} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                                {updateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                              </button>
                              <button type="button" onClick={() => setEditingId(null)} className="flex items-center rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted">
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{a.code}</td>
                          <td className="px-4 py-2.5 text-sm font-medium text-foreground">
                            {a.name}
                            {a.description && <div className="text-xs text-muted-foreground font-normal mt-0.5">{a.description}</div>}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${TYPE_COLOR[type] ?? "bg-muted text-muted-foreground"}`}>
                              {type}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{a.subtype ?? "—"}</td>
                          <td className={`px-4 py-2.5 text-right text-sm tabular-nums ${(a.balance ?? 0) < 0 ? "text-rose-600" : "text-foreground"}`}>
                            {formatCurrency(a.balance ?? 0, a.currency)}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button type="button" onClick={() => startEdit(a)} className="flex items-center gap-1 text-xs text-primary hover:underline">
                                <Pencil className="h-3 w-3" /> Edit
                              </button>
                              {!a.is_system && (
                                <button type="button" onClick={() => deleteMutation.mutate(a.id)} className="text-xs text-rose-500 hover:text-rose-600 hover:underline">
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
