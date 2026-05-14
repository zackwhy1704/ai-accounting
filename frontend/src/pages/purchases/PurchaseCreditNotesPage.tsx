import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { ViewDetailSheet } from "../../components/ui/view-detail-sheet"
import { Plus, Search, Tag, FileText, ArrowRightLeft, XCircle, Pencil, Trash2 } from "lucide-react"
import { useVendorCredits, useContacts, useDeleteVendorCredit } from "../../lib/hooks"
import api from "../../lib/api"
import { formatCurrency, formatDate, cn as cx } from "../../lib/utils"
import { useToast } from "../../components/ui/toast"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table"
import { Badge } from "../../components/ui/badge"
import { RowActionsMenu } from "../../components/ui/row-actions"

const statusColors: Record<string, string> = {
  draft: "bg-slate-500/10 text-slate-700 border-slate-400/20",
  open: "bg-blue-500/10 text-blue-700 border-blue-400/20",
  applied: "bg-emerald-500/10 text-emerald-700 border-emerald-400/20",
  void: "bg-rose-500/10 text-rose-700 border-rose-400/20",
}

const STATUS_TABS = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Open", value: "open" },
  { label: "Applied", value: "applied" },
  { label: "Void", value: "void" },
]

export default function PurchaseCreditNotesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const deleteVendorCredit = useDeleteVendorCredit()
  const [tab, setTab] = useState("all")
  const [search, setSearch] = useState("")
  const [contactFilter, setContactFilter] = useState("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const { data: creditNotes = [], isLoading } = useVendorCredits()
  const [viewItem, setViewItem] = useState<typeof creditNotes[0] | null>(null)
  const { data: contacts = [] } = useContacts()

  const vendors = useMemo(() => contacts.filter((c: any) => c.type === "supplier" || c.type === "vendor" || c.type === "both"), [contacts])

  const contactMap = useMemo(() => {
    const m = new Map<string, string>()
    contacts.forEach(c => m.set(c.id, c.name))
    return m
  }, [contacts])

  const rows = useMemo(() => {
    let filtered = creditNotes
    if (tab !== "all") filtered = filtered.filter((cn: any) => cn.status === tab)
    if (search.trim()) {
      const q = search.toLowerCase()
      filtered = filtered.filter((cn: any) =>
        cn.vendor_credit_number.toLowerCase().includes(q) ||
        (contactMap.get(cn.contact_id) ?? "").toLowerCase().includes(q)
      )
    }
    if (contactFilter !== "all") filtered = filtered.filter((cn: any) => cn.contact_id === contactFilter)
    if (dateFrom) filtered = filtered.filter((cn: any) => (cn.issue_date || "") >= dateFrom)
    if (dateTo) filtered = filtered.filter((cn: any) => (cn.issue_date || "") <= dateTo)
    return filtered
  }, [creditNotes, tab, search, contactMap, contactFilter, dateFrom, dateTo])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Purchases</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Credit Notes</div>
          <div className="mt-1 max-w-2xl text-sm text-muted-foreground">Credit notes received from suppliers for returns or adjustments</div>
        </div>
        <Button type="button" onClick={() => navigate("/purchases/credit-notes/new")} className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white shadow-[0_0_0_1px_rgba(124,157,255,0.25),0_16px_40px_rgba(0,0,0,0.35)] hover:opacity-95">
          <Plus className="mr-2 h-4 w-4" /> New Credit Note
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
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted shadow-[0_0_0_1px_rgba(15,23,42,0.08)]"><Tag className="h-6 w-6 text-muted-foreground" /></div>
                <div className="mt-4 text-base font-semibold text-foreground">No credit notes</div>
                <div className="mt-1 text-sm text-muted-foreground">Record credit notes you receive from suppliers</div>
                <Button type="button" onClick={() => navigate("/purchases/credit-notes/new")} className="mt-6 h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white"><Plus className="mr-2 h-4 w-4" /> New Credit Note</Button>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="w-[120px] text-muted-foreground">No.</TableHead>
                      <TableHead className="w-[130px] text-muted-foreground">Date</TableHead>
                      <TableHead className="text-muted-foreground">Supplier</TableHead>
                      <TableHead className="w-[150px] text-right text-muted-foreground">Total</TableHead>
                      <TableHead className="w-[150px] text-right text-muted-foreground">Applied</TableHead>
                      <TableHead className="w-[120px] text-muted-foreground">Status</TableHead>
                      <TableHead className="w-[60px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((cn: any) => (
                      <TableRow key={cn.id} className="border-border hover:bg-muted/50">
                        <TableCell className="font-medium text-foreground">{cn.vendor_credit_number}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(cn.issue_date)}</TableCell>
                        <TableCell className="text-foreground">{contactMap.get(cn.contact_id) ?? "—"}</TableCell>
                        <TableCell className="text-right text-foreground">{formatCurrency(cn.total, cn.currency)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{formatCurrency(cn.amount_applied, cn.currency)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cx("rounded-lg px-2 py-0.5 text-[11px] font-semibold", statusColors[cn.status] ?? "")}>
                            {cn.status.charAt(0).toUpperCase() + cn.status.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <RowActionsMenu actions={[
                            { label: "View", icon: <FileText className="h-3.5 w-3.5" />, onClick: () => setViewItem(cn) },
                            { label: "Edit", icon: <Pencil className="h-3.5 w-3.5" />, onClick: () => navigate(`/purchases/credit-notes/${cn.id}/edit`), disabled: cn.status === "void" || cn.status === "applied" },
                            { label: "Apply to Bill", icon: <ArrowRightLeft className="h-3.5 w-3.5" />, onClick: () => navigate(`/purchases/bills/new?credit_id=${cn.id}`), dividerBefore: true, disabled: cn.status === "void" || cn.status === "applied" },
                            { label: "Void", icon: <XCircle className="h-3.5 w-3.5" />, onClick: () => { if (confirm("Void this credit note?")) api.post(`/vendor-credits/${cn.id}/void`).then(() => { queryClient.invalidateQueries({ queryKey: ["vendor-credits"] }); toast("Credit note voided", "success") }).catch((e: any) => toast(e?.response?.data?.detail ?? "Failed to void credit note", "warning")) }, danger: true, dividerBefore: true, disabled: cn.status === "void" || cn.status === "applied" },
                            { label: "Delete", icon: <Trash2 className="h-3.5 w-3.5" />, onClick: () => { if (cn.status === "applied") { alert("Applied credit notes cannot be deleted."); return } if (confirm(`Delete credit note ${cn.vendor_credit_number}? This cannot be undone.`)) deleteVendorCredit.mutate(cn.id, { onSuccess: () => toast("Credit note deleted", "success"), onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to delete credit note", "warning") }) }, danger: true, disabled: cn.status === "applied" },
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
        title={viewItem ? `CN ${viewItem.vendor_credit_number}` : ""}
        subtitle={viewItem?.status ? viewItem.status.charAt(0).toUpperCase() + viewItem.status.slice(1) : undefined}
        fields={viewItem ? [
          { label: "Credit Number", value: viewItem.vendor_credit_number },
          { label: "Status", value: <Badge variant="outline" className={cx("rounded-lg px-2 py-0.5 text-[11px] font-semibold", statusColors[viewItem.status] ?? "")}>{viewItem.status.charAt(0).toUpperCase() + viewItem.status.slice(1)}</Badge> },
          { label: "Supplier", value: contactMap.get(viewItem.contact_id) ?? "—" },
          { label: "Date", value: formatDate(viewItem.issue_date) },
          { label: "Total", value: formatCurrency(viewItem.total, viewItem.currency) },
          { label: "Applied", value: formatCurrency(viewItem.amount_applied, viewItem.currency) },
          { label: "Currency", value: viewItem.currency ?? "MYR" },
        ] : []}
      />
    </div>
  )
}
