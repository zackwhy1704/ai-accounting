import { useState } from "react"
import { Loader2, Plus, Trash2, X, Check, Ban, ArrowRightCircle, Send, ClipboardList } from "lucide-react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { useToast } from "../../components/ui/toast"
import { formatCurrency, formatDate } from "../../lib/utils"
import { useContacts } from "../../lib/hooks"
import api from "../../lib/api"

interface ReqLine { description: string; quantity: number; est_unit_price?: number }
interface Requisition {
  id: string
  requisition_number: string
  status: string
  request_date: string | null
  needed_by: string | null
  rejection_reason: string | null
  notes: string | null
  lines: ReqLine[]
  purchase_order_id: string | null
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  submitted: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-rose-100 text-rose-700",
  converted: "bg-sky-100 text-sky-700",
}

export default function PurchaseRequisitionsPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const qc = useQueryClient()
  const { data: contacts = [] } = useContacts()
  const [showForm, setShowForm] = useState(false)
  const [notes, setNotes] = useState("")
  const [neededBy, setNeededBy] = useState("")
  const [lines, setLines] = useState<Array<{ description: string; quantity: string; est_unit_price: string }>>([
    { description: "", quantity: "", est_unit_price: "" },
  ])
  const [convertingId, setConvertingId] = useState<string | null>(null)
  const [vendorId, setVendorId] = useState("")

  const { data: page, isLoading } = useQuery<{ items: Requisition[] }>({
    queryKey: ["purchase-requisitions"],
    queryFn: () => api.get("/purchase-requisitions", { params: { limit: 100 } }).then(r => r.data),
  })
  const reqs = page?.items ?? []
  const invalidate = () => qc.invalidateQueries({ queryKey: ["purchase-requisitions"] })

  const create = useMutation({
    mutationFn: () => api.post("/purchase-requisitions", {
      notes: notes || null,
      needed_by: neededBy ? new Date(neededBy).toISOString() : null,
      lines: lines
        .filter(l => l.description.trim())
        .map(l => ({ description: l.description.trim(), quantity: parseFloat(l.quantity) || 0, est_unit_price: parseFloat(l.est_unit_price) || 0 })),
    }).then(r => r.data),
    onSuccess: () => {
      invalidate()
      setShowForm(false)
      setNotes("")
      setLines([{ description: "", quantity: "", est_unit_price: "" }])
      toast("Requisition created", "success")
    },
    onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to create requisition", "warning"),
  })

  const action = (verb: string, successMsg: string) => useMutation({
    mutationFn: ({ id, body }: { id: string; body?: Record<string, unknown> }) =>
      api.post(`/purchase-requisitions/${id}/${verb}`, body ?? {}).then(r => r.data),
    onSuccess: (d: any) => {
      invalidate()
      if (verb === "convert") {
        qc.invalidateQueries({ queryKey: ["purchase-orders"] })
        toast(`Converted to PO ${d.po_number}`, "success")
        navigate("/purchases/orders")
      } else {
        toast(successMsg, "success")
      }
    },
    onError: (e: any) => toast(e?.response?.data?.detail ?? "Action failed", "warning"),
  })

  const submit = action("submit", "Requisition submitted for approval")
  const approve = action("approve", "Requisition approved")
  const reject = action("reject", "Requisition rejected")
  const convert = action("convert", "Converted")

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/purchase-requisitions/${id}`),
    onSuccess: () => { invalidate(); toast("Requisition deleted", "success") },
    onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to delete", "warning"),
  })

  const estTotal = (r: Requisition) =>
    r.lines.reduce((s, l) => s + (l.quantity || 0) * (l.est_unit_price || 0), 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Purchases</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Purchase Requisitions</div>
          <div className="mt-1 text-sm text-muted-foreground">Internal purchase requests — approve, then convert into a Purchase Order</div>
        </div>
        <Button
          type="button"
          onClick={() => setShowForm(v => !v)}
          className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white"
        >
          {showForm ? <X className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
          {showForm ? "Close" : "New Requisition"}
        </Button>
      </div>

      {showForm && (
        <Card className="rounded-2xl border-border bg-card p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Notes / justification</label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Why is this purchase needed?" className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Needed by</label>
              <Input type="date" value={neededBy} onChange={e => setNeededBy(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <Input value={l.description} onChange={e => setLines(p => p.map((x, idx) => idx === i ? { ...x, description: e.target.value } : x))} placeholder="Item description" className="col-span-6 h-9 text-sm" />
                <Input type="number" value={l.quantity} onChange={e => setLines(p => p.map((x, idx) => idx === i ? { ...x, quantity: e.target.value } : x))} placeholder="Qty" className="col-span-2 h-9 text-sm text-right" />
                <Input type="number" value={l.est_unit_price} onChange={e => setLines(p => p.map((x, idx) => idx === i ? { ...x, est_unit_price: e.target.value } : x))} placeholder="Est. price" className="col-span-3 h-9 text-sm text-right" />
                <Button type="button" variant="ghost" size="icon" className="col-span-1 h-8 w-8 text-rose-500" onClick={() => setLines(p => p.filter((_, idx) => idx !== i))} disabled={lines.length <= 1}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <div className="flex justify-between">
              <Button type="button" variant="outline" size="sm" onClick={() => setLines(p => [...p, { description: "", quantity: "", est_unit_price: "" }])}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Line
              </Button>
              <Button
                type="button"
                onClick={() => create.mutate()}
                disabled={create.isPending || !lines.some(l => l.description.trim() && parseFloat(l.quantity) > 0)}
                className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white"
              >
                {create.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-2 h-3.5 w-3.5" />}
                Create Requisition
              </Button>
            </div>
          </div>
        </Card>
      )}

      {convertingId && (
        <Card className="rounded-2xl border-border bg-card p-4 shadow-sm">
          <div className="flex items-end gap-3">
            <div className="space-y-1.5 flex-1 max-w-md">
              <label className="text-xs font-medium text-muted-foreground">Choose the vendor for the Purchase Order</label>
              <select value={vendorId} onChange={e => setVendorId(e.target.value)} className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm">
                <option value="">Select vendor…</option>
                {contacts.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <Button
              type="button"
              disabled={!vendorId || convert.isPending}
              onClick={() => convert.mutate({ id: convertingId, body: { contact_id: vendorId } })}
              className="h-9 bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] text-white"
            >
              {convert.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <ArrowRightCircle className="mr-2 h-3.5 w-3.5" />}
              Convert to PO
            </Button>
            <Button type="button" variant="outline" className="h-9" onClick={() => setConvertingId(null)}>Cancel</Button>
          </div>
        </Card>
      )}

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…
        </div>
      ) : reqs.length === 0 ? (
        <Card className="rounded-2xl border-border bg-card p-12 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <ClipboardList className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="text-sm font-semibold text-foreground">No requisitions yet</div>
          <div className="mt-1 text-xs text-muted-foreground">Team members raise requests here; admins approve and convert them to POs</div>
        </Card>
      ) : (
        <Card className="rounded-2xl border-border bg-card shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Number</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Requested</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Items</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Est. Total</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {reqs.map(r => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5 text-sm font-medium text-foreground">{r.requisition_number}</td>
                  <td className="px-4 py-2.5 text-sm text-muted-foreground">{r.request_date ? formatDate(r.request_date) : "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-[280px] truncate">
                    {r.lines.map(l => `${l.quantity}× ${l.description}`).join(", ")}
                  </td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{formatCurrency(estTotal(r))}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_COLORS[r.status] ?? "bg-slate-100 text-slate-600"}`}>{r.status}</span>
                    {r.rejection_reason && <div className="mt-0.5 text-[10px] text-rose-600">{r.rejection_reason}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="inline-flex items-center gap-1">
                      {r.status === "draft" && (
                        <>
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Submit for approval" onClick={() => submit.mutate({ id: r.id })}>
                            <Send className="h-3.5 w-3.5" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-rose-500" onClick={() => { if (confirm("Delete this requisition?")) remove.mutate(r.id) }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      {r.status === "submitted" && (
                        <>
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-emerald-600" title="Approve" onClick={() => approve.mutate({ id: r.id })}>
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button" variant="ghost" size="icon" className="h-7 w-7 text-rose-500" title="Reject"
                            onClick={() => { const reason = prompt("Rejection reason (optional):"); reject.mutate({ id: r.id, body: { reason: reason ?? "" } }) }}
                          >
                            <Ban className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      {r.status === "approved" && (
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-[#4D63FF]" title="Convert to PO" onClick={() => { setConvertingId(r.id); setVendorId("") }}>
                          <ArrowRightCircle className="h-3.5 w-3.5" />
                        </Button>
                      )}
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
