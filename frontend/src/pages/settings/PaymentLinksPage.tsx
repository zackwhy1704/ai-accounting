import { useState } from "react"
import { Copy, Link, Plus, Trash2, Pencil, ToggleLeft, ToggleRight, Loader2, X, Check } from "lucide-react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Badge } from "../../components/ui/badge"
import { useToast } from "../../components/ui/toast"
import { formatCurrency, formatDate } from "../../lib/utils"
import api from "../../lib/api"

interface PaymentLink {
  id: string
  token: string
  amount: number
  currency: string
  description: string | null
  is_active: boolean
  expires_at: string | null
  paid_amount: number | null
  created_at: string
}

interface NewLinkForm {
  amount: string
  currency: string
  description: string
  expires_in_days: string
}

const EMPTY_FORM: NewLinkForm = { amount: "", currency: "MYR", description: "", expires_in_days: "30" }

export default function PaymentLinksPage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<NewLinkForm>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDesc, setEditDesc] = useState("")

  const { data, isLoading } = useQuery<{ items: PaymentLink[] }>({
    queryKey: ["payment-links"],
    queryFn: () => api.get("/payment-links").then(r => r.data),
  })
  const links = data?.items ?? []

  const createMutation = useMutation({
    mutationFn: (body: object) => api.post("/payment-links", body).then(r => r.data),
    onSuccess: (created: PaymentLink) => {
      qc.invalidateQueries({ queryKey: ["payment-links"] })
      setShowForm(false)
      setForm(EMPTY_FORM)
      toast("Payment link created", "success")
      copyToClipboard(created.token)
    },
    onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to create payment link", "warning"),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: { id: string } & object) => api.patch(`/payment-links/${id}`, body).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payment-links"] })
      setEditingId(null)
      toast("Payment link updated", "success")
    },
    onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to update payment link", "warning"),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/payment-links/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payment-links"] })
      toast("Payment link deleted", "success")
    },
    onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to delete payment link", "warning"),
  })

  const copyToClipboard = (token: string) => {
    const url = `${window.location.origin}/pay/${token}`
    navigator.clipboard.writeText(url).then(() => toast("Link copied to clipboard", "success"))
  }

  const handleCreate = () => {
    const amount = parseFloat(form.amount)
    if (!amount || amount <= 0) { toast("Enter a valid amount", "warning"); return }
    createMutation.mutate({
      amount,
      currency: form.currency,
      description: form.description || null,
      expires_in_days: form.expires_in_days ? parseInt(form.expires_in_days) : null,
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Settings</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Payment Links</div>
          <div className="mt-1 text-sm text-muted-foreground">Generate shareable links for collecting payments</div>
        </div>
        <Button
          type="button"
          onClick={() => setShowForm(true)}
          className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white"
        >
          <Plus className="mr-1.5 h-4 w-4" /> New Payment Link
        </Button>
      </div>

      {showForm && (
        <Card className="rounded-2xl border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-foreground">Create Payment Link</p>
            <button type="button" onClick={() => { setShowForm(false); setForm(EMPTY_FORM) }} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Amount *</label>
              <Input type="number" placeholder="0.00" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Currency</label>
              <select value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value }))} className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40">
                {["MYR", "SGD", "USD", "EUR", "GBP", "AUD"].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1.5 col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <Input placeholder="What is this payment for?" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Expires in (days)</label>
              <Input type="number" placeholder="30" value={form.expires_in_days} onChange={e => setForm(p => ({ ...p, expires_in_days: e.target.value }))} className="h-9 text-sm" />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => { setShowForm(false); setForm(EMPTY_FORM) }}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending} className="bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] text-white">
              {createMutation.isPending ? <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Creating…</> : "Create & Copy Link"}
            </Button>
          </div>
        </Card>
      )}

      <Card className="rounded-2xl border-border bg-card shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)] overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…</div>
        ) : links.length === 0 ? (
          <div className="py-12 text-center">
            <Link className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <div className="text-sm font-semibold text-foreground">No payment links yet</div>
            <div className="mt-1 text-xs text-muted-foreground">Create a link to start collecting payments</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Description</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Amount</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Expires</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Paid</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {links.map(link => (
                <tr key={link.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5">
                    {editingId === link.id ? (
                      <div className="flex items-center gap-2">
                        <Input value={editDesc} onChange={e => setEditDesc(e.target.value)} className="h-7 text-xs" autoFocus />
                        <button type="button" onClick={() => updateMutation.mutate({ id: link.id, description: editDesc })} className="text-emerald-600 hover:text-emerald-700"><Check className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    ) : (
                      <span className="font-medium text-foreground">{link.description ?? <span className="text-muted-foreground">—</span>}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-foreground">{formatCurrency(link.amount, link.currency)}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant="outline" className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold ${link.is_active ? "bg-emerald-500/10 text-emerald-700 border-emerald-400/20" : "bg-slate-500/10 text-slate-600 border-slate-300/20"}`}>
                      {link.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-sm text-muted-foreground">{link.expires_at ? formatDate(link.expires_at) : "Never"}</td>
                  <td className="px-4 py-2.5 tabular-nums text-foreground">{link.paid_amount ? formatCurrency(link.paid_amount, link.currency) : "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button type="button" onClick={() => copyToClipboard(link.token)} className="text-xs text-primary hover:underline flex items-center gap-1">
                        <Copy className="h-3 w-3" /> Copy
                      </button>
                      <button type="button" onClick={() => { setEditingId(link.id); setEditDesc(link.description ?? "") }} className="text-xs text-primary hover:underline flex items-center gap-1">
                        <Pencil className="h-3 w-3" /> Edit
                      </button>
                      <button type="button" onClick={() => updateMutation.mutate({ id: link.id, is_active: !link.is_active })} className="text-xs text-muted-foreground hover:text-foreground">
                        {link.is_active ? <ToggleRight className="h-4 w-4 text-emerald-600" /> : <ToggleLeft className="h-4 w-4" />}
                      </button>
                      <button type="button" onClick={() => { if (confirm("Delete this payment link? It will no longer be accessible.")) deleteMutation.mutate(link.id) }} className="text-xs text-rose-500 hover:text-rose-600">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
