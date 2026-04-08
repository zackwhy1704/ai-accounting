import { useState, useRef } from "react"
import { Plus, Loader2, Pencil, Check, X, Trash2, Upload, ToggleLeft, ToggleRight, AlertCircle, CheckCircle2, FileUp } from "lucide-react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { useToast } from "../../components/ui/toast"
import api from "../../lib/api"
import { useTaxRates, useCreateTaxRate, useUpdateTaxRate, useDeleteTaxRate } from "../../lib/hooks"

// ── Types ─────────────────────────────────────────────────────────────────────

interface TaxRate {
  id: string
  organization_id: string
  name: string
  code: string
  rate: number
  tax_type: string
  is_default: boolean
  is_active: boolean
  sst_category: string | null
  created_at: string
}

interface FormState {
  name: string
  code: string
  rate: string
  tax_type: string
}

interface ExtractedRow {
  code: string
  name: string
  rate: number | string
  tax_type: string
  sst_category: string | null
}

const BLANK_FORM: FormState = { name: "", code: "", rate: "", tax_type: "SST" }
const TAX_TYPES = ["SST", "GST", "VAT", "Service Tax", "Withholding", "None"]

const TYPE_COLOR: Record<string, string> = {
  SST: "bg-amber-100 text-amber-700",
  GST: "bg-blue-100 text-blue-700",
  VAT: "bg-purple-100 text-purple-700",
  "Service Tax": "bg-teal-100 text-teal-700",
  Withholding: "bg-rose-100 text-rose-700",
  None: "bg-muted text-muted-foreground",
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TaxCodesPage() {
  const { toast } = useToast()
  const qc = useQueryClient()
  const pdfRef = useRef<HTMLInputElement>(null)
  const csvRef = useRef<HTMLInputElement>(null)

  // Table CRUD state
  const [showNewRow, setShowNewRow] = useState(false)
  const [newForm, setNewForm] = useState<FormState>(BLANK_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<FormState>(BLANK_FORM)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Import panel state
  const [importOpen, setImportOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState("")
  const [extracted, setExtracted] = useState<ExtractedRow[] | null>(null)
  const [editingExtracted, setEditingExtracted] = useState<ExtractedRow[]>([])

  const { data: taxRates = [], isLoading } = useTaxRates()
  const createMutation = useCreateTaxRate()
  const updateMutation = useUpdateTaxRate()
  const deleteMutation = useDeleteTaxRate()

  const confirmImportMutation = useMutation({
    mutationFn: (rows: ExtractedRow[]) =>
      api.post("/tax-rates/import-pdf/confirm", rows.map(r => ({
        code: r.code,
        name: r.name,
        rate: typeof r.rate === "string" ? parseFloat(r.rate) || 0 : r.rate,
        tax_type: r.tax_type || "SST",
        sst_category: r.sst_category || null,
      }))).then(r => r.data),
    onSuccess: (data: TaxRate[]) => {
      qc.invalidateQueries({ queryKey: ["tax-rates"] })
      toast(`${data.length} tax codes imported`, "success")
      setImportOpen(false)
      setExtracted(null)
      setEditingExtracted([])
    },
    onError: (e: any) => toast(e?.response?.data?.detail || "Import failed", "warning"),
  })

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function startEdit(t: TaxRate) {
    setEditingId(t.id)
    setEditForm({ name: t.name, code: t.code, rate: String(t.rate), tax_type: t.tax_type })
    setShowNewRow(false)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditForm(BLANK_FORM)
  }

  function handleCreate() {
    if (!newForm.name || !newForm.code || newForm.rate === "") return
    createMutation.mutate(
      { name: newForm.name, code: newForm.code, rate: parseFloat(newForm.rate), tax_type: newForm.tax_type },
      {
        onSuccess: () => { toast("Tax code created", "success"); setShowNewRow(false); setNewForm(BLANK_FORM) },
        onError: (e: any) => toast(e?.response?.data?.detail || "Failed to create", "warning"),
      }
    )
  }

  function handleUpdate(id: string) {
    updateMutation.mutate(
      { id, name: editForm.name, code: editForm.code, rate: parseFloat(editForm.rate), tax_type: editForm.tax_type },
      {
        onSuccess: () => { toast("Tax code updated", "success"); cancelEdit() },
        onError: (e: any) => toast(e?.response?.data?.detail || "Failed to update", "warning"),
      }
    )
  }

  function handleToggleActive(t: TaxRate) {
    updateMutation.mutate(
      { id: t.id, is_active: !t.is_active },
      { onError: (e: any) => toast(e?.response?.data?.detail || "Failed", "warning") }
    )
  }

  function handleDelete(id: string) {
    deleteMutation.mutate(id, {
      onSuccess: () => { toast("Tax code deleted", "success"); setDeletingId(null) },
      onError: (e: any) => toast(e?.response?.data?.detail || "Failed to delete", "warning"),
    })
  }

  // PDF upload → AI extraction
  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportError("")
    setExtracted(null)
    const form = new FormData()
    form.append("file", file)
    try {
      const res = await api.post("/tax-rates/import-pdf", form, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120000,
      })
      setExtracted(res.data.tax_rates)
      setEditingExtracted(res.data.tax_rates.map((r: ExtractedRow) => ({ ...r })))
    } catch (err: any) {
      setImportError(err?.response?.data?.detail || "Failed to extract tax codes from PDF")
    } finally {
      setImporting(false)
      if (pdfRef.current) pdfRef.current.value = ""
    }
  }

  // CSV upload → client-side parse
  function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportError("")
    setExtracted(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const text = (ev.target?.result as string) || ""
        const lines = text.split(/\r?\n/).filter(l => l.trim())
        if (lines.length < 2) {
          setImportError("CSV must have a header row and at least one data row")
          setImporting(false)
          return
        }
        const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/^\uFEFF/, ""))
        const codeIdx = headers.indexOf("code")
        const nameIdx = headers.indexOf("name")
        const rateIdx = headers.indexOf("rate")
        const typeIdx = headers.indexOf("tax_type")
        const sstIdx = headers.indexOf("sst_category")

        if (codeIdx === -1 || nameIdx === -1 || rateIdx === -1) {
          setImportError("CSV must have columns: code, name, rate (optional: tax_type, sst_category)")
          setImporting(false)
          return
        }

        const rows: ExtractedRow[] = []
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(",").map(c => c.trim())
          const code = cols[codeIdx] || ""
          const name = cols[nameIdx] || ""
          if (!code || !name) continue
          rows.push({
            code,
            name,
            rate: parseFloat(cols[rateIdx] || "0") || 0,
            tax_type: typeIdx >= 0 ? (cols[typeIdx] || "SST") : "SST",
            sst_category: sstIdx >= 0 ? (cols[sstIdx] || null) : null,
          })
        }

        if (rows.length === 0) {
          setImportError("No valid rows found in CSV")
          setImporting(false)
          return
        }
        setExtracted(rows)
        setEditingExtracted(rows.map(r => ({ ...r })))
      } catch {
        setImportError("Failed to parse CSV file")
      } finally {
        setImporting(false)
        if (csvRef.current) csvRef.current.value = ""
      }
    }
    reader.readAsText(file)
  }

  function updateExtractedRow(i: number, field: keyof ExtractedRow, value: string) {
    setEditingExtracted(prev => {
      const updated = [...prev]
      updated[i] = { ...updated[i], [field]: value }
      return updated
    })
  }

  function removeExtractedRow(i: number) {
    setEditingExtracted(prev => prev.filter((_, idx) => idx !== i))
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Accounting</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Tax Codes</div>
          <div className="mt-1 text-sm text-muted-foreground">Manage tax codes and rates for your business</div>
        </div>
        <div className="flex items-center gap-2">
          <input ref={pdfRef} type="file" accept="application/pdf" className="hidden" onChange={handlePdfUpload} />
          <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
          <Button
            type="button"
            variant="secondary"
            onClick={() => { setImportOpen(true); setExtracted(null); setImportError("") }}
            className="h-9 rounded-xl px-3 text-xs font-semibold"
          >
            <FileUp className="mr-1.5 h-4 w-4" /> Import
          </Button>
          <Button
            type="button"
            onClick={() => { setShowNewRow(true); cancelEdit() }}
            className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white"
          >
            <Plus className="mr-1.5 h-4 w-4" /> Add Tax Code
          </Button>
        </div>
      </div>

      {/* Import Panel */}
      {importOpen && (
        <Card className="rounded-2xl border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Import Tax Codes</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Upload a <strong>PDF</strong> — AI will extract tax codes for review. Or upload a <strong>CSV</strong> with columns: <span className="font-mono">code, name, rate, tax_type, sst_category</span>.
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setImportOpen(false); setExtracted(null); setImportError("") }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {!extracted ? (
            <div className="flex flex-col gap-3">
              {/* PDF drop zone */}
              <div
                onClick={() => pdfRef.current?.click()}
                className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/30 p-8 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors"
              >
                <Upload className="h-7 w-7 text-muted-foreground" />
                <p className="mt-2 text-sm font-medium text-foreground">Click to upload PDF</p>
                <p className="mt-0.5 text-xs text-muted-foreground">AI will extract tax codes — max 10MB</p>
                {importing && (
                  <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Extracting tax codes…
                  </div>
                )}
              </div>
              {/* CSV divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 border-t border-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="flex-1 border-t border-border" />
              </div>
              <button
                type="button"
                onClick={() => csvRef.current?.click()}
                className="flex items-center justify-center gap-2 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
              >
                <FileUp className="h-4 w-4" /> Upload CSV file
              </button>
              {importError && (
                <div className="flex items-center gap-2 text-sm text-rose-600">
                  <AlertCircle className="h-4 w-4 shrink-0" /> {importError}
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="mb-3 flex items-center gap-2 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                {editingExtracted.length} tax codes extracted — review and edit before saving
              </div>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Code</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Name</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground w-20">Rate %</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground w-28">Type</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">SST Category</th>
                      <th className="px-3 py-2 w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {editingExtracted.map((row, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5">
                          <Input value={row.code} onChange={e => updateExtractedRow(i, "code", e.target.value)} className="h-7 w-24 rounded border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-1 font-mono" />
                        </td>
                        <td className="px-3 py-1.5">
                          <Input value={row.name} onChange={e => updateExtractedRow(i, "name", e.target.value)} className="h-7 w-48 rounded border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-1" />
                        </td>
                        <td className="px-3 py-1.5">
                          <Input type="number" min={0} max={100} step={0.01} value={String(row.rate)} onChange={e => updateExtractedRow(i, "rate", e.target.value)} className="h-7 w-16 rounded border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-1 text-right" />
                        </td>
                        <td className="px-3 py-1.5">
                          <select value={row.tax_type} onChange={e => updateExtractedRow(i, "tax_type", e.target.value)} className="h-7 rounded border border-border bg-card px-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40">
                            {TAX_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-1.5">
                          <Input value={row.sst_category ?? ""} onChange={e => updateExtractedRow(i, "sst_category", e.target.value)} className="h-7 w-32 rounded border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-1" placeholder="optional" />
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
                    onClick={() => confirmImportMutation.mutate(editingExtracted)}
                    className="h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 text-xs font-semibold text-white"
                  >
                    {confirmImportMutation.isPending
                      ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Saving…</>
                      : `Save ${editingExtracted.length} Tax Codes`}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Table card */}
      <Card className="rounded-2xl border-border bg-card shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)] overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin inline" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground w-24">Code</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground w-24">Rate %</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground w-32">Type</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground w-24">Status</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground w-32">Actions</th>
              </tr>
            </thead>
            <tbody>
              {showNewRow && (
                <tr className="border-b border-border bg-blue-50/40 dark:bg-blue-900/10">
                  <td className="px-3 py-1.5">
                    <Input value={newForm.code} onChange={e => setNewForm(p => ({ ...p, code: e.target.value }))} placeholder="e.g. SST-6" className="h-8 w-24 rounded-lg text-xs font-mono" autoFocus />
                  </td>
                  <td className="px-3 py-1.5">
                    <Input value={newForm.name} onChange={e => setNewForm(p => ({ ...p, name: e.target.value }))} placeholder="Tax code name" className="h-8 rounded-lg text-xs" />
                  </td>
                  <td className="px-3 py-1.5">
                    <Input type="number" min={0} max={100} step={0.01} value={newForm.rate} onChange={e => setNewForm(p => ({ ...p, rate: e.target.value }))} placeholder="6.00" className="h-8 w-20 rounded-lg text-xs text-right ml-auto" />
                  </td>
                  <td className="px-3 py-1.5">
                    <select value={newForm.tax_type} onChange={e => setNewForm(p => ({ ...p, tax_type: e.target.value }))} className="h-8 w-full rounded-lg border border-border bg-card px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40">
                      {TAX_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">—</td>
                  <td className="px-3 py-1.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button type="button" onClick={handleCreate} disabled={!newForm.name || !newForm.code || newForm.rate === "" || createMutation.isPending} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                        {createMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      </button>
                      <button type="button" onClick={() => { setShowNewRow(false); setNewForm(BLANK_FORM) }} className="flex items-center rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {taxRates.length === 0 && !showNewRow ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <div className="text-sm font-semibold text-foreground">No tax codes yet</div>
                    <div className="mt-1 text-xs text-muted-foreground">Click "Add Tax Code" to create your first one, or import from PDF / CSV</div>
                  </td>
                </tr>
              ) : (
                taxRates.map(t => (
                  <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    {editingId === t.id ? (
                      <>
                        <td className="px-3 py-1.5"><Input value={editForm.code} onChange={e => setEditForm(p => ({ ...p, code: e.target.value }))} className="h-8 w-24 rounded-lg text-xs font-mono" autoFocus /></td>
                        <td className="px-3 py-1.5"><Input value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} className="h-8 rounded-lg text-xs" /></td>
                        <td className="px-3 py-1.5"><Input type="number" min={0} max={100} step={0.01} value={editForm.rate} onChange={e => setEditForm(p => ({ ...p, rate: e.target.value }))} className="h-8 w-20 rounded-lg text-xs text-right ml-auto" /></td>
                        <td className="px-3 py-1.5">
                          <select value={editForm.tax_type} onChange={e => setEditForm(p => ({ ...p, tax_type: e.target.value }))} className="h-8 w-full rounded-lg border border-border bg-card px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40">
                            {TAX_TYPES.map(ty => <option key={ty} value={ty}>{ty}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-1.5" />
                        <td className="px-3 py-1.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button type="button" onClick={() => handleUpdate(t.id)} disabled={updateMutation.isPending} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                              {updateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                            </button>
                            <button type="button" onClick={cancelEdit} className="flex items-center rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted">
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{t.code}</td>
                        <td className="px-4 py-2.5 text-sm font-medium text-foreground">{t.name}</td>
                        <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{t.rate.toFixed(2)}%</td>
                        <td className="px-4 py-2.5">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${TYPE_COLOR[t.tax_type] ?? "bg-muted text-muted-foreground"}`}>{t.tax_type}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${t.is_active ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                            {t.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button type="button" onClick={() => startEdit(t)} className="flex items-center gap-1 text-xs text-primary hover:underline">
                              <Pencil className="h-3 w-3" /> Edit
                            </button>
                            <button type="button" onClick={() => handleToggleActive(t)} title={t.is_active ? "Deactivate" : "Activate"} className="text-muted-foreground hover:text-foreground">
                              {t.is_active ? <ToggleRight className="h-4 w-4 text-emerald-600" /> : <ToggleLeft className="h-4 w-4" />}
                            </button>
                            {deletingId === t.id ? (
                              <div className="flex items-center gap-1">
                                <button type="button" onClick={() => handleDelete(t.id)} disabled={deleteMutation.isPending} className="text-xs text-rose-600 font-semibold hover:underline disabled:opacity-50">
                                  {deleteMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin inline" /> : "Confirm"}
                                </button>
                                <button type="button" onClick={() => setDeletingId(null)} className="text-xs text-muted-foreground hover:text-foreground">
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ) : (
                              <button type="button" onClick={() => setDeletingId(t.id)} className="text-rose-500 hover:text-rose-600">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
