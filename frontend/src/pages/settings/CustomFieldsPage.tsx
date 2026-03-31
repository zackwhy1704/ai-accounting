import { useState } from "react"
import { Plus, Trash2, GripVertical, Loader2 } from "lucide-react"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"
import { useToast } from "../../components/ui/toast"
import { Badge } from "../../components/ui/badge"
import api from "../../lib/api"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

interface CustomField {
  id: string
  entity_type: string
  field_name: string
  field_label: string
  field_type: string
  is_required: boolean
  options: { choices?: string[] } | null
  default_value: string | null
  sort_order: number
  is_active: boolean
}

const ENTITY_TYPES = [
  { value: "invoice", label: "Invoice" },
  { value: "quotation", label: "Quotation" },
  { value: "bill", label: "Bill" },
  { value: "contact", label: "Contact" },
  { value: "product", label: "Product" },
]

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "select", label: "Dropdown" },
  { value: "checkbox", label: "Checkbox" },
]

const typeColors: Record<string, string> = {
  text: "bg-blue-100 text-blue-700",
  number: "bg-amber-100 text-amber-700",
  date: "bg-purple-100 text-purple-700",
  select: "bg-green-100 text-green-700",
  checkbox: "bg-slate-100 text-slate-700",
}

export default function CustomFieldsPage() {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [selectedEntity, setSelectedEntity] = useState("invoice")
  const [showAdd, setShowAdd] = useState(false)
  const [newField, setNewField] = useState({ field_name: "", field_label: "", field_type: "text", is_required: false, choices: "" })

  const { data: fields = [], isLoading } = useQuery<CustomField[]>({
    queryKey: ["custom-fields", selectedEntity],
    queryFn: () => api.get(`/custom-fields?entity_type=${selectedEntity}`).then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post("/custom-fields", data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom-fields"] })
      setShowAdd(false)
      setNewField({ field_name: "", field_label: "", field_type: "text", is_required: false, choices: "" })
      toast("Custom field added", "success")
    },
    onError: () => toast("Failed to add field (name may already exist)", "warning"),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/custom-fields/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["custom-fields"] }); toast("Field removed", "success") },
  })

  const handleAdd = () => {
    if (!newField.field_name || !newField.field_label) return
    const payload: Record<string, unknown> = {
      entity_type: selectedEntity,
      field_name: newField.field_name.toLowerCase().replace(/\s+/g, "_"),
      field_label: newField.field_label,
      field_type: newField.field_type,
      is_required: newField.is_required,
    }
    if (newField.field_type === "select" && newField.choices) {
      payload.options = { choices: newField.choices.split(",").map(s => s.trim()).filter(Boolean) }
    }
    createMutation.mutate(payload)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Settings</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Custom Fields</div>
          <div className="mt-1 text-sm text-muted-foreground">Add extra fields to your invoices, contacts, and other records</div>
        </div>
        <Button type="button" onClick={() => setShowAdd(v => !v)} className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white">
          <Plus className="mr-2 h-4 w-4" /> Add Field
        </Button>
      </div>

      {/* Entity type tabs */}
      <div className="flex gap-1 flex-wrap">
        {ENTITY_TYPES.map(et => (
          <button key={et.value} type="button"
            onClick={() => setSelectedEntity(et.value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${selectedEntity === et.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
            {et.label}
          </button>
        ))}
      </div>

      {/* Add form */}
      {showAdd && (
        <Card className="rounded-2xl border-border bg-card p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.06)]">
          <div className="text-sm font-semibold text-foreground mb-3">New Field for {ENTITY_TYPES.find(e => e.value === selectedEntity)?.label}</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Field Label (shown to user)</label>
              <Input className="h-8 text-xs" placeholder="e.g. Project Code" value={newField.field_label}
                onChange={e => setNewField(p => ({ ...p, field_label: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Field Name (internal key)</label>
              <Input className="h-8 text-xs" placeholder="e.g. project_code" value={newField.field_name}
                onChange={e => setNewField(p => ({ ...p, field_name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Field Type</label>
              <Select value={newField.field_type} onValueChange={v => setNewField(p => ({ ...p, field_type: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map(ft => <SelectItem key={ft.value} value={ft.value}>{ft.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {newField.field_type === "select" && (
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Choices (comma-separated)</label>
                <Input className="h-8 text-xs" placeholder="Option A, Option B, Option C" value={newField.choices}
                  onChange={e => setNewField(p => ({ ...p, choices: e.target.value }))} />
              </div>
            )}
          </div>
          <label className="flex items-center gap-2 mt-3 cursor-pointer">
            <input type="checkbox" checked={newField.is_required} onChange={e => setNewField(p => ({ ...p, is_required: e.target.checked }))} className="rounded" />
            <span className="text-xs text-foreground">Required field</span>
          </label>
          <div className="flex justify-end gap-2 mt-3">
            <Button type="button" variant="secondary" className="h-7 text-xs" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button type="button" className="h-7 text-xs bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] text-white"
              onClick={handleAdd} disabled={createMutation.isPending || !newField.field_name || !newField.field_label}>
              {createMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add Field"}
            </Button>
          </div>
        </Card>
      )}

      <Card className="rounded-2xl border-border bg-card p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline" /></div>
        ) : fields.length === 0 ? (
          <div className="py-8 text-center">
            <div className="text-sm font-semibold text-foreground">No custom fields for {ENTITY_TYPES.find(e => e.value === selectedEntity)?.label}</div>
            <div className="mt-1 text-xs text-muted-foreground">Add fields to capture additional information on your records</div>
          </div>
        ) : (
          <div className="space-y-2">
            {fields.map(f => (
              <div key={f.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 hover:bg-muted/30">
                <div className="flex items-center gap-3">
                  <GripVertical className="h-4 w-4 text-muted-foreground/40" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{f.field_label}</span>
                      <Badge variant="outline" className={`rounded px-1.5 py-0 text-[10px] font-semibold border-0 ${typeColors[f.field_type] ?? ""}`}>
                        {FIELD_TYPES.find(t => t.value === f.field_type)?.label}
                      </Badge>
                      {f.is_required && <Badge variant="outline" className="rounded px-1.5 py-0 text-[10px] font-semibold border-0 bg-rose-100 text-rose-700">Required</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">{f.field_name}
                      {f.options?.choices && ` · ${f.options.choices.join(", ")}`}
                    </div>
                  </div>
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-rose-500"
                  onClick={() => deleteMutation.mutate(f.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
