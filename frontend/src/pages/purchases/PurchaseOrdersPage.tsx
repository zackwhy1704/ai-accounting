import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { ViewDetailSheet } from "../../components/ui/view-detail-sheet"
import { Plus, ShoppingCart, FileText, Pencil, ArrowRightLeft, Copy, XCircle, Send, PackageCheck, Trash2 } from "lucide-react"
import { usePurchaseOrders, useContacts } from "../../lib/hooks"
import api from "../../lib/api"
import { formatCurrency, formatDate, cn } from "../../lib/utils"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Badge } from "../../components/ui/badge"
import { RowActionsMenu } from "../../components/ui/row-actions"
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table"

const statusColors: Record<string, string> = {
  draft: "bg-slate-500/10 text-slate-700 border-slate-400/20",
  sent: "bg-blue-500/10 text-blue-700 border-blue-400/20",
  received: "bg-emerald-500/10 text-emerald-700 border-emerald-400/20",
  billed: "bg-violet-500/10 text-violet-700 border-violet-400/20",
  cancelled: "bg-rose-500/10 text-rose-700 border-rose-400/20",
}

const STATUS_TABS = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Sent", value: "sent" },
  { label: "Received", value: "received" },
  { label: "Billed", value: "billed" },
  { label: "Cancelled", value: "cancelled" },
]

export default function PurchaseOrdersPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState("all")
  const { data: purchaseOrders = [], isLoading } = usePurchaseOrders(tab === "all" ? undefined : tab)
  const { data: contacts = [] } = useContacts()
  const [viewItem, setViewItem] = useState<typeof purchaseOrders[0] | null>(null)

  const contactMap = useMemo(() => {
    const m = new Map<string, string>()
    contacts.forEach(c => m.set(c.id, c.name))
    return m
  }, [contacts])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Purchases</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Purchase Orders</div>
          <div className="mt-1 max-w-2xl text-sm text-muted-foreground">Track orders placed with your suppliers</div>
        </div>
        <Button
          type="button"
          onClick={() => navigate("/purchases/purchase-orders/new")}
          className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white shadow-[0_0_0_1px_rgba(124,157,255,0.25),0_16px_40px_rgba(0,0,0,0.35)] hover:opacity-95"
        >
          <Plus className="mr-2 h-4 w-4" /> New Order
        </Button>
      </div>

      <Card className="rounded-2xl border-border bg-card p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="h-auto flex-wrap justify-start gap-1 rounded-xl bg-muted p-1 mb-4">
            {STATUS_TABS.map(st => (
              <TabsTrigger key={st.value} value={st.value} className="rounded-lg px-3 py-1.5 text-xs">{st.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading...</div>
        ) : purchaseOrders.length === 0 ? (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">No.</TableHead>
                  <TableHead className="text-muted-foreground">Date</TableHead>
                  <TableHead className="text-muted-foreground">Supplier</TableHead>
                  <TableHead className="text-muted-foreground">Expected Date</TableHead>
                  <TableHead className="text-right text-muted-foreground">Total</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell colSpan={7}>
                    <div className="py-8 text-center">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                        <ShoppingCart className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <div className="mt-4 text-base font-semibold text-foreground">No purchase orders yet</div>
                      <div className="mt-1 text-sm text-muted-foreground">Create purchase orders to track what you order from suppliers</div>
                      <Button
                        type="button"
                        onClick={() => navigate("/purchases/purchase-orders/new")}
                        className="mt-6 h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white"
                      >
                        <Plus className="mr-2 h-4 w-4" /> New Order
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">No.</TableHead>
                  <TableHead className="text-muted-foreground">Date</TableHead>
                  <TableHead className="text-muted-foreground">Supplier</TableHead>
                  <TableHead className="text-muted-foreground">Expected Date</TableHead>
                  <TableHead className="text-right text-muted-foreground">Total</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchaseOrders.map(po => (
                  <TableRow key={po.id} className="border-border hover:bg-muted/50">
                    <TableCell className="font-medium text-foreground">{po.po_number}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(po.issue_date)}</TableCell>
                    <TableCell className="text-foreground">{contactMap.get(po.contact_id) ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{po.expected_date ? formatDate(po.expected_date) : "—"}</TableCell>
                    <TableCell className="text-right text-foreground">{formatCurrency(po.total, po.currency)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("rounded-lg px-2 py-0.5 text-[11px] font-semibold", statusColors[po.status] ?? "")}>
                        {po.status.charAt(0).toUpperCase() + po.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActionsMenu actions={[
                        { label: "View", icon: <FileText className="h-3.5 w-3.5" />, onClick: () => setViewItem(po) },
                        { label: "Edit", icon: <Pencil className="h-3.5 w-3.5" />, onClick: () => navigate(`/purchases/purchase-orders/${po.id}/edit`), disabled: po.status === "cancelled" || po.status === "void" },
                        { label: "Mark as Sent", icon: <Send className="h-3.5 w-3.5" />, onClick: () => api.patch(`/purchase-orders/${po.id}`, { status: "sent" }).then(() => queryClient.invalidateQueries({ queryKey: ["purchase-orders"] })), dividerBefore: true, disabled: po.status !== "draft" },
                        { label: "Mark as Received", icon: <PackageCheck className="h-3.5 w-3.5" />, onClick: () => api.patch(`/purchase-orders/${po.id}`, { status: "received" }).then(() => queryClient.invalidateQueries({ queryKey: ["purchase-orders"] })), disabled: po.status !== "sent" },
                        { label: "Convert to Bill", icon: <ArrowRightLeft className="h-3.5 w-3.5" />, onClick: () => navigate(`/purchases/bills/new?from_po=${po.id}`), dividerBefore: true, disabled: po.status === "cancelled" || po.status === "void" || po.status === "draft" },
                        { label: "Duplicate", icon: <Copy className="h-3.5 w-3.5" />, onClick: () => navigate(`/purchases/orders/new?copy=${po.id}`) },
                        { label: "Cancel", icon: <XCircle className="h-3.5 w-3.5" />, onClick: () => { if (confirm("Cancel this purchase order?")) api.patch(`/purchase-orders/${po.id}`, { status: "cancelled" }).then(() => queryClient.invalidateQueries({ queryKey: ["purchase-orders"] })) }, danger: true, dividerBefore: true, disabled: po.status === "cancelled" || po.status === "billed" },
                        { label: "Delete", icon: <Trash2 className="h-3.5 w-3.5" />, onClick: () => { if (confirm("Delete this purchase order?")) api.delete(`/purchase-orders/${po.id}`).then(() => queryClient.invalidateQueries({ queryKey: ["purchase-orders"] })) }, danger: true, disabled: po.status === "billed" },
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
        title={viewItem ? `PO ${viewItem.po_number}` : ""}
        subtitle={viewItem?.status ? viewItem.status.charAt(0).toUpperCase() + viewItem.status.slice(1) : undefined}
        fields={viewItem ? [
          { label: "PO Number", value: viewItem.po_number },
          { label: "Status", value: <Badge variant="outline" className={cn("rounded-lg px-2 py-0.5 text-[11px] font-semibold", statusColors[viewItem.status] ?? "")}>{viewItem.status.charAt(0).toUpperCase() + viewItem.status.slice(1)}</Badge> },
          { label: "Vendor", value: contactMap.get(viewItem.contact_id) ?? "—" },
          { label: "Date", value: formatDate(viewItem.issue_date) },
          { label: "Total", value: formatCurrency(viewItem.total, viewItem.currency) },
          { label: "Currency", value: viewItem.currency ?? "MYR" },
        ] : []}
      />
    </div>
  )
}
