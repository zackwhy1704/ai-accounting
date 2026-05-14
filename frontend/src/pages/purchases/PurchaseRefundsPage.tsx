import { useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { ViewDetailSheet } from "../../components/ui/view-detail-sheet"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, Search, RotateCcw, FileText, Download, XCircle, Pencil, CheckCircle, Trash2 } from "lucide-react"
import api from "../../lib/api"
import { useContacts } from "../../lib/hooks"
import { formatCurrency, formatDate, cn } from "../../lib/utils"
import { useToast } from "../../components/ui/toast"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"
import { Badge } from "../../components/ui/badge"
import { RowActionsMenu } from "../../components/ui/row-actions"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table"

interface PurchaseRefund {
  id: string
  refund_no: string
  refund_date: string
  contact_id: string | null
  bill_id: string | null
  amount: number
  currency: string
  payment_method: string
  reference_no: string | null
  notes: string | null
  status: string
}

const statusColors: Record<string, string> = {
  draft: "bg-slate-500/10 text-slate-700 border-slate-400/20",
  completed: "bg-emerald-500/10 text-emerald-700 border-emerald-400/20",
  pending: "bg-amber-500/10 text-amber-700 border-amber-400/20",
  void: "bg-rose-500/10 text-rose-700 border-rose-400/20",
}

const methodLabel: Record<string, string> = {
  bank_transfer: "Bank Transfer",
  cash: "Cash",
  cheque: "Cheque",
  online_payment: "Online",
  fpx: "FPX",
  card: "Card",
}

const STATUS_TABS = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Pending", value: "pending" },
  { label: "Completed", value: "completed" },
  { label: "Void", value: "void" },
]

export default function PurchaseRefundsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [tab, setTab] = useState("all")
  const [search, setSearch] = useState("")
  const [contactFilter, setContactFilter] = useState("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [viewItem, setViewItem] = useState<PurchaseRefund | null>(null)

  const { data: refunds = [], isLoading } = useQuery<PurchaseRefund[]>({
    queryKey: ["purchase-refunds"],
    queryFn: async () => {
      const res = await api.get("/purchase-refunds")
      return res.data
    },
  })
  const { data: contacts = [] } = useContacts()

  const vendors = useMemo(() => contacts.filter((c: any) => c.type === "supplier" || c.type === "vendor" || c.type === "both"), [contacts])

  const contactMap = useMemo(() => {
    const m = new Map<string, string>()
    contacts.forEach(c => m.set(c.id, c.name))
    return m
  }, [contacts])

  const rows = useMemo(() => {
    let filtered = refunds
    if (tab !== "all") filtered = filtered.filter(r => r.status === tab)
    if (search.trim()) {
      const q = search.toLowerCase()
      filtered = filtered.filter(r =>
        r.refund_no.toLowerCase().includes(q) ||
        (r.contact_id ? (contactMap.get(r.contact_id) ?? "").toLowerCase().includes(q) : false)
      )
    }
    if (contactFilter !== "all") filtered = filtered.filter(r => r.contact_id === contactFilter)
    if (dateFrom) filtered = filtered.filter(r => (r.refund_date || "") >= dateFrom)
    if (dateTo) filtered = filtered.filter(r => (r.refund_date || "") <= dateTo)
    return filtered
  }, [refunds, tab, search, contactMap, contactFilter, dateFrom, dateTo])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Purchases</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Purchase Refunds</div>
          <div className="mt-1 max-w-2xl text-sm text-muted-foreground">Track refunds received from your suppliers</div>
        </div>
        <Button
          type="button"
          onClick={() => navigate("/purchases/refunds/new")}
          className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white shadow-[0_0_0_1px_rgba(124,157,255,0.25),0_16px_40px_rgba(0,0,0,0.35)] hover:opacity-95"
        >
          <Plus className="mr-2 h-4 w-4" /> New Refund
        </Button>
      </div>

      <Card className="rounded-2xl border-border bg-card p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <Tabs value={tab} onValueChange={setTab}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <TabsList className="h-auto flex-wrap justify-start gap-1 rounded-xl bg-muted p-1">
              {STATUS_TABS.map(st => (
                <TabsTrigger key={st.value} value={st.value} className="rounded-lg px-3 py-1.5 text-xs">{st.label}</TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <div className="text-xs font-medium text-muted-foreground">Date Range</div>
              <div className="mt-2 flex items-center gap-2">
                <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-10 rounded-xl text-sm" />
                <span className="text-xs text-muted-foreground">to</span>
                <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-10 rounded-xl text-sm" />
              </div>
            </div>
            <div className="lg:col-span-4">
              <div className="text-xs font-medium text-muted-foreground">Search</div>
              <div className="mt-2 relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by number or supplier..." className="h-10 rounded-xl pl-9 text-sm" />
              </div>
            </div>
            <div className="lg:col-span-4">
              <div className="text-xs font-medium text-muted-foreground">Supplier</div>
              <Select value={contactFilter} onValueChange={setContactFilter}>
                <SelectTrigger className="mt-2 h-10 rounded-xl"><SelectValue placeholder="All Suppliers" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Suppliers</SelectItem>
                  {vendors.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4">
            {isLoading ? (
              <div className="py-10 text-center text-sm text-muted-foreground">Loading...</div>
            ) : rows.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted shadow-[0_0_0_1px_rgba(15,23,42,0.08)]"><RotateCcw className="h-6 w-6 text-muted-foreground" /></div>
                <div className="mt-4 text-base font-semibold text-foreground">No purchase refunds</div>
                <div className="mt-1 text-sm text-muted-foreground">Record refunds received from your suppliers</div>
                <Button type="button" onClick={() => navigate("/purchases/refunds/new")} className="mt-6 h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white"><Plus className="mr-2 h-4 w-4" /> New Refund</Button>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="w-[120px] text-muted-foreground">No.</TableHead>
                      <TableHead className="w-[130px] text-muted-foreground">Date</TableHead>
                      <TableHead className="text-muted-foreground">Supplier</TableHead>
                      <TableHead className="w-[150px] text-right text-muted-foreground">Amount</TableHead>
                      <TableHead className="w-[130px] text-muted-foreground">Method</TableHead>
                      <TableHead className="w-[120px] text-muted-foreground">Status</TableHead>
                      <TableHead className="w-[60px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map(r => (
                      <TableRow key={r.id} className="border-border hover:bg-muted/50">
                        <TableCell className="font-medium text-foreground">{r.refund_no}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(r.refund_date)}</TableCell>
                        <TableCell className="text-foreground">{r.contact_id ? (contactMap.get(r.contact_id) ?? "—") : "—"}</TableCell>
                        <TableCell className="text-right text-foreground">{formatCurrency(r.amount, r.currency)}</TableCell>
                        <TableCell className="text-muted-foreground">{methodLabel[r.payment_method] ?? r.payment_method}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("rounded-lg px-2 py-0.5 text-[11px] font-semibold", statusColors[r.status] ?? "")}>
                            {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <RowActionsMenu actions={[
                            { label: "View", icon: <FileText className="h-3.5 w-3.5" />, onClick: () => setViewItem(r) },
                            { label: "Edit", icon: <Pencil className="h-3.5 w-3.5" />, onClick: () => navigate(`/purchases/refunds/${r.id}/edit`), disabled: r.status === "void" },
                            { label: "Mark as Completed", icon: <CheckCircle className="h-3.5 w-3.5" />, onClick: () => api.patch(`/purchase-refunds/${r.id}/status`, null, { params: { status: "completed" } }).then(() => { queryClient.invalidateQueries({ queryKey: ["purchase-refunds"] }); toast("Refund marked as completed", "success") }).catch((e: any) => toast(e?.response?.data?.detail ?? "Failed to mark as completed", "warning")), dividerBefore: true, disabled: r.status !== "draft" && r.status !== "pending" },
                            { label: "Download Receipt", icon: <Download className="h-3.5 w-3.5" />, onClick: () => window.print() },
                            { label: "Void", icon: <XCircle className="h-3.5 w-3.5" />, onClick: () => { if (confirm("Void this refund? This reverses the GL entries and cannot be undone.")) api.patch(`/purchase-refunds/${r.id}/status`, null, { params: { status: "void" } }).then(() => { queryClient.invalidateQueries({ queryKey: ["purchase-refunds"] }); toast("Refund voided", "success") }).catch((e: any) => toast(e?.response?.data?.detail ?? "Failed to void refund", "warning")) }, danger: true, dividerBefore: true, disabled: r.status === "void" },
                            { label: "Delete", icon: <Trash2 className="h-3.5 w-3.5" />, onClick: () => { if (r.status !== "void" && r.status !== "draft") { alert("Please void this refund first before deleting."); return } if (confirm(`Delete refund ${r.refund_no}? This cannot be undone.`)) api.delete(`/purchase-refunds/${r.id}`).then(() => { queryClient.invalidateQueries({ queryKey: ["purchase-refunds"] }); toast("Refund deleted", "success") }).catch((e: any) => toast(e?.response?.data?.detail ?? "Failed to delete refund", "warning")) }, danger: true, disabled: r.status !== "void" && r.status !== "draft" },
                          ]} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </Tabs>
      </Card>

      <ViewDetailSheet
        open={!!viewItem}
        onOpenChange={(open) => { if (!open) setViewItem(null) }}
        title={viewItem ? `Refund ${viewItem.refund_no}` : ""}
        subtitle={viewItem?.status ? viewItem.status.charAt(0).toUpperCase() + viewItem.status.slice(1) : undefined}
        fields={viewItem ? [
          { label: "Refund Number", value: viewItem.refund_no },
          { label: "Status", value: <Badge variant="outline" className={cn("rounded-lg px-2 py-0.5 text-[11px] font-semibold", statusColors[viewItem.status] ?? "")}>{viewItem.status.charAt(0).toUpperCase() + viewItem.status.slice(1)}</Badge> },
          { label: "Supplier", value: viewItem.contact_id ? (contactMap.get(viewItem.contact_id) ?? "—") : "—" },
          { label: "Date", value: formatDate(viewItem.refund_date) },
          { label: "Amount", value: formatCurrency(viewItem.amount, viewItem.currency) },
          { label: "Method", value: methodLabel[viewItem.payment_method] ?? viewItem.payment_method },
          ...(viewItem.reference_no ? [{ label: "Reference", value: viewItem.reference_no }] : []),
          ...(viewItem.notes ? [{ label: "Notes", value: viewItem.notes }] : []),
        ] : []}
      />
    </div>
  )
}
