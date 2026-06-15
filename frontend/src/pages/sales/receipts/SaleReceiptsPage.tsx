import { useMemo, useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { ViewDetailSheet } from "../../../components/ui/view-detail-sheet"
import { Plus, Search, Receipt, FileText, XCircle, Pencil, Trash2 } from "lucide-react"
import { useSaleReceiptsPage, useContacts, useDeleteSaleReceipt, useDebounce } from "../../../lib/hooks"
import { PaginationControls } from "../../../components/ui/pagination-controls"
import { useQueryClient } from "@tanstack/react-query"
import api from "../../../lib/api"
import { formatCurrency, formatDate, cn } from "../../../lib/utils"
import { useToast } from "../../../components/ui/toast"
import { Card } from "../../../components/ui/card"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "../../../components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table"
import { Badge } from "../../../components/ui/badge"
import { RowActionsMenu } from "../../../components/ui/row-actions"

const statusColors: Record<string, string> = {
  completed: "bg-emerald-500/10 text-emerald-700 border-emerald-400/20",
  void: "bg-rose-500/10 text-rose-700 border-rose-400/20",
}

const paymentMethodLabel: Record<string, string> = {
  cash: "Cash", bank_transfer: "Bank Transfer", cheque: "Cheque",
  online_payment: "Online", fpx: "FPX", card: "Card",
}

const STATUS_TABS = [
  { label: "All", value: "all" },
  { label: "Completed", value: "completed" },
  { label: "Void", value: "void" },
]

export default function SaleReceiptsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [tab, setTab] = useState("all")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounce(search, 300)
  const [contactFilter, setContactFilter] = useState("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [viewItem, setViewItem] = useState<any>(null)
  const { data: receiptsPage, isLoading } = useSaleReceiptsPage({ status: tab === "all" ? undefined : tab, search: debouncedSearch, page, limit: 50 })
  const receipts = receiptsPage?.items ?? []
  const { data: contacts = [] } = useContacts()
  const deleteReceipt = useDeleteSaleReceipt()

  const customers = useMemo(() => contacts.filter((c: any) => c.type === "customer" || c.type === "both"), [contacts])

  const contactMap = useMemo(() => {
    const m = new Map<string, string>()
    contacts.forEach((c: any) => m.set(c.id, c.name))
    return m
  }, [contacts])

  useEffect(() => { setPage(1) }, [debouncedSearch, tab])

  const rows = useMemo(() => {
    let filtered = receipts
    if (contactFilter !== "all") filtered = filtered.filter((r: any) => r.contact_id === contactFilter)
    if (dateFrom) filtered = filtered.filter((r: any) => (r.receipt_date || "") >= dateFrom)
    if (dateTo) filtered = filtered.filter((r: any) => (r.receipt_date || "") <= dateTo)
    return filtered
  }, [receipts, contactMap, contactFilter, dateFrom, dateTo])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Sales</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Sale Receipts</div>
          <div className="mt-1 max-w-2xl text-sm text-muted-foreground">Record cash sales with immediate payment collection</div>
        </div>
        <Button type="button" onClick={() => navigate("/sales/receipts/new")} className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white shadow-[0_0_0_1px_rgba(124,157,255,0.25),0_16px_40px_rgba(0,0,0,0.35)] hover:opacity-95">
          <Plus className="mr-2 h-4 w-4" /> New Receipt
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
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by number or customer..." className="h-10 rounded-xl pl-9 text-sm" />
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
                  <Receipt className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="mt-4 text-base font-semibold text-foreground">No sale receipts</div>
                <div className="mt-1 text-sm text-muted-foreground">Use sale receipts for cash sales where payment is collected immediately</div>
                <Button type="button" onClick={() => navigate("/sales/receipts/new")} className="mt-6 h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white">
                  <Plus className="mr-2 h-4 w-4" /> New Receipt
                </Button>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="w-[130px] text-muted-foreground">No.</TableHead>
                      <TableHead className="w-[130px] text-muted-foreground">Date</TableHead>
                      <TableHead className="text-muted-foreground">Customer</TableHead>
                      <TableHead className="w-[130px] text-muted-foreground">Payment</TableHead>
                      <TableHead className="w-[150px] text-right text-muted-foreground">Total</TableHead>
                      <TableHead className="w-[120px] text-muted-foreground">Status</TableHead>
                      <TableHead className="w-[60px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r: any) => (
                      <TableRow key={r.id} className="border-border hover:bg-muted/50">
                        <TableCell className="font-medium text-foreground">{r.receipt_number}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(r.receipt_date)}</TableCell>
                        <TableCell className="text-foreground">{r.contact_id ? (contactMap.get(r.contact_id) ?? "—") : "Walk-in"}</TableCell>
                        <TableCell className="text-muted-foreground">{paymentMethodLabel[r.payment_method] ?? r.payment_method}</TableCell>
                        <TableCell className="text-right text-foreground">{formatCurrency(r.total, r.currency)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("rounded-lg px-2 py-0.5 text-[11px] font-semibold", statusColors[r.status] ?? "")}>
                            {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <RowActionsMenu actions={[
                            { label: "View", icon: <FileText className="h-3.5 w-3.5" />, onClick: () => setViewItem(r) },
                            { label: "Edit", icon: <Pencil className="h-3.5 w-3.5" />, onClick: () => navigate(`/sales/receipts/${r.id}/edit`), disabled: r.status === "void" },
                            { label: "Void", icon: <XCircle className="h-3.5 w-3.5" />, onClick: () => { if (confirm("Void this receipt? This reverses the GL entries and cannot be undone.")) api.post(`/sale-receipts/${r.id}/void`).then(() => { queryClient.invalidateQueries({ queryKey: ["sale-receipts"] }); toast("Receipt voided", "success") }).catch((e: any) => toast(e?.response?.data?.detail ?? "Failed to void receipt", "warning")) }, danger: true, dividerBefore: true, disabled: r.status === "void" },
                            { label: "Delete", icon: <Trash2 className="h-3.5 w-3.5" />, onClick: () => { if (r.status === "void") { if (!confirm(`Delete voided receipt ${r.receipt_number}? This cannot be undone.`)) return } else { if (!confirm(`Delete receipt ${r.receipt_number}? This cannot be undone.`)) return } deleteReceipt.mutate(r.id, { onSuccess: () => toast("Receipt deleted", "success"), onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to delete receipt", "warning") }) }, danger: true },
                          ]} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <PaginationControls page={page} pages={receiptsPage?.pages ?? 1} total={receiptsPage?.total ?? 0} limit={50} onPageChange={setPage} />
              </div>
            )}
          </div>
        </Tabs>
      </Card>

      <ViewDetailSheet
        open={!!viewItem}
        onOpenChange={(open) => { if (!open) setViewItem(null) }}
        title={viewItem ? `Receipt ${viewItem.receipt_number}` : ""}
        subtitle={viewItem?.status ? viewItem.status.charAt(0).toUpperCase() + viewItem.status.slice(1) : undefined}
        fields={viewItem ? [
          { label: "Receipt Number", value: viewItem.receipt_number },
          { label: "Status", value: <Badge variant="outline" className={cn("rounded-lg px-2 py-0.5 text-[11px] font-semibold", statusColors[viewItem.status] ?? "")}>{viewItem.status.charAt(0).toUpperCase() + viewItem.status.slice(1)}</Badge> },
          { label: "Customer", value: viewItem.contact_id ? (contactMap.get(viewItem.contact_id) ?? "—") : "Walk-in" },
          { label: "Date", value: formatDate(viewItem.receipt_date) },
          { label: "Total", value: formatCurrency(viewItem.total, viewItem.currency) },
          { label: "Payment Method", value: paymentMethodLabel[viewItem.payment_method] ?? viewItem.payment_method },
        ] : []}
      />
    </div>
  )
}
