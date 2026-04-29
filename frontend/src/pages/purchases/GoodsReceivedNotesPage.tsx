import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { ViewDetailSheet } from "../../components/ui/view-detail-sheet"
import { Plus, ClipboardList, FileText, Pencil, Trash2, PackageCheck, Receipt } from "lucide-react"
import { useGoodsReceivedNotes, useContacts, useBills } from "../../lib/hooks"
import api from "../../lib/api"
import { formatDate, cn } from "../../lib/utils"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Badge } from "../../components/ui/badge"
import { RowActionsMenu } from "../../components/ui/row-actions"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table"

const statusColors: Record<string, string> = {
  draft: "bg-slate-500/10 text-slate-700 border-slate-400/20",
  received: "bg-emerald-500/10 text-emerald-700 border-emerald-400/20",
  billed: "bg-violet-500/10 text-violet-700 border-violet-400/20",
}

export default function GoodsReceivedNotesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: grns = [], isLoading } = useGoodsReceivedNotes()
  const { data: contacts = [] } = useContacts()
  const { data: bills = [] } = useBills()
  const [viewItem, setViewItem] = useState<typeof grns[0] | null>(null)

  const contactMap = useMemo(() => {
    const m = new Map<string, string>()
    contacts.forEach(c => m.set(c.id, c.name))
    return m
  }, [contacts])

  const billMap = useMemo(() => {
    const m = new Map<string, string>()
    bills.forEach((b: any) => m.set(b.id, b.bill_number))
    return m
  }, [bills])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Purchases</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Goods Received Notes</div>
          <div className="mt-1 max-w-2xl text-sm text-muted-foreground">Record items received from suppliers</div>
        </div>
        <Button
          type="button"
          onClick={() => navigate("/purchases/goods-received-notes/new")}
          className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white shadow-[0_0_0_1px_rgba(124,157,255,0.25),0_16px_40px_rgba(0,0,0,0.35)] hover:opacity-95"
        >
          <Plus className="mr-2 h-4 w-4" /> New GRN
        </Button>
      </div>

      <Card className="rounded-2xl border-border bg-card p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        {isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading...</div>
        ) : grns.length === 0 ? (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">GRN No.</TableHead>
                  <TableHead className="text-muted-foreground">Date</TableHead>
                  <TableHead className="text-muted-foreground">Supplier</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell colSpan={5}>
                    <div className="py-8 text-center">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                        <ClipboardList className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <div className="mt-4 text-base font-semibold text-foreground">No goods received notes</div>
                      <div className="mt-1 text-sm text-muted-foreground">Record deliveries from your suppliers to update stock levels</div>
                      <Button
                        type="button"
                        onClick={() => navigate("/purchases/goods-received-notes/new")}
                        className="mt-6 h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white"
                      >
                        <Plus className="mr-2 h-4 w-4" /> New GRN
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
                  <TableHead className="text-muted-foreground">GRN No.</TableHead>
                  <TableHead className="text-muted-foreground">Date</TableHead>
                  <TableHead className="text-muted-foreground">Supplier</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {grns.map(grn => (
                  <TableRow key={grn.id} className="border-border hover:bg-muted/50">
                    <TableCell className="font-medium text-foreground">{grn.grn_number}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(grn.received_date)}</TableCell>
                    <TableCell className="text-foreground">{contactMap.get(grn.contact_id) ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("rounded-lg px-2 py-0.5 text-[11px] font-semibold", statusColors[grn.status] ?? "")}>
                        {grn.status.charAt(0).toUpperCase() + grn.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActionsMenu actions={[
                        { label: "View", icon: <FileText className="h-3.5 w-3.5" />, onClick: () => setViewItem(grn) },
                        { label: "Edit", icon: <Pencil className="h-3.5 w-3.5" />, onClick: () => navigate(`/purchases/goods-received-notes/${grn.id}/edit`) },
                        { label: "Mark as Received", icon: <PackageCheck className="h-3.5 w-3.5" />, onClick: () => api.patch(`/goods-received-notes/${grn.id}/status`, null, { params: { status: "received" } }).then(() => queryClient.invalidateQueries({ queryKey: ["goods-received-notes"] })), dividerBefore: true, disabled: grn.status !== "draft" },
                        { label: "Mark as Billed", icon: <Receipt className="h-3.5 w-3.5" />, onClick: () => api.patch(`/goods-received-notes/${grn.id}/status`, null, { params: { status: "billed" } }).then(() => queryClient.invalidateQueries({ queryKey: ["goods-received-notes"] })), disabled: grn.status === "billed" || grn.status === "draft" },
                        { label: "Delete", icon: <Trash2 className="h-3.5 w-3.5" />, onClick: () => { if (confirm("Delete this GRN?")) api.delete(`/goods-received-notes/${grn.id}`).then(() => queryClient.invalidateQueries({ queryKey: ["goods-received-notes"] })) }, danger: true, dividerBefore: true, disabled: grn.status === "billed" },
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
        title={viewItem ? `GRN ${viewItem.grn_number}` : ""}
        subtitle={viewItem?.status ? viewItem.status.charAt(0).toUpperCase() + viewItem.status.slice(1) : undefined}
        fields={viewItem ? [
          { label: "GRN Number", value: viewItem.grn_number },
          { label: "Status", value: <Badge variant="outline" className={cn("rounded-lg px-2 py-0.5 text-[11px] font-semibold", statusColors[viewItem.status] ?? "")}>{viewItem.status.charAt(0).toUpperCase() + viewItem.status.slice(1)}</Badge> },
          { label: "Vendor", value: contactMap.get(viewItem.contact_id) ?? "—" },
          { label: "Date", value: formatDate(viewItem.received_date) },
          { label: "Bill Reference", value: viewItem.bill_id ? (billMap.get(viewItem.bill_id) ?? viewItem.bill_id) : "—" },
        ] : []}
      />
    </div>
  )
}
