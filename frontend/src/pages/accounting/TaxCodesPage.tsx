import { useState, useRef } from "react"
import { Plus, Loader2, Pencil, Check, X, Trash2, Upload, ToggleLeft, ToggleRight } from "lucide-react"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { useToast } from "../../components/ui/toast"
import {
  useTaxRates,
  useCreateTaxRate,
  useUpdateTaxRate,
  useDeleteTaxRate,
} from "../../lib/hooks"

// ── Types ────────────────────────────────────────────────────────────────────

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
  const fileRef = useRef<HTMLInputElement>(null)

  const [showNewRow, setShowNewRow] = useState(false)
  const [newForm, setNewForm] = useState<FormState>(BLANK_FORM)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<FormState>(BLANK_FORM)

  const [deletingId, setDeletingId] = useState<string | null>(null)

  const { data: taxRates = [], isLoading } = useTaxRates()
  const createMutation = useCreateTaxRate()
  const updateMutation = useUpdateTaxRate()
  const deleteMutation = useDeleteTaxRate()

  // ── Helpers ─────────────────────────────────────────────────────────────────

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
        onSuccess: () => {
          toast("Tax code created", "success")
          setShowNewRow(false)
          setNewForm(BLANK_FORM)
        },
        onError: (e: any) => toast(e?.response?.data?.detail || "Failed to create tax code", "warning"),
      }
    )
  }

  function handleUpdate(id: string) {
    updateMutation.mutate(
      { id, name: editForm.name, code: editForm.code, rate: parseFloat(editForm.rate), tax_type: editForm.tax_type },
      {
        onSuccess: () => {
          toast("Tax code updated", "success")
          cancelEdit()
        },
        onError: (e: any) => toast(e?.response?.data?.detail || "Failed to update tax code", "warning"),
      }
    )
  }

  function handleToggleActive(t: TaxRate) {
    updateMutation.mutate(
      { id: t.id, is_active: !t.is_active },
      {
        onSuccess: () => toast(`Tax code ${t.is_active ? "deactivated" : "activated"}`, "success"),
        onError: (e: any) => toast(e?.response?.data?.detail || "Failed to update status", "warning"),
      }
    )
  }

  function handleDelete(id: string) {
    deleteMutation.mutate(id, {
      onSuccess: () => {
        toast("Tax code deleted", "success")
        setDeletingId(null)
      },
      onError: (e: any) => toast(e?.response?.data?.detail || "Failed to delete tax code", "warning"),
    })
  }

  function handleUploadClick() {
    fileRef.current?.click()
  }

  function handleFileChange() {
    toast("Upload feature coming soon", "info" as any)
    if (fileRef.current) fileRef.current.value = ""
  }

  // ── Render ───────────────────────────────────────────────────────────────────

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
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={handleUploadClick}
            className="h-9 rounded-xl px-3 text-xs font-semibold"
          >
            <Upload className="mr-1.5 h-4 w-4" /> Upload CSV
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
              {/* New row */}
              {showNewRow && (
                <tr className="border-b border-border bg-blue-50/40 dark:bg-blue-900/10">
                  <td className="px-3 py-1.5">
                    <Input
                      value={newForm.code}
                      onChange={e => setNewForm(p => ({ ...p, code: e.target.value }))}
                      placeholder="e.g. SST-6"
                      className="h-8 w-24 rounded-lg text-xs font-mono"
                      autoFocus
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <Input
                      value={newForm.name}
                      onChange={e => setNewForm(p => ({ ...p, name: e.target.value }))}
                      placeholder="Tax code name"
                      className="h-8 rounded-lg text-xs"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      value={newForm.rate}
                      onChange={e => setNewForm(p => ({ ...p, rate: e.target.value }))}
                      placeholder="6.00"
                      className="h-8 w-20 rounded-lg text-xs text-right ml-auto"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <select
                      value={newForm.tax_type}
                      onChange={e => setNewForm(p => ({ ...p, tax_type: e.target.value }))}
                      className="h-8 w-full rounded-lg border border-border bg-card px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
                    >
                      {TAX_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">—</td>
                  <td className="px-3 py-1.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={handleCreate}
                        disabled={!newForm.name || !newForm.code || newForm.rate === "" || createMutation.isPending}
                        className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {createMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowNewRow(false); setNewForm(BLANK_FORM) }}
                        className="flex items-center rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {/* Data rows */}
              {taxRates.length === 0 && !showNewRow ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <div className="text-sm font-semibold text-foreground">No tax codes yet</div>
                    <div className="mt-1 text-xs text-muted-foreground">Click "Add Tax Code" to create your first one</div>
                  </td>
                </tr>
              ) : (
                taxRates.map(t => (
                  <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    {editingId === t.id ? (
                      <>
                        <td className="px-3 py-1.5">
                          <Input
                            value={editForm.code}
                            onChange={e => setEditForm(p => ({ ...p, code: e.target.value }))}
                            className="h-8 w-24 rounded-lg text-xs font-mono"
                            autoFocus
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <Input
                            value={editForm.name}
                            onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                            className="h-8 rounded-lg text-xs"
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step={0.01}
                            value={editForm.rate}
                            onChange={e => setEditForm(p => ({ ...p, rate: e.target.value }))}
                            className="h-8 w-20 rounded-lg text-xs text-right ml-auto"
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <select
                            value={editForm.tax_type}
                            onChange={e => setEditForm(p => ({ ...p, tax_type: e.target.value }))}
                            className="h-8 w-full rounded-lg border border-border bg-card px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
                          >
                            {TAX_TYPES.map(ty => <option key={ty} value={ty}>{ty}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-1.5" />
                        <td className="px-3 py-1.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleUpdate(t.id)}
                              disabled={updateMutation.isPending}
                              className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                              {updateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="flex items-center rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{t.code}</td>
                        <td className="px-4 py-2.5 text-sm font-medium text-foreground">{t.name}</td>
                        <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">
                          {t.rate.toFixed(2)}%
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${TYPE_COLOR[t.tax_type] ?? "bg-muted text-muted-foreground"}`}>
                            {t.tax_type}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${t.is_active ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                            {t.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(t)}
                              className="flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              <Pencil className="h-3 w-3" /> Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleActive(t)}
                              title={t.is_active ? "Deactivate" : "Activate"}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              {t.is_active
                                ? <ToggleRight className="h-4 w-4 text-emerald-600" />
                                : <ToggleLeft className="h-4 w-4" />}
                            </button>
                            {deletingId === t.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleDelete(t.id)}
                                  disabled={deleteMutation.isPending}
                                  className="text-xs text-rose-600 font-semibold hover:underline disabled:opacity-50"
                                >
                                  {deleteMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin inline" /> : "Confirm"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeletingId(null)}
                                  className="text-xs text-muted-foreground hover:text-foreground"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setDeletingId(t.id)}
                                className="text-rose-500 hover:text-rose-600"
                              >
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
