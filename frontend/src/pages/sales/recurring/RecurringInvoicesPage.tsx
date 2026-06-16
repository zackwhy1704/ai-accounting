import { useMemo, useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Plus, Search, RefreshCw, Pause, Play, Pencil, Trash2 } from "lucide-react"
import { RowActionsMenu } from "../../../components/ui/row-actions"
import { useRecurringInvoicesPage, useContacts, usePauseRecurringInvoice, useResumeRecurringInvoice, useDeleteRecurringInvoice, useRunRecurringInvoiceNow, useRunDueRecurringInvoices, useDebounce } from "../../../lib/hooks"
import { PaginationControls } from "../../../components/ui/pagination-controls"
import { formatDate, cn } from "../../../lib/utils"
import { Card } from "../../../components/ui/card"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "../../../components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select"
import { Badge } from "../../../components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table"
import { useToast } from "../../../components/ui/toast"

const statusColors: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-700 border-emerald-400/20",
  paused: "bg-amber-500/10 text-amber-700 border-amber-400/20",
  completed: "bg-blue-500/10 text-blue-700 border-blue-400/20",
  cancelled: "bg-rose-500/10 text-rose-700 border-rose-400/20",
}

const freqLabel: Record<string, string> = {
  daily: "Daily", weekly: "Weekly", monthly: "Monthly", yearly: "Yearly"
}

const STATUS_TABS = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Paused", value: "paused" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
]

export default function RecurringInvoicesPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [tab, setTab] = useState("all")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounce(search, 300)
  const [contactFilter, setContactFilter] = useState("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const { data: recurringPage, isLoading } = useRecurringInvoicesPage({ status: tab === "all" ? undefined : tab, search: debouncedSearch, page, limit: 50 })
  const recurring = recurringPage?.items ?? []
  const { data: contacts = [] } = useContacts()
  const pause = usePauseRecurringInvoice()
  const resume = useResumeRecurringInvoice()
  const runNow = useRunRecurringInvoiceNow()
  const runDue = useRunDueRecurringInvoices()
  const deleteRecurring = useDeleteRecurringInvoice()

  const customers = useMemo(() => contacts.filter((c: any) => c.type === "customer" || c.type === "both"), [contacts])

  const contactMap = useMemo(() => {
    const m = new Map<string, string>()
    contacts.forEach((c: any) => m.set(c.id, c.name))
    return m
  }, [contacts])

  useEffect(() => { setPage(1) }, [debouncedSearch, tab])

  const rows = useMemo(() => {
    let filtered = recurring
    if (contactFilter !== "all") filtered = filtered.filter((r: any) => r.contact_id === contactFilter)
    if (dateFrom) filtered = filtered.filter((r: any) => (r.start_date || "") >= dateFrom)
    if (dateTo) filtered = filtered.filter((r: any) => (r.start_date || "") <= dateTo)
    return filtered
  }, [recurring, contactMap, contactFilter, dateFrom, dateTo])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Sales</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Recurring Invoices</div>
          <div className="mt-1 max-w-2xl text-sm text-muted-foreground">Automate repeating invoices sent on a schedule</div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" onClick={() => { if (confirm("Generate invoices now for every active template that is due?")) runDue.mutate(undefined, { onSuccess: (d: any) => toast(d.generated > 0 ? `Generated ${d.generated} invoice(s)` : "No templates are due", "success"), onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to run due", "warning") }) }} disabled={runDue.isPending} className="h-9 rounded-xl px-3 text-xs font-semibold">
            <RefreshCw className="mr-2 h-4 w-4" /> Run All Due
          </Button>
          <Button type="button" onClick={() => navigate("/sales/recurring/new")} className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white shadow-[0_0_0_1px_rgba(124,157,255,0.25),0_16px_40px_rgba(0,0,0,0.35)] hover:opacity-95">
            <Plus className="mr-2 h-4 w-4" /> New Recurring Invoice
          </Button>
        </div>
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
              <div className="text-xs font-medium text-muted-foreground">Start Date Range</div>
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
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by customer..." className="h-10 rounded-xl pl-9 text-sm" />
              </div>
            </div>
            <div className="lg:col-span-4">
              <div className="text-xs font-medium text-muted-foreground">Customer</div>
              <Select value={contactFilter} onValueChange={setContactFilter}>
                <SelectTrigger className="mt-2 h-10 rounded-xl"><SelectValue placeholder="All Customers" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  {customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4">
            {isLoading ? (
              <div className="py-10 text-center text-sm text-muted-foreground">Loading...</div>
            ) : rows.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted shadow-[0_0_0_1px_rgba(15,23,42,0.08)]">
                  <RefreshCw className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="mt-4 text-base font-semibold text-foreground">No recurring invoices</div>
                <div className="mt-1 text-sm text-muted-foreground">Set up automatic billing for subscriptions or retainers</div>
                <Button type="button" onClick={() => navigate("/sales/recurring/new")} className="mt-6 h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white">
                  <Plus className="mr-2 h-4 w-4" /> New Recurring Invoice
                </Button>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-muted-foreground">Customer</TableHead>
                      <TableHead className="w-[130px] text-muted-foreground">Frequency</TableHead>
                      <TableHead className="w-[130px] text-muted-foreground">Start Date</TableHead>
                      <TableHead className="w-[130px] text-muted-foreground">Next Run</TableHead>
                      <TableHead className="w-[80px] text-muted-foreground">Runs</TableHead>
                      <TableHead className="w-[120px] text-muted-foreground">Status</TableHead>
                      <TableHead className="w-[60px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r: any) => (
                      <TableRow key={r.id} className="border-border hover:bg-muted/50">
                        <TableCell className="font-medium text-foreground">{contactMap.get(r.contact_id) ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {r.frequency_interval > 1 ? `Every ${r.frequency_interval} ` : ""}{freqLabel[r.frequency] ?? r.frequency}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(r.start_date)}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(r.next_run_date)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {r.run_count}{r.max_runs ? ` / ${r.max_runs}` : ""}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("rounded-lg px-2 py-0.5 text-[11px] font-semibold", statusColors[r.status] ?? "")}>
                            {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <RowActionsMenu actions={[
                            { label: "Edit", icon: <Pencil className="h-3.5 w-3.5" />, onClick: () => navigate(`/sales/recurring/${r.id}/edit`) },
                            ...(r.status === "active" ? [{ label: "Run Now", icon: <RefreshCw className="h-3.5 w-3.5" />, onClick: () => { if (confirm("Generate an invoice now from this recurring template?")) runNow.mutate(r.id, { onSuccess: (d: any) => toast(`Invoice created: ${d.invoice_number ?? ""}`, "success"), onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to run", "warning") }) }, dividerBefore: true }] : []),
                            ...(r.status === "active" ? [{ label: "Pause", icon: <Pause className="h-3.5 w-3.5" />, onClick: () => pause.mutate(r.id, { onSuccess: () => toast("Recurring invoice paused", "success"), onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to pause", "warning") }) }] : []),
                            ...(r.status === "paused" ? [{ label: "Resume", icon: <Play className="h-3.5 w-3.5" />, onClick: () => resume.mutate(r.id, { onSuccess: () => toast("Recurring invoice resumed", "success"), onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to resume", "warning") }), dividerBefore: true }] : []),
                            { label: "Delete", icon: <Trash2 className="h-3.5 w-3.5" />, onClick: () => { if (confirm("Delete this recurring invoice? All future scheduled runs will be cancelled.")) deleteRecurring.mutate(r.id, { onSuccess: () => toast("Recurring invoice deleted", "success"), onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to delete", "warning") }) }, danger: true, dividerBefore: true },
                          ]} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <PaginationControls page={page} pages={recurringPage?.pages ?? 1} total={recurringPage?.total ?? 0} limit={50} onPageChange={setPage} />
              </div>
            )}
          </div>
        </Tabs>
      </Card>
    </div>
  )
}
