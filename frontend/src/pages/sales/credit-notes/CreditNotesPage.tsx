import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { Plus, Search, ArrowRightLeft, Pencil, Send, XCircle, RotateCcw } from "lucide-react"
import { RowActionsMenu } from "../../../components/ui/row-actions"
import { useCreditNotes, useContacts, useInvoices } from "../../../lib/hooks"
import api from "../../../lib/api"
import { formatCurrency, formatDate, cn } from "../../../lib/utils"
import { useTheme } from "../../../lib/theme"
import { Card } from "../../../components/ui/card"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "../../../components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table"
import { Badge } from "../../../components/ui/badge"

const statusColors: Record<string, string> = {
  draft: "bg-slate-500/10 text-slate-600 border-slate-300/20",
  issued: "bg-sky-500/10 text-sky-700 border-sky-400/20",
  applied: "bg-emerald-500/10 text-emerald-700 border-emerald-400/20",
  void: "bg-rose-500/10 text-rose-700 border-rose-400/20",
}

export default function CreditNotesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const patch = (id: string, status: string) =>
    api.patch(`/credit-notes/${id}`, { status }).then(() => queryClient.invalidateQueries({ queryKey: ["credit-notes"] }))
  const [tab, setTab] = useState("all")
  const [search, setSearch] = useState("")
  const [contactFilter, setContactFilter] = useState("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const { data: creditNotes = [], isLoading } = useCreditNotes(tab === "all" ? undefined : tab)
  const { data: contacts = [] } = useContacts()
  const { data: invoices = [] } = useInvoices()
  const { t } = useTheme()

  const statusTabs = [
    { label: t("common.all"), value: "all" },
    { label: t("creditNotes.draft"), value: "draft" },
    { label: t("creditNotes.issued"), value: "issued" },
    { label: t("creditNotes.applied"), value: "applied" },
    { label: t("creditNotes.void"), value: "void" },
  ]

  const contactMap = useMemo(() => {
    const m = new Map<string, string>()
    contacts.forEach(c => m.set(c.id, c.name))
    return m
  }, [contacts])

  const invoiceMap = useMemo(() => {
    const m = new Map<string, string>()
    invoices.forEach((inv: any) => m.set(inv.id, inv.invoice_number))
    return m
  }, [invoices])

  const rows = useMemo(() => {
    let filtered = creditNotes
    if (search.trim()) {
      const q = search.toLowerCase()
      filtered = filtered.filter(i =>
        i.credit_note_number.toLowerCase().includes(q) ||
        (contactMap.get(i.contact_id) ?? "").toLowerCase().includes(q)
      )
    }
    if (contactFilter !== "all") filtered = filtered.filter(i => i.contact_id === contactFilter)
    if (dateFrom) filtered = filtered.filter(i => (i.issue_date || "") >= dateFrom)
    if (dateTo) filtered = filtered.filter(i => (i.issue_date || "") <= dateTo)
    return filtered
  }, [creditNotes, search, contactMap, contactFilter, dateFrom, dateTo])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs text-muted-foreground">{t("creditNotes.category")}</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{t("creditNotes.title")}</div>
          <div className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("creditNotes.desc")}</div>
        </div>
        <div className="flex items-center gap-2">
<Button type="button" onClick={() => navigate("/sales/credit-notes/new")} className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white shadow-[0_0_0_1px_rgba(124,157,255,0.25),0_16px_40px_rgba(0,0,0,0.35)] hover:opacity-95">
            <Plus className="mr-2 h-4 w-4" /> {t("creditNotes.new")}
          </Button>
        </div>
      </div>

      <Card className="rounded-2xl border-border bg-card p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <Tabs value={tab} onValueChange={setTab}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <TabsList className="h-auto flex-wrap justify-start gap-1 rounded-xl bg-muted p-1">
              {statusTabs.map(st => (
                <TabsTrigger key={st.value} value={st.value} className="rounded-lg px-3 py-1.5 text-xs">{st.label}</TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <div className="text-xs font-medium text-muted-foreground">{t("creditNotes.dateRange")}</div>
              <div className="mt-2 flex items-center gap-2">
                <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-10 rounded-xl text-sm" />
                <span className="text-xs text-muted-foreground">to</span>
                <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-10 rounded-xl text-sm" />
              </div>
            </div>
            <div className="lg:col-span-4">
              <div className="text-xs font-medium text-muted-foreground">{t("common.search")}</div>
              <div className="mt-2 relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("creditNotes.searchPlaceholder")} className="h-10 rounded-xl pl-9 text-sm" />
              </div>
            </div>
            <div className="lg:col-span-4">
              <div className="text-xs font-medium text-muted-foreground">{t("creditNotes.customer")}</div>
              <Select value={contactFilter} onValueChange={setContactFilter}>
                <SelectTrigger className="mt-2 h-10 rounded-xl"><SelectValue placeholder={t("creditNotes.allCustomers")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("creditNotes.allCustomers")}</SelectItem>
                  {contacts.filter(c => c.type === "customer" || c.type === "both").map(c => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>


          <div className="mt-4">
            {isLoading ? (
              <div className="py-10 text-center text-sm text-muted-foreground">{t("common.loading")}</div>
            ) : rows.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted shadow-[0_0_0_1px_rgba(15,23,42,0.08)]"><Plus className="h-6 w-6 text-muted-foreground" /></div>
                <div className="mt-4 text-base font-semibold text-foreground">{t("creditNotes.noCreditNotes")}</div>
                <div className="mt-1 text-sm text-muted-foreground">{t("creditNotes.noCreditNotesDesc")}</div>
                <Button type="button" onClick={() => navigate("/sales/credit-notes/new")} className="mt-6 h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white"><Plus className="mr-2 h-4 w-4" /> {t("creditNotes.create")}</Button>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="w-[90px] text-muted-foreground">{t("common.no")}</TableHead>
                      <TableHead className="w-[140px] text-muted-foreground">{t("common.date")}</TableHead>
                      <TableHead className="text-muted-foreground">{t("creditNotes.customer")}</TableHead>
                      <TableHead className="w-[140px] text-muted-foreground">{t("creditNotes.linkedInvoice")}</TableHead>
                      <TableHead className="w-[140px] text-right text-muted-foreground">{t("common.amount")}</TableHead>
                      <TableHead className="w-[140px] text-right text-muted-foreground">{t("creditNotes.creditApplied")}</TableHead>
                      <TableHead className="w-[130px] text-muted-foreground">{t("common.status")}</TableHead>
                      <TableHead className="w-[90px] text-right text-muted-foreground">{t("common.action")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map(row => (
                      <TableRow key={row.id} className="border-border hover:bg-muted/50">
                        <TableCell className="font-medium text-foreground">{row.credit_note_number}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(row.issue_date)}</TableCell>
                        <TableCell className="text-foreground">{contactMap.get(row.contact_id) ?? "\u2014"}</TableCell>
                        <TableCell className="text-muted-foreground">{row.invoice_id ? (invoiceMap.get(row.invoice_id) ?? row.invoice_id) : "\u2014"}</TableCell>
                        <TableCell className="text-right text-foreground">{formatCurrency(row.total)}</TableCell>
                        <TableCell className="text-right text-foreground">{formatCurrency(row.credit_applied ?? 0)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("rounded-lg px-2 py-0.5 text-[11px] font-semibold", statusColors[row.status] ?? "")}>{row.status.charAt(0).toUpperCase() + row.status.slice(1)}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <RowActionsMenu actions={[
                            { label: "Edit", icon: <Pencil className="h-3.5 w-3.5" />, onClick: () => navigate(`/sales/credit-notes/${row.id}/edit`), disabled: row.status === "void" },
                            { label: "Mark as Issued", icon: <Send className="h-3.5 w-3.5" />, onClick: () => patch(row.id, "issued"), dividerBefore: true, disabled: row.status !== "draft" },
                            { label: t("creditNotes.applyToInvoice"), icon: <ArrowRightLeft className="h-3.5 w-3.5" />, onClick: () => navigate(`/sales/credit-notes/${row.id}/edit?tab=apply_credit`), disabled: row.status === "void" || row.status === "draft" },
                            { label: "Issue Refund", icon: <RotateCcw className="h-3.5 w-3.5" />, onClick: () => navigate(`/sales/refunds/new?credit_note_id=${row.id}&amount=${row.total}&contact_id=${row.contact_id}`), disabled: row.status === "void" || row.status === "applied" },
                            { label: "Void", icon: <XCircle className="h-3.5 w-3.5" />, onClick: () => { if (confirm("Void this credit note?")) patch(row.id, "void") }, danger: true, dividerBefore: true, disabled: row.status === "void" || row.status === "applied" },
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
