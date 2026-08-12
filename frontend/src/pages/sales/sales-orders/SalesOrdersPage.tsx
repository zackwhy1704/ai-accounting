import { useEffect, useState } from "react"
import { Loader2, Plus, Trash2, X, ArrowRightCircle, Search, ShoppingBag } from "lucide-react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { Card } from "../../../components/ui/card"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { useToast } from "../../../components/ui/toast"
import { formatCurrency, formatDate } from "../../../lib/utils"
import { useContacts, useDebounce } from "../../../lib/hooks"
import { PaginationControls } from "../../../components/ui/pagination-controls"
import api from "../../../lib/api"

interface SalesOrder {
  id: string
  order_number: string
  contact_id: string
  status: string
  issue_date: string
  delivery_date: string | null
  subtotal: number
  tax_amount: number
  total: number
  currency: string
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  confirmed: "bg-sky-100 text-sky-700",
  fulfilled: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-rose-100 text-rose-700",
}

export default function SalesOrdersPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const qc = useQueryClient()
  const { data: contacts = [] } = useContacts()
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounce(search, 300)
  const [showForm, setShowForm] = useState(false)
  const [contactId, setContactId] = useState("")
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10))
  const [lines, setLines] = useState<Array<{ description: string; quantity: string; unit_price: string; tax_rate: string }>>([
    { description: "", quantity: "1", unit_price: "", tax_rate: "0" },
  ])

  useEffect(() => { setPage(1) }, [debouncedSearch])

  const contactById: Record<string, any> = {}
  contacts.forEach((c: any) => { contactById[c.id] = c })

  const { data: soPage, isLoading } = useQuery<{ items: SalesOrder[]; total: number; pages: number }>({
    queryKey: ["sales-orders", { search: debouncedSearch, page }],
    queryFn: () => api.get("/sales-orders", { params: { search: debouncedSearch || undefined, page, limit: 50 } }).then(r => r.data),
  })
  const orders = soPage?.items ?? []
  const invalidate = () => qc.invalidateQueries({ queryKey: ["sales-orders"] })

  const create = useMutation({
    mutationFn: () => api.post("/sales-orders", {
      contact_id: contactId,
      issue_date: new Date(issueDate).toISOString(),
      currency: "MYR",
      line_items: lines
        .filter(l => l.description.trim())
        .map(l => ({
          description: l.description.trim(),
          quantity: parseFloat(l.quantity) || 1,
          unit_price: parseFloat(l.unit_price) || 0,
          tax_rate: parseFloat(l.tax_rate) || 0,
        })),
    }).then(r => r.data),
    onSuccess: (d: any) => {
      invalidate()
      setShowForm(false)
      setLines([{ description: "", quantity: "1", unit_price: "", tax_rate: "0" }])
      toast(`Sales order ${d.order_number} created`, "success")
    },
    onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to create sales order", "warning"),
  })

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/sales-orders/${id}/status`, null, { params: { status } }).then(r => r.data),
    onSuccess: () => invalidate(),
    onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to update status", "warning"),
  })

  const convert = useMutation({
    mutationFn: (id: string) => api.post(`/sales-orders/${id}/convert`).then(r => r.data),
    onSuccess: (d: any) => {
      invalidate()
      qc.invalidateQueries({ queryKey: ["invoices"] })
      toast(`Invoice ${d.invoice_number} created`, "success")
      navigate("/sales/invoices")
    },
    onError: (e: any) => toast(e?.response?.data?.detail ?? "Conversion failed", "warning"),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/sales-orders/${id}`),
    onSuccess: () => { invalidate(); toast("Sales order deleted", "success") },
    onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to delete", "warning"),
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Sales</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Sales Orders</div>
          <div className="mt-1 text-sm text-muted-foreground">Confirmed orders between quotation and invoice</div>
        </div>
        <Button
          type="button"
          onClick={() => setShowForm(v => !v)}
          className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white"
        >
          {showForm ? <X className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
          {showForm ? "Close" : "New Sales Order"}
        </Button>
      </div>

      {showForm && (
        <Card className="rounded-2xl border-border bg-card p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Customer</label>
              <select value={contactId} onChange={e => setContactId(e.target.value)} className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm">
                <option value="">Select customer…</option>
                {contacts.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Order date</label>
              <Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <Input value={l.description} onChange={e => setLines(p => p.map((x, idx) => idx === i ? { ...x, description: e.target.value } : x))} placeholder="Description" className="col-span-6 h-9 text-sm" />
                <Input type="number" value={l.quantity} onChange={e => setLines(p => p.map((x, idx) => idx === i ? { ...x, quantity: e.target.value } : x))} placeholder="Qty" className="col-span-2 h-9 text-sm text-right" />
                <Input type="number" value={l.unit_price} onChange={e => setLines(p => p.map((x, idx) => idx === i ? { ...x, unit_price: e.target.value } : x))} placeholder="Unit price" className="col-span-2 h-9 text-sm text-right" />
                <Input type="number" value={l.tax_rate} onChange={e => setLines(p => p.map((x, idx) => idx === i ? { ...x, tax_rate: e.target.value } : x))} placeholder="Tax %" className="col-span-1 h-9 text-sm text-right" />
                <Button type="button" variant="ghost" size="icon" className="col-span-1 h-8 w-8 text-rose-500" onClick={() => setLines(p => p.filter((_, idx) => idx !== i))} disabled={lines.length <= 1}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <div className="flex justify-between">
              <Button type="button" variant="outline" size="sm" onClick={() => setLines(p => [...p, { description: "", quantity: "1", unit_price: "", tax_rate: "0" }])}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Line
              </Button>
              <Button
                type="button"
                onClick={() => create.mutate()}
                disabled={create.isPending || !contactId || !lines.some(l => l.description.trim())}
                className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white"
              >
                {create.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-2 h-3.5 w-3.5" />}
                Create Order
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card className="rounded-2xl border-border bg-card shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)] overflow-hidden">
        <div className="p-4">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search orders…" className="h-10 rounded-xl pl-9 text-sm" />
          </div>
        </div>
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline" /></div>
        ) : orders.length === 0 ? (
          <div className="py-12 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <ShoppingBag className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="text-sm font-semibold text-foreground">No sales orders</div>
            <div className="mt-1 text-xs text-muted-foreground">Confirm customer orders here, then convert to invoices when fulfilled</div>
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Number</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Customer</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Date</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Total</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(o => (
                  <tr key={o.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2.5 text-sm font-medium text-foreground">{o.order_number}</td>
                    <td className="px-4 py-2.5 text-sm text-muted-foreground">{contactById[o.contact_id]?.name ?? "—"}</td>
                    <td className="px-4 py-2.5 text-sm text-muted-foreground">{formatDate(o.issue_date)}</td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{formatCurrency(o.total, o.currency)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_COLORS[o.status] ?? "bg-slate-100 text-slate-600"}`}>{o.status}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        {o.status === "draft" && (
                          <Button type="button" variant="outline" className="h-7 rounded-lg px-2 text-xs" onClick={() => setStatus.mutate({ id: o.id, status: "confirmed" })}>
                            Confirm
                          </Button>
                        )}
                        {(o.status === "draft" || o.status === "confirmed") && (
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-[#4D63FF]" title="Convert to invoice" onClick={() => { if (confirm("Convert this order to a draft invoice?")) convert.mutate(o.id) }}>
                            <ArrowRightCircle className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {o.status !== "fulfilled" && o.status !== "cancelled" && (
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-amber-600" title="Cancel order" onClick={() => { if (confirm("Cancel this sales order?")) setStatus.mutate({ id: o.id, status: "cancelled" }) }}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {(o.status === "draft" || o.status === "cancelled") && (
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-rose-500" onClick={() => { if (confirm("Delete this sales order?")) remove.mutate(o.id) }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <PaginationControls page={page} pages={soPage?.pages ?? 1} total={soPage?.total ?? 0} limit={50} onPageChange={setPage} />
          </>
        )}
      </Card>
    </div>
  )
}
