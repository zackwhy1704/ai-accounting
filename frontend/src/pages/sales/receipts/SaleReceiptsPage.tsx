import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Plus, Search, Download, Receipt, FileText, XCircle } from "lucide-react"
import { useSaleReceipts, useContacts } from "../../../lib/hooks"
import { formatCurrency, formatDate, cn } from "../../../lib/utils"
import { Card } from "../../../components/ui/card"
import { Button } from "../../../components/ui/button"
import { Input } from "../../../components/ui/input"
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

export default function SaleReceiptsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState("")
  const { data: receipts = [], isLoading } = useSaleReceipts()
  const { data: contacts = [] } = useContacts()

  const contactMap = useMemo(() => {
    const m = new Map<string, string>()
    contacts.forEach(c => m.set(c.id, c.name))
    return m
  }, [contacts])

  const rows = useMemo(() => {
    if (!search.trim()) return receipts
    const q = search.toLowerCase()
    return receipts.filter(r =>
      r.receipt_number.toLowerCase().includes(q) ||
      (r.contact_id ? (contactMap.get(r.contact_id) ?? "") : "").toLowerCase().includes(q)
    )
  }, [receipts, search, contactMap])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Sales</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Sale Receipts</div>
          <div className="mt-1 max-w-2xl text-sm text-muted-foreground">Record cash sales with immediate payment collection</div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" className="h-9 rounded-xl px-3 text-xs font-semibold shadow-sm">
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
          <Button type="button" onClick={() => navigate("/sales/receipts/new")} className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white shadow-[0_0_0_1px_rgba(124,157,255,0.25),0_16px_40px_rgba(0,0,0,0.35)] hover:opacity-95">
            <Plus className="mr-2 h-4 w-4" /> New Receipt
          </Button>
        </div>
      </div>

      <Card className="rounded-2xl border-border bg-card p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="mb-4 relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search receipts..." className="h-10 rounded-xl pl-9 text-sm" />
        </div>

        {isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
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
                  <TableHead className="text-muted-foreground">No.</TableHead>
                  <TableHead className="text-muted-foreground">Date</TableHead>
                  <TableHead className="text-muted-foreground">Customer</TableHead>
                  <TableHead className="text-muted-foreground">Payment</TableHead>
                  <TableHead className="text-right text-muted-foreground">Total</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(r => (
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
                        { label: "View", icon: <FileText className="h-4 w-4" />, onClick: () => navigate(`/sales/receipts/${r.id}`) },
                        { label: "Download Receipt", icon: <Download className="h-4 w-4" />, onClick: () => window.print(), dividerBefore: true },
                        { label: "Void", icon: <XCircle className="h-4 w-4" />, onClick: () => {}, danger: true, dividerBefore: true },
                      ]} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  )
}
