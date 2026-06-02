import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { Plus, Search, FileText, Send, XCircle, Pencil, Trash2, Receipt, ArrowRightLeft, RotateCcw } from "lucide-react"
import { usePurchaseCreditNotes, useContacts, useDeletePurchaseCreditNote, useBills, useRemovePurchaseCreditApplications } from "../../lib/hooks"
import api from "../../lib/api"
import { formatCurrency, formatDate, cn as clsx } from "../../lib/utils"
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
  draft: "bg-slate-500/10 text-slate-600 border-slate-300/20",
  issued: "bg-sky-500/10 text-sky-700 border-sky-400/20",
  applied: "bg-emerald-500/10 text-emerald-700 border-emerald-400/20",
  void: "bg-rose-500/10 text-rose-700 border-rose-400/20",
}

const STATUS_TABS = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Issued", value: "issued" },
  { label: "Applied", value: "applied" },
  { label: "Void", value: "void" },
]

export default function PurchaseCreditNotesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const deletePCN = useDeletePurchaseCreditNote()
  const removeApplications = useRemovePurchaseCreditApplications()
  const [tab, setTab] = useState("all")
  const [search, setSearch] = useState("")
  const [contactFilter, setContactFilter] = useState("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const { data: creditNotes = [], isLoading } = usePurchaseCreditNotes(tab === "all" ? undefined : tab)
  const { data: contacts = [] } = useContacts()
  const { data: bills = [] } = useBills()

  const vendors = useMemo(() => contacts.filter((c: any) => c.type === "supplier" || c.type === "vendor" || c.type === "both"), [contacts])

  const contactMap = useMemo(() => {
    const m = new Map<string, string>()
    contacts.forEach((c: any) => m.set(c.id, c.name))
    return m
  }, [contacts])

  const billMap = useMemo(() => {
    const m = new Map<string, string>()
    bills.forEach((b: any) => m.set(b.id, b.bill_number))
    return m
  }, [bills])

  const rows = useMemo(() => {
    let filtered = creditNotes
    if (search.trim()) {
      const q = search.toLowerCase()
      filtered = filtered.filter((cn: any) =>
        cn.pcn_number.toLowerCase().includes(q) ||
        (contactMap.get(cn.contact_id) ?? "").toLowerCase().includes(q)
      )
    }
    if (contactFilter !== "all") filtered = filtered.filter((cn: any) => cn.contact_id === contactFilter)
    if (dateFrom) filtered = filtered.filter((cn: any) => (cn.issue_date || "") >= dateFrom)
    if (dateTo) filtered = filtered.filter((cn: any) => (cn.issue_date || "") <= dateTo)
    return filtered
  }, [creditNotes, search, contactMap, contactFilter, dateFrom, dateTo])

  const patch = (id: string, status: string, label: string) =>
    api.patch(`/purchase-credit-notes/${id}/status`, null, { params: { status } })
      .then(() => { queryClient.invalidateQueries({ queryKey: ["purchase-credit-notes"] }); toast(label, "success") })
      .catch((e: any) => toast(e?.response?.data?.detail ?? "Failed to update status", "warning"))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Purchases</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Purchase Credit Notes</div>
          <div className="mt-1 max-w-2xl text-sm text-muted-foreground">Credit notes received from suppliers for returns or overbilled amounts</div>
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
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted shadow-[0_0_0_1px_rgba(15,23,42,0.08)]"><Receipt className="h-6 w-6 text-muted-foreground" /></div>
                <div className="mt-4 text-base font-semibold text-foreground">No purchase credit notes</div>
                <div className="mt-1 text-sm text-muted-foreground">Record credit notes received from suppliers</div>
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
                      <TableHead className="w-[150px] text-muted-foreground">Linked Bill</TableHead>
                      <TableHead className="w-[150px] text-right text-muted-foreground">Total</TableHead>
                      <TableHead className="w-[150px] text-right text-muted-foreground">Applied</TableHead>
                      <TableHead className="w-[120px] text-muted-foreground">Status</TableHead>
                      <TableHead className="w-[60px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((cn: any) => (
                      <TableRow key={cn.id} className="border-border hover:bg-muted/50">
                        <TableCell className="font-medium text-foreground">{cn.pcn_number}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(cn.issue_date)}</TableCell>
                        <TableCell className="text-foreground">{contactMap.get(cn.contact_id) ?? "—"}</TableCell>
                        <TableCell className="text-foreground">{cn.bill_id ? (billMap.get(cn.bill_id) ?? "—") : "—"}</TableCell>
                        <TableCell className="text-right text-foreground">{formatCurrency(cn.total, cn.currency)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{formatCurrency(cn.credit_applied, cn.currency)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={clsx("rounded-lg px-2 py-0.5 text-[11px] font-semibold", statusColors[cn.status] ?? "")}>
                            {cn.status.charAt(0).toUpperCase() + cn.status.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <RowActionsMenu actions={[
                            { label: "View", icon: <FileText className="h-3.5 w-3.5" />, onClick: () => navigate(`/purchases/credit-notes/${cn.id}/edit`) },
                            { label: "Edit", icon: <Pencil className="h-3.5 w-3.5" />, onClick: () => navigate(`/purchases/credit-notes/${cn.id}/edit`), disabled: cn.status === "void" },
                            { label: "Mark as Issued", icon: <Send className="h-3.5 w-3.5" />, onClick: () => patch(cn.id, "issued", "Credit note marked as issued"), dividerBefore: true, disabled: cn.status !== "draft" },
                            { label: "Apply to Bill", icon: <ArrowRightLeft className="h-3.5 w-3.5" />, onClick: () => navigate(`/purchases/credit-notes/${cn.id}/edit?tab=apply_credit`), disabled: cn.status === "void" || cn.status === "draft" },
                            { label: "Issue Refund", icon: <RotateCcw className="h-3.5 w-3.5" />, onClick: () => { const avail = Number(cn.total) - Number(cn.credit_applied ?? 0); navigate(`/purchases/refunds/new?pcn_id=${cn.id}&amount=${avail.toFixed(2)}&contact_id=${cn.contact_id}`) }, disabled: cn.status === "void" || cn.status === "draft" || (Number(cn.total) - Number(cn.credit_applied ?? 0)) <= 0 },
                            { label: "Remove Applications", icon: <ArrowRightLeft className="h-3.5 w-3.5" />, onClick: () => { if (confirm("Remove all credit applications from this PCN? The applied amounts will be removed from linked bills and the PCN will revert to Issued.")) removeApplications.mutate(cn.id, { onSuccess: () => toast("Credit applications removed", "success"), onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to remove applications", "warning") }) }, danger: true, dividerBefore: true, disabled: (cn.credit_applied ?? 0) <= 0 && (cn.credit_applications?.length ?? 0) <= 0 },
                            { label: "Void", icon: <XCircle className="h-3.5 w-3.5" />, onClick: () => { if ((cn.credit_applied ?? 0) > 0 || (cn.credit_applications?.length ?? 0) > 0) { alert("This credit note has applied amounts. Please use \"Remove Applications\" first before voiding."); return } if (confirm("Void this credit note? This reverses the GL entries and cannot be undone.")) patch(cn.id, "void", "Credit note voided") }, danger: true, dividerBefore: true, disabled: cn.status === "void" },
                            { label: "Delete", icon: <Trash2 className="h-3.5 w-3.5" />, onClick: () => { if ((cn.credit_applied ?? 0) > 0 || (cn.credit_applications?.length ?? 0) > 0) { alert("This credit note has applied amounts. Please use \"Remove Applications\" first before deleting."); return } if (cn.status !== "draft" && cn.status !== "void" && cn.status !== "issued") { alert("Please void this credit note first before deleting."); return } if (confirm(`Delete credit note ${cn.pcn_number}? This cannot be undone.`)) deletePCN.mutate(cn.id, { onSuccess: () => toast("Credit note deleted", "success"), onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to delete", "warning") }) }, danger: true, disabled: cn.status === "applied" },
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
    </div>
  )
}
