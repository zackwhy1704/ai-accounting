import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Plus, Search, Pencil, Send, XCircle, CreditCard, Trash2 } from "lucide-react"
import { RowActionsMenu } from "../../../components/ui/row-actions"
import { usePurchaseDebitNotes, useContacts, useBills, useUpdatePurchaseDebitNoteStatus, useDeletePurchaseDebitNote } from "../../../lib/hooks"
import { formatCurrency, formatDate, cn } from "../../../lib/utils"
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

export default function PurchaseDebitNotesPage() {
  const navigate = useNavigate()
  const updateStatus = useUpdatePurchaseDebitNoteStatus()
  const deleteDN = useDeletePurchaseDebitNote()
  const patch = (id: string, status: string) => updateStatus.mutate({ id, status })
  const [tab, setTab] = useState("all")
  const [search, setSearch] = useState("")
  const [contactFilter, setContactFilter] = useState("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const { data: debitNotes = [], isLoading } = usePurchaseDebitNotes(tab === "all" ? undefined : tab)
  const { data: contacts = [] } = useContacts()
  const { data: bills = [] } = useBills()

  const statusTabs = [
    { label: "All", value: "all" },
    { label: "Draft", value: "draft" },
    { label: "Issued", value: "issued" },
    { label: "Applied", value: "applied" },
    { label: "Void", value: "void" },
  ]

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

  const vendors = useMemo(() => contacts.filter((c: any) => c.type === "supplier" || c.type === "vendor" || c.type === "both"), [contacts])

  const rows = useMemo(() => {
    let filtered = debitNotes
    if (search.trim()) {
      const q = search.toLowerCase()
      filtered = filtered.filter((i: any) =>
        i.debit_note_number.toLowerCase().includes(q) ||
        (contactMap.get(i.contact_id) ?? "").toLowerCase().includes(q)
      )
    }
    if (contactFilter !== "all") filtered = filtered.filter((i: any) => i.contact_id === contactFilter)
    if (dateFrom) filtered = filtered.filter((i: any) => (i.issue_date || "") >= dateFrom)
    if (dateTo) filtered = filtered.filter((i: any) => (i.issue_date || "") <= dateTo)
    return filtered
  }, [debitNotes, search, contactMap, contactFilter, dateFrom, dateTo])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Purchases</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Debit Notes</div>
          <div className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Issue debit notes to suppliers when they overcharge or when goods are returned.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={() => navigate("/purchases/debit-notes/new")}
            className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white shadow-[0_0_0_1px_rgba(124,157,255,0.25),0_16px_40px_rgba(0,0,0,0.35)] hover:opacity-95"
          >
            <Plus className="mr-2 h-4 w-4" /> New Debit Note
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
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by number or vendor..." className="h-10 rounded-xl pl-9 text-sm" />
              </div>
            </div>
            <div className="lg:col-span-4">
              <div className="text-xs font-medium text-muted-foreground">Vendor</div>
              <Select value={contactFilter} onValueChange={setContactFilter}>
                <SelectTrigger className="mt-2 h-10 rounded-xl"><SelectValue placeholder="All Vendors" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Vendors</SelectItem>
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
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted shadow-[0_0_0_1px_rgba(15,23,42,0.08)]"><Plus className="h-6 w-6 text-muted-foreground" /></div>
                <div className="mt-4 text-base font-semibold text-foreground">No debit notes</div>
                <div className="mt-1 text-sm text-muted-foreground">Create a debit note to notify a supplier of an overcharge or return.</div>
                <Button type="button" onClick={() => navigate("/purchases/debit-notes/new")} className="mt-6 h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white"><Plus className="mr-2 h-4 w-4" /> New Debit Note</Button>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="w-[90px] text-muted-foreground">No.</TableHead>
                      <TableHead className="w-[140px] text-muted-foreground">Date</TableHead>
                      <TableHead className="text-muted-foreground">Vendor</TableHead>
                      <TableHead className="w-[150px] text-muted-foreground">Linked Bill</TableHead>
                      <TableHead className="w-[160px] text-right text-muted-foreground">Amount</TableHead>
                      <TableHead className="w-[150px] text-muted-foreground">Status</TableHead>
                      <TableHead className="w-[90px] text-right text-muted-foreground">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((dn: any) => (
                      <TableRow key={dn.id} className="border-border hover:bg-muted/50">
                        <TableCell className="font-medium text-foreground">{dn.debit_note_number}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(dn.issue_date)}</TableCell>
                        <TableCell className="text-foreground">{contactMap.get(dn.contact_id) ?? "—"}</TableCell>
                        <TableCell className="text-foreground">{dn.bill_id ? (billMap.get(dn.bill_id) ?? dn.bill_id) : "—"}</TableCell>
                        <TableCell className="text-right text-foreground">{formatCurrency(dn.total)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("rounded-lg px-2 py-0.5 text-[11px] font-semibold", statusColors[dn.status] ?? "")}>
                            {dn.status.charAt(0).toUpperCase() + dn.status.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <RowActionsMenu actions={[
                            { label: "Edit", icon: <Pencil className="h-3.5 w-3.5" />, onClick: () => navigate(`/purchases/debit-notes/${dn.id}/edit`), disabled: dn.status !== "draft" },
                            { label: "Mark as Issued", icon: <Send className="h-3.5 w-3.5" />, onClick: () => patch(dn.id, "issued"), disabled: dn.status !== "draft" },
                            { label: "Make Payment", icon: <CreditCard className="h-3.5 w-3.5" />, onClick: () => navigate(`/purchases/payments/new?contact_id=${dn.contact_id}&amount=${dn.total}&debit_note_id=${dn.id}`), dividerBefore: true, disabled: dn.status === "void" || dn.status === "applied" },
                            { label: "Void", icon: <XCircle className="h-3.5 w-3.5" />, onClick: () => { if (confirm("Void this debit note?")) patch(dn.id, "void") }, danger: true, dividerBefore: true, disabled: dn.status === "void" || dn.status === "applied" },
                            { label: "Delete", icon: <Trash2 className="h-3.5 w-3.5" />, onClick: () => { if (confirm("Delete this debit note?")) deleteDN.mutate(dn.id) }, danger: true, disabled: dn.status === "applied" },
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
