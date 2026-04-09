import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Plus, Search, ArrowRightLeft, Pencil, X, Send, CheckCircle, XCircle } from "lucide-react"
import { RowActionsMenu } from "../../../components/ui/row-actions"
import { useQuotations, useContacts, useConvertQuotation, useUpdateQuotation } from "../../../lib/hooks"
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
  sent: "bg-sky-500/10 text-sky-700 border-sky-400/20",
  accepted: "bg-emerald-500/10 text-emerald-700 border-emerald-400/20",
  declined: "bg-rose-500/10 text-rose-700 border-rose-400/20",
  expired: "bg-amber-500/10 text-amber-700 border-amber-400/20",
  converted: "bg-violet-500/10 text-violet-700 border-violet-400/20",
}

export default function QuotationsPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState("all")
  const [search, setSearch] = useState("")
  const [contactFilter, setContactFilter] = useState("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const { data: quotations = [], isLoading } = useQuotations(tab === "all" ? undefined : tab)
  const { data: contacts = [] } = useContacts()
  const { t } = useTheme()
  const convertQuotation = useConvertQuotation()
  const updateQuotation = useUpdateQuotation()

  const markStatus = (id: string, status: string) => updateQuotation.mutateAsync({ id, status } as any)

  // Conversion dialog state
  const [convertDialog, setConvertDialog] = useState<{ open: boolean; quotationId: string; quotationNumber: string }>({ open: false, quotationId: "", quotationNumber: "" })
  const [convertToInvoice, setConvertToInvoice] = useState(true)
  const [convertToDO, setConvertToDO] = useState(false)

  const handleConvert = async () => {
    const targets: string[] = []
    if (convertToInvoice) targets.push("invoice")
    if (convertToDO) targets.push("delivery_order")
    if (targets.length === 0) return
    try {
      await convertQuotation.mutateAsync({ id: convertDialog.quotationId, targets })
      setConvertDialog({ open: false, quotationId: "", quotationNumber: "" })
    } catch {
      // error handled by mutation
    }
  }

  const statusTabs = [
    { label: t("common.all"), value: "all" },
    { label: "Draft", value: "draft" },
    { label: "Sent", value: "sent" },
    { label: "Accepted", value: "accepted" },
    { label: "Declined", value: "declined" },
    { label: "Converted", value: "converted" },
  ]

  const contactMap = useMemo(() => {
    const m = new Map<string, string>()
    contacts.forEach(c => m.set(c.id, c.name))
    return m
  }, [contacts])

  const rows = useMemo(() => {
    let filtered = quotations
    if (search.trim()) {
      const q = search.toLowerCase()
      filtered = filtered.filter(i =>
        i.quotation_number.toLowerCase().includes(q) ||
        (contactMap.get(i.contact_id) ?? "").toLowerCase().includes(q)
      )
    }
    if (contactFilter !== "all") filtered = filtered.filter(i => i.contact_id === contactFilter)
    if (dateFrom) filtered = filtered.filter(i => (i.issue_date || "") >= dateFrom)
    if (dateTo) filtered = filtered.filter(i => (i.issue_date || "") <= dateTo)
    return filtered
  }, [quotations, search, contactMap, contactFilter, dateFrom, dateTo])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs text-muted-foreground">{t("quotations.category")}</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{t("quotations.title")}</div>
          <div className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("quotations.desc")}</div>
        </div>
        <div className="flex items-center gap-2">
<Button type="button" onClick={() => navigate("/sales/quotations/new")} className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white shadow-[0_0_0_1px_rgba(124,157,255,0.25),0_16px_40px_rgba(0,0,0,0.35)] hover:opacity-95">
            <Plus className="mr-2 h-4 w-4" /> {t("quotations.new")}
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
              <div className="text-xs font-medium text-muted-foreground">{t("quotations.dateRange")}</div>
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
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("quotations.searchPlaceholder")} className="h-10 rounded-xl pl-9 text-sm" />
              </div>
            </div>
            <div className="lg:col-span-4">
              <div className="text-xs font-medium text-muted-foreground">{t("quotations.customer")}</div>
              <Select value={contactFilter} onValueChange={setContactFilter}>
                <SelectTrigger className="mt-2 h-10 rounded-xl"><SelectValue placeholder={t("quotations.allCustomers")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("quotations.allCustomers")}</SelectItem>
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
                <div className="mt-4 text-base font-semibold text-foreground">{t("quotations.noQuotations")}</div>
                <div className="mt-1 text-sm text-muted-foreground">{t("quotations.noQuotationsDesc")}</div>
                <Button type="button" onClick={() => navigate("/sales/quotations/new")} className="mt-6 h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white"><Plus className="mr-2 h-4 w-4" /> {t("quotations.create")}</Button>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="w-[90px] text-muted-foreground">{t("common.no")}</TableHead>
                      <TableHead className="w-[140px] text-muted-foreground">{t("common.date")}</TableHead>
                      <TableHead className="text-muted-foreground">{t("quotations.customer")}</TableHead>
                      <TableHead className="w-[160px] text-right text-muted-foreground">{t("common.amount")}</TableHead>
                      <TableHead className="w-[150px] text-muted-foreground">{t("common.status")}</TableHead>
                      <TableHead className="w-[90px] text-right text-muted-foreground">{t("common.action")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map(q => (
                      <TableRow key={q.id} className="border-border hover:bg-muted/50">
                        <TableCell className="font-medium text-foreground">{q.quotation_number}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(q.issue_date)}</TableCell>
                        <TableCell className="text-foreground">{contactMap.get(q.contact_id) ?? "—"}</TableCell>
                        <TableCell className="text-right text-foreground">{formatCurrency(q.total)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("rounded-lg px-2 py-0.5 text-[11px] font-semibold", statusColors[q.status] ?? "")}>{q.status.charAt(0).toUpperCase() + q.status.slice(1)}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <RowActionsMenu actions={[
                            { label: "Edit", icon: <Pencil className="h-3.5 w-3.5" />, onClick: () => navigate(`/sales/quotations/${q.id}/edit`) },
                            { label: "Mark as Sent", icon: <Send className="h-3.5 w-3.5" />, onClick: () => markStatus(q.id, "sent"), dividerBefore: true, disabled: q.status === "sent" || q.status === "converted" },
                            { label: "Mark as Accepted", icon: <CheckCircle className="h-3.5 w-3.5" />, onClick: () => markStatus(q.id, "accepted"), disabled: q.status === "accepted" || q.status === "converted" },
                            { label: "Mark as Declined", icon: <XCircle className="h-3.5 w-3.5" />, onClick: () => markStatus(q.id, "declined"), danger: true, disabled: q.status === "declined" || q.status === "converted" },
                            { label: "Convert to Invoice / DO", icon: <ArrowRightLeft className="h-3.5 w-3.5" />, onClick: () => { setConvertToInvoice(true); setConvertToDO(false); setConvertDialog({ open: true, quotationId: q.id, quotationNumber: q.quotation_number }) }, dividerBefore: true, disabled: q.status === "converted" },
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

      {/* Conversion Dialog */}
      {convertDialog.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Convert {convertDialog.quotationNumber}</h3>
              <button onClick={() => setConvertDialog({ open: false, quotationId: "", quotationNumber: "" })} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">Select what to create from this quotation. All line items will be copied.</p>
            <div className="mt-4 space-y-3">
              <label className="flex items-center gap-3 rounded-xl border border-border p-3 cursor-pointer hover:bg-muted/50">
                <input type="checkbox" checked={convertToInvoice} onChange={e => setConvertToInvoice(e.target.checked)} className="h-4 w-4 rounded" />
                <div>
                  <div className="text-sm font-medium text-foreground">Sales Invoice</div>
                  <div className="text-xs text-muted-foreground">Create an invoice with all line items</div>
                </div>
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-border p-3 cursor-pointer hover:bg-muted/50">
                <input type="checkbox" checked={convertToDO} onChange={e => setConvertToDO(e.target.checked)} className="h-4 w-4 rounded" />
                <div>
                  <div className="text-sm font-medium text-foreground">Delivery Order</div>
                  <div className="text-xs text-muted-foreground">Create a delivery order with all line items</div>
                </div>
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setConvertDialog({ open: false, quotationId: "", quotationNumber: "" })}>Cancel</Button>
              <Button
                onClick={handleConvert}
                disabled={(!convertToInvoice && !convertToDO) || convertQuotation.isPending}
                className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700"
              >
                {convertQuotation.isPending ? "Converting..." : "Convert"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
