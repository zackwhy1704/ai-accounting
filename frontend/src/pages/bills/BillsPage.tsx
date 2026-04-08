import { useMemo, useState, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { ViewDetailSheet } from "../../components/ui/view-detail-sheet"
import { Plus, Search, CalendarDays, FileText, Copy, Printer, XCircle, CreditCard, Pencil } from "lucide-react"
import { useBills, useContacts } from "../../lib/hooks"
import api from "../../lib/api"
import { formatCurrency, formatDate, cn } from "../../lib/utils"
import { useTheme } from "../../lib/theme"
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
  received: "bg-sky-500/10 text-sky-700 border-sky-400/20",
  outstanding: "bg-white/10 text-slate-700 border-slate-300/20",
  overdue: "bg-rose-500/10 text-rose-700 border-rose-400/20",
  paid: "bg-emerald-500/10 text-emerald-700 border-emerald-400/20",
  void: "bg-slate-500/10 text-slate-500 border-slate-300/20",
}

export default function BillsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState("all")
  const [search, setSearch] = useState("")
  const [contactFilter, setContactFilter] = useState("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const dateFromRef = useRef<HTMLInputElement>(null)
  const dateToRef = useRef<HTMLInputElement>(null)
  const { data: bills = [], isLoading } = useBills(tab === "all" ? undefined : tab)
  const { data: contacts = [] } = useContacts()
  const { t } = useTheme()
  const [viewItem, setViewItem] = useState<typeof bills[0] | null>(null)

  const statusTabs = [
    { label: t("common.all"), value: "all" },
    { label: t("bills.draft"), value: "draft" },
    { label: t("bills.outstanding"), value: "outstanding" },
    { label: t("bills.overdue"), value: "overdue" },
    { label: t("bills.paid"), value: "paid" },
  ]

  const contactMap = useMemo(() => {
    const m = new Map<string, string>()
    contacts.forEach(c => m.set(c.id, c.name))
    return m
  }, [contacts])

  const rows = useMemo(() => {
    let filtered = bills
    if (search.trim()) {
      const q = search.toLowerCase()
      filtered = filtered.filter(b => b.bill_number.toLowerCase().includes(q) || (contactMap.get(b.contact_id) ?? "").toLowerCase().includes(q))
    }
    if (contactFilter !== "all") filtered = filtered.filter(b => b.contact_id === contactFilter)
    if (dateFrom) filtered = filtered.filter(b => b.due_date && b.due_date >= dateFrom)
    if (dateTo) filtered = filtered.filter(b => b.due_date && b.due_date <= dateTo)
    return filtered
  }, [bills, search, contactMap, contactFilter])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs text-muted-foreground">{t("bills.category")}</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{t("bills.title")}</div>
          <div className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("bills.desc")}</div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" onClick={() => navigate("/purchases/bills/new")} className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white shadow-[0_0_0_1px_rgba(124,157,255,0.25),0_16px_40px_rgba(0,0,0,0.35)] hover:opacity-95"><Plus className="mr-2 h-4 w-4" /> {t("bills.new")}</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-9">
          <Card className="rounded-2xl border-border bg-card p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="h-auto flex-wrap justify-start gap-1 rounded-xl bg-muted p-1">
                {statusTabs.map(st => (<TabsTrigger key={st.value} value={st.value} className="rounded-lg px-3 py-1.5 text-xs">{st.label}</TabsTrigger>))}
              </TabsList>
              <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-12">
                <div className="lg:col-span-4">
                  <div className="text-xs font-medium text-muted-foreground">{t("bills.dueRange")}</div>
                  <div className="mt-2 flex items-center gap-1 rounded-xl border border-border bg-card px-3 py-1.5">
                    <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <input
                      ref={dateFromRef}
                      type="date"
                      value={dateFrom}
                      onChange={e => setDateFrom(e.target.value)}
                      className="flex-1 min-w-0 bg-transparent text-xs text-foreground focus:outline-none"
                    />
                    <div className="h-4 w-px bg-border shrink-0" />
                    <input
                      ref={dateToRef}
                      type="date"
                      value={dateTo}
                      onChange={e => setDateTo(e.target.value)}
                      className="flex-1 min-w-0 bg-transparent text-xs text-foreground focus:outline-none"
                    />
                    {(dateFrom || dateTo) && (
                      <button type="button" onClick={() => { setDateFrom(""); setDateTo("") }} className="shrink-0 text-muted-foreground hover:text-foreground">
                        <CalendarDays className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="lg:col-span-4">
                  <div className="text-xs font-medium text-muted-foreground">{t("common.search")}</div>
                  <div className="relative mt-2"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("bills.billNoContact")} className="h-10 rounded-xl pl-9 text-sm" /></div>
                </div>
                <div className="lg:col-span-4">
                  <div className="text-xs font-medium text-muted-foreground">{t("bills.contact")}</div>
                  <Select value={contactFilter} onValueChange={setContactFilter}>
                    <SelectTrigger className="mt-2 h-10 rounded-xl"><SelectValue placeholder={t("bills.allContacts")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("bills.allContacts")}</SelectItem>
                      {contacts.filter(c => c.type === "vendor" || c.type === "both").map(c => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mt-4">
                {isLoading ? (<div className="py-10 text-center text-sm text-muted-foreground">{t("common.loading")}</div>
                ) : rows.length === 0 ? (
                  <div className="rounded-2xl border border-border bg-card px-6 py-10">
                    <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
                      <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted shadow-[0_0_0_1px_rgba(15,23,42,0.08)]"><FileText className="h-6 w-6 text-muted-foreground" /></div>
                        <div><div className="text-base font-semibold text-foreground">{t("bills.noBills")}</div><div className="mt-1 text-sm text-muted-foreground">{t("bills.noBillsDesc")}</div></div>
                      </div>
                      <Button type="button" onClick={() => navigate("/purchases/bills/new")} className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white"><Plus className="mr-2 h-4 w-4" /> {t("bills.create")}</Button>
                    </div>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-border bg-card">
                    <Table>
                      <TableHeader><TableRow className="border-border hover:bg-transparent">
                        <TableHead className="w-[90px] text-muted-foreground">{t("common.no")}</TableHead>
                        <TableHead className="w-[140px] text-muted-foreground">{t("common.date")}</TableHead>
                        <TableHead className="text-muted-foreground">{t("bills.vendor")}</TableHead>
                        <TableHead className="w-[160px] text-right text-muted-foreground">{t("common.amount")}</TableHead>
                        <TableHead className="w-[160px] text-right text-muted-foreground">{t("common.balance")}</TableHead>
                        <TableHead className="w-[150px] text-muted-foreground">{t("common.status")}</TableHead>
                        <TableHead className="w-[90px] text-right text-muted-foreground">{t("common.action")}</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {rows.map(bill => (
                          <TableRow key={bill.id} className="border-border hover:bg-muted/50">
                            <TableCell className="font-medium text-foreground">{bill.bill_number}</TableCell>
                            <TableCell className="text-muted-foreground">{formatDate(bill.issue_date)}</TableCell>
                            <TableCell className="text-foreground">{contactMap.get(bill.contact_id) ?? "—"}</TableCell>
                            <TableCell className="text-right text-foreground">{formatCurrency(bill.total)}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{formatCurrency(bill.total - (bill.amount_paid ?? 0))}</TableCell>
                            <TableCell><Badge variant="outline" className={cn("rounded-lg px-2 py-0.5 text-[11px] font-semibold", statusColors[bill.status] ?? "")}>{bill.status.charAt(0).toUpperCase() + bill.status.slice(1)}</Badge></TableCell>
                            <TableCell className="text-right">
                              <RowActionsMenu actions={[
                                { label: "Edit", icon: <Pencil className="h-3.5 w-3.5" />, onClick: () => navigate(`/purchases/bills/${bill.id}/edit`) },
                                { label: "View", icon: <FileText className="h-3.5 w-3.5" />, onClick: () => setViewItem(bill) },
                                { label: t("invoices.addPayment"), icon: <CreditCard className="h-3.5 w-3.5" />, onClick: () => navigate(`/purchases/payments/new?bill_id=${bill.id}`), dividerBefore: true },
                                { label: t("invoices.duplicate"), icon: <Copy className="h-3.5 w-3.5" />, onClick: () => navigate(`/purchases/bills/new?copy=${bill.id}`) },
                                { label: t("invoices.printPdf"), icon: <Printer className="h-3.5 w-3.5" />, onClick: () => window.print() },
                                { label: t("invoices.void"), icon: <XCircle className="h-3.5 w-3.5" />, onClick: () => { if (confirm("Void this bill?")) api.patch(`/bills/${bill.id}`, { status: "void" }).then(() => queryClient.invalidateQueries({ queryKey: ["bills"] })) }, danger: true, dividerBefore: true, disabled: bill.status === "void" },
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
        <div className="xl:col-span-3">
          <Card className="rounded-2xl border-border bg-card p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
            <div className="text-sm font-semibold text-foreground">{t("bills.summary")}</div>
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-border bg-card p-3"><div className="text-xs text-muted-foreground">{t("bills.outstanding")}</div><div className="mt-1 text-lg font-semibold text-foreground">RM 0.00</div></div>
              <div className="rounded-xl border border-border bg-card p-3"><div className="text-xs text-muted-foreground">{t("bills.overdue")}</div><div className="mt-1 text-lg font-semibold text-foreground">RM 0.00</div></div>
              <div className="rounded-xl border border-border bg-card p-3"><div className="text-xs text-muted-foreground">{t("bills.paid7d")}</div><div className="mt-1 text-lg font-semibold text-foreground">RM 0.00</div></div>
            </div>
          </Card>
        </div>
      </div>
      <ViewDetailSheet
        open={!!viewItem}
        onOpenChange={(open) => { if (!open) setViewItem(null) }}
        title={viewItem ? `Bill ${viewItem.bill_number}` : ""}
        subtitle={viewItem?.status ? viewItem.status.charAt(0).toUpperCase() + viewItem.status.slice(1) : undefined}
        fields={viewItem ? [
          { label: "Bill Number", value: viewItem.bill_number },
          { label: "Status", value: <Badge variant="outline" className={cn("rounded-lg px-2 py-0.5 text-[11px] font-semibold", statusColors[viewItem.status] ?? "")}>{viewItem.status.charAt(0).toUpperCase() + viewItem.status.slice(1)}</Badge> },
          { label: "Vendor", value: contactMap.get(viewItem.contact_id) ?? "—" },
          { label: "Issue Date", value: formatDate(viewItem.issue_date) },
          { label: "Due Date", value: viewItem.due_date ? formatDate(viewItem.due_date) : "—" },
          { label: "Subtotal", value: formatCurrency(viewItem.subtotal) },
          { label: "Tax", value: formatCurrency(viewItem.tax_amount ?? 0) },
          { label: "Total", value: formatCurrency(viewItem.total) },
          { label: "Amount Paid", value: formatCurrency(viewItem.amount_paid ?? 0) },
          { label: "Balance Due", value: formatCurrency(viewItem.total - (viewItem.amount_paid ?? 0)) },
          { label: "Currency", value: viewItem.currency ?? "MYR" },
        ] : []}
      />
    </div>
  )
}
