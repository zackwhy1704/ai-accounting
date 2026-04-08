import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { ViewDetailSheet } from "../../components/ui/view-detail-sheet"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, Search, MoveRight, FileText, XCircle } from "lucide-react"
import api from "../../lib/api"
import { formatDate, cn } from "../../lib/utils"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Badge } from "../../components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table"
import { RowActionsMenu } from "../../components/ui/row-actions"

interface StockTransfer {
  id: string
  transfer_number: string
  transfer_date: string
  from_location: string
  to_location: string
  status: string
}

const statusColors: Record<string, string> = {
  draft: "bg-slate-500/10 text-slate-700 border-slate-400/20",
  completed: "bg-emerald-500/10 text-emerald-700 border-emerald-400/20",
  void: "bg-rose-500/10 text-rose-700 border-rose-400/20",
}

export default function StockTransfersPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [viewItem, setViewItem] = useState<StockTransfer | null>(null)

  const { data: transfers = [], isLoading } = useQuery<StockTransfer[]>({
    queryKey: ["stock-transfers"],
    queryFn: async () => {
      const res = await api.get("/stock-transfers")
      return res.data
    },
  })

  const rows = search.trim()
    ? transfers.filter(t =>
        t.transfer_number.toLowerCase().includes(search.toLowerCase()) ||
        (t.from_location ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (t.to_location ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : transfers

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Stock</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Stock Transfers</div>
          <div className="mt-1 max-w-2xl text-sm text-muted-foreground">Move stock between warehouse locations</div>
        </div>
        <Button
          type="button"
          onClick={() => navigate("/stock/transfers/new")}
          className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white shadow-[0_0_0_1px_rgba(124,157,255,0.25),0_16px_40px_rgba(0,0,0,0.35)] hover:opacity-95"
        >
          <Plus className="mr-2 h-4 w-4" /> New Transfer
        </Button>
      </div>

      <Card className="rounded-2xl border-border bg-card p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="mb-4 relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search transfers..."
            className="h-10 rounded-xl pl-9 text-sm"
          />
        </div>

        {isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <MoveRight className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="mt-4 text-base font-semibold text-foreground">No stock transfers</div>
            <div className="mt-1 text-sm text-muted-foreground">Transfer stock between your warehouse locations</div>
            <Button
              type="button"
              onClick={() => navigate("/stock/transfers/new")}
              className="mt-6 h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white"
            >
              <Plus className="mr-2 h-4 w-4" /> New Transfer
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">No.</TableHead>
                  <TableHead className="text-muted-foreground">Date</TableHead>
                  <TableHead className="text-muted-foreground">From Location</TableHead>
                  <TableHead className="text-muted-foreground">To Location</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(t => (
                  <TableRow key={t.id} className="border-border hover:bg-muted/50">
                    <TableCell className="font-medium text-foreground">{t.transfer_number}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(t.transfer_date)}</TableCell>
                    <TableCell className="text-foreground">{t.from_location || "—"}</TableCell>
                    <TableCell className="text-foreground">{t.to_location || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("rounded-lg px-2 py-0.5 text-[11px] font-semibold", statusColors[t.status] ?? "")}>
                        {t.status.charAt(0).toUpperCase() + t.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActionsMenu actions={[
                        { label: "View", icon: <FileText className="h-4 w-4" />, onClick: () => setViewItem(t) },
                        { label: "Void", icon: <XCircle className="h-4 w-4" />, onClick: () => { if (confirm("Void this transfer?")) api.patch(`/stock/transfers/${t.id}`, { status: "void" }).then(() => queryClient.invalidateQueries({ queryKey: ["stock-transfers"] })) }, danger: true, dividerBefore: true, disabled: t.status === "void" },
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
        title={viewItem ? `Transfer ${viewItem.transfer_number}` : ""}
        subtitle={viewItem?.status ? viewItem.status.charAt(0).toUpperCase() + viewItem.status.slice(1) : undefined}
        fields={viewItem ? [
          { label: "Transfer Number", value: viewItem.transfer_number },
          { label: "Date", value: formatDate(viewItem.transfer_date) },
          { label: "From Location", value: viewItem.from_location || "—" },
          { label: "To Location", value: viewItem.to_location || "—" },
          { label: "Status", value: <Badge variant="outline" className={cn("rounded-lg px-2 py-0.5 text-[11px] font-semibold", statusColors[viewItem.status] ?? "")}>{viewItem.status.charAt(0).toUpperCase() + viewItem.status.slice(1)}</Badge> },
          { label: "Notes", value: "—" },
        ] : []}
      />
    </div>
  )
}
