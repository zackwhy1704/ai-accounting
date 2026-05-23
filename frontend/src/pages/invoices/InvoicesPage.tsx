import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Plus, Search, CreditCard, FileText, Copy, Printer, XCircle, Truck, Pencil, Send, Trash2, ArrowRightLeft, RotateCcw } from "lucide-react"
import { useInvoices, useContacts, useBankAccounts, useUpdateInvoiceStatus, useDeleteInvoice } from "../../lib/hooks"
import { useQueryClient } from "@tanstack/react-query"
import api from "../../lib/api"
import { formatCurrency, formatDate, cn } from "../../lib/utils"
import { useTheme } from "../../lib/theme"
import { useToast } from "../../components/ui/toast"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"
import { SearchableSelect } from "../../components/ui/searchable-select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table"
import { Badge } from "../../components/ui/badge"
import { RowActionsMenu } from "../../components/ui/row-actions"

const statusColors: Record<string, string> = {
  draft: "bg-slate-500/10 text-slate-600 border-slate-300/20",
  sent: "bg-sky-500/10 text-sky-700 border-sky-400/20",
  outstanding: "bg-white/10 text-slate-700 border-slate-300/20",
  overdue: "bg-rose-500/10 text-rose-700 border-rose-400/20",
  "partially paid": "bg-amber-500/10 text-amber-700 border-amber-400/20",
  paid: "bg-emerald-500/10 text-emerald-700 border-emerald-400/20",
  overpaid: "bg-violet-500/10 text-violet-700 border-violet-400/20",
  void: "bg-slate-500/10 text-slate-500 border-slate-300/20",
}

type OverpaidInvoice = { id: string; invoice_number: string; contact_id: string; total: number; amount_paid: number }

export default function InvoicesPage() {
  const navigate = useNavigate()
  const updateInvoiceStatus = useUpdateInvoiceStatus()
  const deleteInvoice = useDeleteInvoice()
  const qc = useQueryClient()
  const { toast } = useToast()
  const [tab, setTab] = useState("all")
  const [search, setSearch] = useState("")
  const [contactFilter, setContactFilter] = useState("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  // Overpaid dialogs
  const [applyDialog, setApplyDialog] = useState<{ open: boolean; inv: OverpaidInvoice | null }>({ open: false, inv: null })
  const [refundDialog, setRefundDialog] = useState<{ open: boolean; inv: OverpaidInvoice | null }>({ open: false, inv: null })
  const [applyTargetId, setApplyTargetId] = useState("")
  const [applyAmount, setApplyAmount] = useState("")
  const [refundAmount, setRefundAmount] = useState("")
  const [refundDate, setRefundDate] = useState(new Date().toISOString().slice(0, 10))
  const [refundBankAccountId, setRefundBankAccountId] = useState("")
  const [overpaidBusy, setOverpaidBusy] = useState(false)

  const { data: invoices = [], isLoading } = useInvoices(tab === "all" ? undefined : tab)
  const { data: contacts = [] } = useContacts()
  const { data: bankAccounts = [] } = useBankAccounts()
  const { t } = useTheme()

  const statusTabs = [
    { label: t("common.all"), value: "all" },
    { label: "Draft", value: "draft" },
    { label: "Outstanding", value: "outstanding" },
    { label: "Overdue", value: "overdue" },
    { label: "Paid", value: "paid" },
    { label: "Void", value: "void" },
  ]

  const contactMap = useMemo(() => {
    const m = new Map<string, string>()
    contacts.forEach(c => m.set(c.id, c.name))
    return m
  }, [contacts])

  const rows = useMemo(() => {
    let filtered = invoices
    if (search.trim()) {
      const q = search.toLowerCase()
      filtered = filtered.filter(i =>
        i.invoice_number.toLowerCase().includes(q) ||
        (contactMap.get(i.contact_id) ?? "").toLowerCase().includes(q)
      )
    }
    if (contactFilter !== "all") filtered = filtered.filter(i => i.contact_id === contactFilter)
    if (dateFrom) filtered = filtered.filter(i => (i.issue_date || "") >= dateFrom)
    if (dateTo) filtered = filtered.filter(i => (i.issue_date || "") <= dateTo)
    return filtered
  }, [invoices, search, contactMap, contactFilter, dateFrom, dateTo])

  const overpaidOf = (inv: any) => Math.max(0, (inv.amount_paid ?? 0) - inv.total)
  const displayStatus = (inv: any) => overpaidOf(inv) > 0 ? "overpaid" : inv.status

  // Always use live invoice data in dialogs so amounts reflect latest state
  const liveApplyInv = useMemo(() => applyDialog.inv ? (invoices.find((i: any) => i.id === applyDialog.inv!.id) ?? applyDialog.inv) : null, [invoices, applyDialog.inv])
  const liveRefundInv = useMemo(() => refundDialog.inv ? (invoices.find((i: any) => i.id === refundDialog.inv!.id) ?? refundDialog.inv) : null, [invoices, refundDialog.inv])

  const handleApplyCredit = async () => {
    if (!applyDialog.inv || !applyTargetId || !applyAmount) return
    setOverpaidBusy(true)
    try {
      await api.post(`/invoices/${applyDialog.inv.id}/apply-overpaid`, { target_invoice_id: applyTargetId, amount: Number(applyAmount) })
      qc.invalidateQueries({ queryKey: ["invoices"] })
      toast("Overpaid amount applied to invoice", "success")
      setApplyDialog({ open: false, inv: null })
      setApplyTargetId("")
      setApplyAmount("")
    } catch (e: any) {
      toast(e?.response?.data?.detail ?? "Failed to apply credit", "warning")
    } finally {
      setOverpaidBusy(false)
    }
  }

  const handleRefundOverpaid = async () => {
    if (!refundDialog.inv || !refundAmount) return
    setOverpaidBusy(true)
    try {
      await api.post(`/invoices/${refundDialog.inv.id}/refund-overpaid`, { amount: Number(refundAmount), payment_date: refundDate, bank_account_id: refundBankAccountId || undefined })
      qc.invalidateQueries({ queryKey: ["invoices"] })
      toast("Refund created successfully", "success")
      setRefundDialog({ open: false, inv: null })
      setRefundAmount("")
      setRefundBankAccountId("")
    } catch (e: any) {
      toast(e?.response?.data?.detail ?? "Failed to create refund", "warning")
    } finally {
      setOverpaidBusy(false)
    }
  }

  // Outstanding invoices for the same customer (for apply-credit target)
  const applyTargetOptions = useMemo(() => {
    if (!liveApplyInv) return []
    return invoices.filter((i: any) =>
      i.contact_id === liveApplyInv.contact_id &&
      i.id !== liveApplyInv.id &&
      !["void", "paid"].includes(i.status) &&
      (i.total - (i.amount_paid ?? 0)) > 0
    )
  }, [invoices, liveApplyInv])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs text-muted-foreground">{t("invoices.category")}</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{t("invoices.title")}</div>
          <div className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("invoices.desc")}</div>
        </div>
        <div className="flex items-center gap-2">
<Button type="button" onClick={() => navigate("/sales/invoices/new")} className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white shadow-[0_0_0_1px_rgba(124,157,255,0.25),0_16px_40px_rgba(0,0,0,0.35)] hover:opacity-95">
            <Plus className="mr-2 h-4 w-4" /> {t("invoices.new")}
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
              <div className="text-xs font-medium text-muted-foreground">{t("invoices.dateWindow")}</div>
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
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("invoices.invoiceNoCustomer")} className="h-10 rounded-xl pl-9 text-sm" />
              </div>
            </div>
            <div className="lg:col-span-4">
              <div className="text-xs font-medium text-muted-foreground">{t("invoices.customer")}</div>
              <Select value={contactFilter} onValueChange={setContactFilter}>
                <SelectTrigger className="mt-2 h-10 rounded-xl"><SelectValue placeholder={t("invoices.allCustomers")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("invoices.allCustomers")}</SelectItem>
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
                <div className="mt-4 text-base font-semibold text-foreground">{t("invoices.noInvoices")}</div>
                <div className="mt-1 text-sm text-muted-foreground">{t("invoices.noInvoicesDesc")}</div>
                <Button type="button" onClick={() => navigate("/sales/invoices/new")} className="mt-6 h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white"><Plus className="mr-2 h-4 w-4" /> {t("invoices.create")}</Button>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="w-[90px] text-muted-foreground">{t("common.no")}</TableHead>
                      <TableHead className="w-[140px] text-muted-foreground">{t("common.date")}</TableHead>
                      <TableHead className="text-muted-foreground">{t("invoices.customer")}</TableHead>
                      <TableHead className="w-[160px] text-right text-muted-foreground">{t("common.amount")}</TableHead>
                      <TableHead className="w-[160px] text-right text-muted-foreground">{t("common.balance")}</TableHead>
                      <TableHead className="w-[150px] text-muted-foreground">{t("common.status")}</TableHead>
                      <TableHead className="w-[90px] text-right text-muted-foreground">{t("common.action")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map(inv => {
                      const overpaid = overpaidOf(inv)
                      const ds = displayStatus(inv)
                      const balance = inv.total - (inv.amount_paid ?? 0)
                      return (
                      <TableRow key={inv.id} className="border-border hover:bg-muted/50">
                        <TableCell className="font-medium text-foreground">{inv.invoice_number}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(inv.issue_date)}</TableCell>
                        <TableCell className="text-foreground">{contactMap.get(inv.contact_id) ?? "—"}</TableCell>
                        <TableCell className="text-right text-foreground">{formatCurrency(inv.total)}</TableCell>
                        <TableCell className={cn("text-right", balance < 0 ? "text-violet-600 font-semibold" : "text-muted-foreground")}>{formatCurrency(balance)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("rounded-lg px-2 py-0.5 text-[11px] font-semibold", statusColors[ds] ?? "")}>{ds.charAt(0).toUpperCase() + ds.slice(1)}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <RowActionsMenu actions={[
                            { label: "Edit", icon: <Pencil className="h-3.5 w-3.5" />, onClick: () => navigate(`/sales/invoices/${inv.id}/edit`), disabled: inv.status === "void" },
                            { label: "Mark as Sent", icon: <Send className="h-3.5 w-3.5" />, onClick: () => updateInvoiceStatus.mutate({ id: inv.id, status: "sent" }), dividerBefore: true, disabled: inv.status !== "draft" },
                            { label: t("invoices.addPayment"), icon: <CreditCard className="h-3.5 w-3.5" />, onClick: () => navigate(`/sales/payments/new?invoice_id=${inv.id}`), disabled: inv.status === "void" || inv.status === "draft" || inv.status === "paid" || balance <= 0 },
                            { label: t("invoices.creditNote"), icon: <FileText className="h-3.5 w-3.5" />, onClick: () => navigate(`/sales/credit-notes/new?invoice_id=${inv.id}`) },
                            ...(overpaid > 0 ? [
                              { label: "Apply to Another Invoice", icon: <ArrowRightLeft className="h-3.5 w-3.5" />, onClick: () => { setApplyDialog({ open: true, inv: inv as any }); setApplyAmount(overpaid.toFixed(2)); setApplyTargetId("") }, dividerBefore: true },
                              { label: "Refund to Customer", icon: <RotateCcw className="h-3.5 w-3.5" />, onClick: () => { setRefundDialog({ open: true, inv: inv as any }); setRefundAmount(overpaid.toFixed(2)); setRefundDate(new Date().toISOString().slice(0, 10)) } },
                            ] : []),
                            { label: t("invoices.duplicate"), icon: <Copy className="h-3.5 w-3.5" />, onClick: () => navigate(`/sales/invoices/new?copy=${inv.id}`), dividerBefore: true },
                            { label: t("invoices.printPdf"), icon: <Printer className="h-3.5 w-3.5" />, onClick: () => window.print() },
                            { label: t("invoices.convertToDelivery"), icon: <Truck className="h-3.5 w-3.5" />, onClick: () => navigate(`/sales/delivery-orders/new?invoice_id=${inv.id}`), dividerBefore: true },
                            { label: t("invoices.void"), icon: <XCircle className="h-3.5 w-3.5" />, onClick: () => { if ((inv.amount_paid ?? 0) > 0) { alert("This invoice has payments applied. Please void or delete the payments first before voiding the invoice."); return } if (confirm("Void this invoice? This will reverse the GL entries.")) updateInvoiceStatus.mutate({ id: inv.id, status: "void" }, { onSuccess: () => toast("Invoice voided", "success"), onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to void invoice", "warning") }) }, danger: true, dividerBefore: true, disabled: inv.status === "void" || inv.status === "cancelled" },
                            { label: "Delete", icon: <Trash2 className="h-3.5 w-3.5" />, onClick: () => { if ((inv.amount_paid ?? 0) > 0) { alert("This invoice has payments applied. Please void the payments first, then void the invoice before deleting."); return } if (inv.status !== "draft" && inv.status !== "void" && inv.status !== "cancelled") { alert("Please void this invoice first before deleting. This reverses the GL entries."); return } if (confirm(`Delete invoice ${inv.invoice_number}? This cannot be undone.`)) deleteInvoice.mutate(inv.id, { onSuccess: () => toast("Invoice deleted", "success"), onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to delete invoice", "warning") }) }, danger: true, disabled: inv.status === "paid" },
                          ]} />
                        </TableCell>
                      </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </Tabs>
      </Card>

      {/* Apply Overpaid to Another Invoice */}
      {applyDialog.open && liveApplyInv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl">
            <h3 className="text-base font-semibold text-foreground">Apply Overpaid Credit</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Invoice <strong>{liveApplyInv.invoice_number}</strong> has an overpaid amount of <strong>{formatCurrency(overpaidOf(liveApplyInv))}</strong>. Apply it to reduce another outstanding invoice.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Target Invoice</label>
                <Select value={applyTargetId} onValueChange={v => {
                  setApplyTargetId(v)
                  const tgt = applyTargetOptions.find((i: any) => i.id === v)
                  if (tgt) {
                    const tgtBalance = tgt.total - (tgt.amount_paid ?? 0)
                    const maxApply = Math.min(overpaidOf(liveApplyInv), tgtBalance)
                    setApplyAmount(maxApply.toFixed(2))
                  }
                }}>
                  <SelectTrigger className="mt-1.5 h-10 rounded-xl"><SelectValue placeholder="Select invoice" /></SelectTrigger>
                  <SelectContent>
                    {applyTargetOptions.length === 0
                      ? <SelectItem value="__none__" disabled>No outstanding invoices for this customer</SelectItem>
                      : applyTargetOptions.map((i: any) => (
                          <SelectItem key={i.id} value={i.id}>{i.invoice_number} — Balance {formatCurrency(i.total - (i.amount_paid ?? 0))}</SelectItem>
                        ))
                    }
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Amount to Apply <span className="text-muted-foreground">(max {formatCurrency(overpaidOf(liveApplyInv))})</span>
                </label>
                <Input
                  type="number" min={0.01} step={0.01}
                  max={overpaidOf(liveApplyInv)}
                  value={applyAmount}
                  onChange={e => {
                    const val = Number(e.target.value)
                    const max = overpaidOf(liveApplyInv)
                    setApplyAmount(val > max ? max.toFixed(2) : e.target.value)
                  }}
                  className="mt-1.5 h-10 rounded-xl"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setApplyDialog({ open: false, inv: null })}>Cancel</Button>
              <Button onClick={handleApplyCredit} disabled={overpaidBusy || !applyTargetId || !applyAmount || Number(applyAmount) <= 0} className="bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] text-white hover:opacity-95">
                {overpaidBusy ? "Applying..." : "Apply Credit"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Refund Overpaid to Customer */}
      {refundDialog.open && liveRefundInv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl">
            <h3 className="text-base font-semibold text-foreground">Refund to Customer</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Invoice <strong>{liveRefundInv.invoice_number}</strong> was overpaid by <strong>{formatCurrency(overpaidOf(liveRefundInv))}</strong>. Issue a refund to the customer.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Refund Amount <span className="text-muted-foreground">(max {formatCurrency(overpaidOf(liveRefundInv))})</span>
                </label>
                <Input
                  type="number" min={0.01} step={0.01}
                  max={overpaidOf(liveRefundInv)}
                  value={refundAmount}
                  onChange={e => {
                    const val = Number(e.target.value)
                    const max = overpaidOf(liveRefundInv)
                    setRefundAmount(val > max ? max.toFixed(2) : e.target.value)
                  }}
                  className="mt-1.5 h-10 rounded-xl"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Refund Date</label>
                <Input type="date" value={refundDate} onChange={e => setRefundDate(e.target.value)} className="mt-1.5 h-10 rounded-xl" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Bank Account</label>
                <SearchableSelect
                  value={refundBankAccountId}
                  onChange={setRefundBankAccountId}
                  placeholder="Select bank account"
                  options={bankAccounts.map((a: any) => ({ value: a.id, label: a.name, hint: a.account_number ?? a.bank_name ?? "" }))}
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setRefundDialog({ open: false, inv: null })}>Cancel</Button>
              <Button onClick={handleRefundOverpaid} disabled={overpaidBusy || !refundAmount || Number(refundAmount) <= 0} className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:opacity-95">
                {overpaidBusy ? "Processing..." : "Issue Refund"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
