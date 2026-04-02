import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { ViewDetailSheet } from "../../components/ui/view-detail-sheet"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, Search, CreditCard, FileText, Download, XCircle } from "lucide-react"
import api from "../../lib/api"
import { formatCurrency, formatDate, cn } from "../../lib/utils"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Badge } from "../../components/ui/badge"
import { RowActionsMenu } from "../../components/ui/row-actions"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table"

interface PurchasePayment {
  id: string
  payment_number: string
  payment_date: string
  contact_name: string
  amount: number
  currency: string
  payment_method: string
  status: string
}

const statusColors: Record<string, string> = {
  completed: "bg-emerald-500/10 text-emerald-700 border-emerald-400/20",
  pending: "bg-amber-500/10 text-amber-700 border-amber-400/20",
  void: "bg-rose-500/10 text-rose-700 border-rose-400/20",
}

const methodLabel: Record<string, string> = {
  bank_transfer: "Bank Transfer",
  cash: "Cash",
  cheque: "Cheque",
  online_payment: "Online",
  fpx: "FPX",
  card: "Card",
}

export default function PurchasePaymentsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [viewItem, setViewItem] = useState<PurchasePayment | null>(null)

  const { data: payments = [], isLoading } = useQuery<PurchasePayment[]>({
    queryKey: ["purchase-payments"],
    queryFn: async () => {
      const res = await api.get("/purchase-payments")
      return res.data
    },
  })

  const rows = search.trim()
    ? payments.filter(p =>
        p.payment_number.toLowerCase().includes(search.toLowerCase()) ||
        (p.contact_name ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : payments

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Purchases</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Purchase Payments</div>
          <div className="mt-1 max-w-2xl text-sm text-muted-foreground">Track payments made to your suppliers</div>
        </div>
        <Button
          type="button"
          onClick={() => navigate("/purchases/payments/new")}
          className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white shadow-[0_0_0_1px_rgba(124,157,255,0.25),0_16px_40px_rgba(0,0,0,0.35)] hover:opacity-95"
        >
          <Plus className="mr-2 h-4 w-4" /> New Payment
        </Button>
      </div>

      <Card className="rounded-2xl border-border bg-card p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="mb-4 relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search payments..."
            className="h-10 rounded-xl pl-9 text-sm"
          />
        </div>

        {isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <CreditCard className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="mt-4 text-base font-semibold text-foreground">No purchase payments</div>
            <div className="mt-1 text-sm text-muted-foreground">Record payments made to your suppliers</div>
            <Button
              type="button"
              onClick={() => navigate("/purchases/payments/new")}
              className="mt-6 h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white"
            >
              <Plus className="mr-2 h-4 w-4" /> New Payment
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">No.</TableHead>
                  <TableHead className="text-muted-foreground">Date</TableHead>
                  <TableHead className="text-muted-foreground">Supplier</TableHead>
                  <TableHead className="text-right text-muted-foreground">Amount</TableHead>
                  <TableHead className="text-muted-foreground">Method</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(p => (
                  <TableRow key={p.id} className="border-border hover:bg-muted/50">
                    <TableCell className="font-medium text-foreground">{p.payment_number}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(p.payment_date)}</TableCell>
                    <TableCell className="text-foreground">{p.contact_name || "—"}</TableCell>
                    <TableCell className="text-right text-foreground">{formatCurrency(p.amount, p.currency)}</TableCell>
                    <TableCell className="text-muted-foreground">{methodLabel[p.payment_method] ?? p.payment_method}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("rounded-lg px-2 py-0.5 text-[11px] font-semibold", statusColors[p.status] ?? "")}>
                        {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActionsMenu actions={[
                        { label: "View", icon: <FileText className="h-3.5 w-3.5" />, onClick: () => setViewItem(p) },
                        { label: "Download Receipt", icon: <Download className="h-3.5 w-3.5" />, onClick: () => window.print(), dividerBefore: true },
                        { label: "Void", icon: <XCircle className="h-3.5 w-3.5" />, onClick: () => { if (confirm("Void this payment?")) api.patch(`/purchase-payments/${p.id}`, { status: "void" }).then(() => queryClient.invalidateQueries({ queryKey: ["purchase-payments"] })) }, danger: true, dividerBefore: true },
                      ]} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
      <ViewDetailSheet
        open={!!viewItem}
        onOpenChange={(open) => { if (!open) setViewItem(null) }}
        title={viewItem ? `Payment ${viewItem.payment_number}` : ""}
        subtitle={viewItem?.status ? viewItem.status.charAt(0).toUpperCase() + viewItem.status.slice(1) : undefined}
        fields={viewItem ? [
          { label: "Payment Number", value: viewItem.payment_number },
          { label: "Status", value: <Badge variant="outline" className={cn("rounded-lg px-2 py-0.5 text-[11px] font-semibold", statusColors[viewItem.status] ?? "")}>{viewItem.status.charAt(0).toUpperCase() + viewItem.status.slice(1)}</Badge> },
          { label: "Vendor", value: viewItem.contact_name || "—" },
          { label: "Date", value: formatDate(viewItem.payment_date) },
          { label: "Amount", value: formatCurrency(viewItem.amount, viewItem.currency) },
          { label: "Method", value: methodLabel[viewItem.payment_method] ?? viewItem.payment_method },
          { label: "Reference", value: viewItem.payment_number },
        ] : []}
      />
    </div>
  )
}
