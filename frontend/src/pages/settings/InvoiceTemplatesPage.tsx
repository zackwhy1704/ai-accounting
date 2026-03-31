import { useState } from "react"
import { Plus, Check, Palette, Eye, Trash2, Loader2 } from "lucide-react"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { useToast } from "../../components/ui/toast"
import api from "../../lib/api"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

interface InvoiceTemplate {
  id: string
  name: string
  is_default: boolean
  layout: string
  primary_color: string
  secondary_color: string
  show_logo: boolean
  show_payment_terms: boolean
  show_notes: boolean
  show_bank_details: boolean
  show_tax_breakdown: boolean
  show_signature: boolean
  header_text: string | null
  footer_text: string | null
  terms_text: string | null
  bank_details_text: string | null
}

const LAYOUTS = [
  { value: "classic", label: "Classic", desc: "Traditional professional layout" },
  { value: "modern", label: "Modern", desc: "Clean minimalist design" },
  { value: "minimal", label: "Minimal", desc: "Simple black & white" },
  { value: "branded", label: "Branded", desc: "Full color brand-forward" },
]

const PRESET_COLORS = ["#4D63FF", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#0EA5E9", "#1F2937"]

function TemplatePreview({ template }: { template: Partial<InvoiceTemplate> }) {
  return (
    <div className="rounded-lg border border-border bg-white overflow-hidden text-[8px]" style={{ aspectRatio: "0.707" }}>
      <div className="p-2" style={{ backgroundColor: template.primary_color ?? "#4D63FF" }}>
        <div className="text-white font-bold">INVOICE</div>
        <div className="text-white/70">INV-0001</div>
      </div>
      <div className="p-2 space-y-1">
        <div className="flex justify-between">
          <div>
            <div className="font-semibold text-gray-800">Your Company</div>
            <div className="text-gray-500">customer@example.com</div>
          </div>
          <div className="text-right text-gray-500">
            <div>Date: 2026-01-01</div>
            <div>Due: 2026-01-31</div>
          </div>
        </div>
        <div className="border-t border-gray-200 pt-1">
          <div className="flex justify-between text-gray-600">
            <span>Service A</span><span>100.00</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Service B</span><span>50.00</span>
          </div>
        </div>
        {template.show_tax_breakdown && (
          <div className="flex justify-between text-gray-500 border-t border-gray-100 pt-1">
            <span>Tax (6%)</span><span>9.00</span>
          </div>
        )}
        <div className="flex justify-between font-bold" style={{ color: template.primary_color }}>
          <span>Total</span><span>159.00</span>
        </div>
        {template.footer_text && (
          <div className="text-gray-400 border-t border-gray-100 pt-1">{template.footer_text}</div>
        )}
      </div>
    </div>
  )
}

export default function InvoiceTemplatesPage() {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Partial<InvoiceTemplate> | null>(null)
  const [showNew, setShowNew] = useState(false)

  const { data: templates = [], isLoading } = useQuery<InvoiceTemplate[]>({
    queryKey: ["invoice-templates"],
    queryFn: () => api.get("/invoice-templates").then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (data: Partial<InvoiceTemplate>) => api.post("/invoice-templates", data).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["invoice-templates"] }); setShowNew(false); toast("Template created", "success") },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: Partial<InvoiceTemplate> & { id: string }) =>
      api.patch(`/invoice-templates/${id}`, data).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["invoice-templates"] }); setEditing(null); toast("Template saved", "success") },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/invoice-templates/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["invoice-templates"] }); toast("Template deleted", "success") },
  })

  const newTemplate: Partial<InvoiceTemplate> = {
    name: "", layout: "classic", primary_color: "#4D63FF", secondary_color: "#F8FAFF",
    show_logo: true, show_payment_terms: true, show_notes: true,
    show_bank_details: true, show_tax_breakdown: true, show_signature: false,
  }

  const current = editing ?? (showNew ? newTemplate : null)

  const handleSave = () => {
    if (!current?.name) return
    if (showNew) {
      createMutation.mutate(current)
    } else if (editing?.id) {
      updateMutation.mutate({ id: editing.id, ...current })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Settings</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Invoice Templates</div>
          <div className="mt-1 text-sm text-muted-foreground">Customize how your invoices look when sent to customers</div>
        </div>
        <Button type="button" onClick={() => { setShowNew(true); setEditing(null) }} className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white">
          <Plus className="mr-2 h-4 w-4" /> New Template
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Template list */}
        <div className="lg:col-span-2 space-y-3">
          {isLoading && <div className="py-8 text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline" /></div>}
          {templates.length === 0 && !isLoading && (
            <Card className="rounded-2xl border-border bg-card p-8 text-center">
              <Palette className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
              <div className="text-sm font-semibold text-foreground">No templates yet</div>
              <div className="text-xs text-muted-foreground mt-1">Create your first template to customize invoice branding</div>
            </Card>
          )}
          {templates.map(t => (
            <Card key={t.id} className={`rounded-2xl border-border bg-card p-4 cursor-pointer transition-shadow hover:shadow-md ${editing?.id === t.id ? "ring-2 ring-primary" : ""}`}
              onClick={() => { setEditing({ ...t }); setShowNew(false) }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg" style={{ backgroundColor: t.primary_color }} />
                  <div>
                    <div className="text-sm font-semibold text-foreground">{t.name}</div>
                    <div className="text-xs text-muted-foreground capitalize">{t.layout} layout</div>
                  </div>
                  {t.is_default && <span className="ml-1 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-700">Default</span>}
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-rose-500"
                    onClick={e => { e.stopPropagation(); deleteMutation.mutate(t.id) }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Editor panel */}
        {current && (
          <Card className="rounded-2xl border-border bg-card p-5 shadow-lg lg:col-span-1 space-y-4">
            <div className="text-sm font-semibold text-foreground">{showNew ? "New Template" : "Edit Template"}</div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Template Name</label>
              <Input className="h-8 text-xs" value={current.name ?? ""} onChange={e => setEditing(prev => ({ ...(prev ?? current), name: e.target.value }))} placeholder="e.g. Standard Invoice" />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Layout</label>
              <div className="grid grid-cols-2 gap-1.5">
                {LAYOUTS.map(l => (
                  <button key={l.value} type="button"
                    onClick={() => setEditing(prev => ({ ...(prev ?? current), layout: l.value }))}
                    className={`rounded-lg border px-2 py-1.5 text-left text-xs transition-colors ${current.layout === l.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>
                    <div className="font-medium">{l.label}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Primary Color</label>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setEditing(prev => ({ ...(prev ?? current), primary_color: c }))}
                    className="h-6 w-6 rounded-md border-2 transition-transform hover:scale-110"
                    style={{ backgroundColor: c, borderColor: current.primary_color === c ? "white" : "transparent", outline: current.primary_color === c ? `2px solid ${c}` : "none" }} />
                ))}
                <input type="color" value={current.primary_color ?? "#4D63FF"}
                  onChange={e => setEditing(prev => ({ ...(prev ?? current), primary_color: e.target.value }))}
                  className="h-6 w-6 cursor-pointer rounded-md border-0 p-0" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Show / Hide Sections</label>
              {[
                { key: "show_payment_terms", label: "Payment Terms" },
                { key: "show_notes", label: "Notes" },
                { key: "show_bank_details", label: "Bank Details" },
                { key: "show_tax_breakdown", label: "Tax Breakdown" },
                { key: "show_signature", label: "Signature Line" },
              ].map(f => (
                <label key={f.key} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox"
                    checked={Boolean(current[f.key as keyof typeof current])}
                    onChange={e => setEditing(prev => ({ ...(prev ?? current), [f.key]: e.target.checked }))}
                    className="rounded" />
                  <span className="text-xs text-foreground">{f.label}</span>
                </label>
              ))}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Footer Text</label>
              <Input className="h-8 text-xs" value={current.footer_text ?? ""} onChange={e => setEditing(prev => ({ ...(prev ?? current), footer_text: e.target.value }))} placeholder="Thank you for your business!" />
            </div>

            {/* Live preview */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">Preview</label>
              <div className="w-32 mx-auto">
                <TemplatePreview template={current} />
              </div>
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="secondary" className="flex-1 h-8 text-xs" onClick={() => { setEditing(null); setShowNew(false) }}>Cancel</Button>
              <Button type="button" className="flex-1 h-8 text-xs bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] text-white"
                onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
                {createMutation.isPending || updateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
