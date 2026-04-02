import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { ViewDetailSheet } from "../../components/ui/view-detail-sheet"
import { useQuery } from "@tanstack/react-query"
import { Plus, Search, SlidersHorizontal, FileText, CheckCircle2, XCircle } from "lucide-react"
import api from "../../lib/api"
import { formatDate, cn } from "../../lib/utils"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Badge } from "../../components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"
import { RowActionsMenu } from "../../components/ui/row-actions"

interface StockAdjustment {
  id: string
  adjustment_number: string
  adjustment_date: string
  reference_number: string
  reason: string
  status: "draft" | "confirmed" | "void"
}

const statusColors: Record<string, string> = {
  draft: "bg-slate-500/10 text-slate-700 border-slate-400/20",
  confirmed: "bg-emerald-500/10 text-emerald-700 border-emerald-400/20",
  void: "bg-rose-500/10 text-rose-700 border-rose-400/20",
}

export default function StockAdjustmentsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState("")
  const [viewItem, setViewItem] = useState<StockAdjustment | null>(null)
  const [statusFilter, setStatusFilter] = useState("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  const { data: adjustments = [], isLoading } = useQuery<StockAdjustment[]>({
    queryKey: ["stock-adjustments"],
    queryFn: async () => {
      const res = await api.get("/stock-adjustments")
      return res.data
    },
  })

  const rows = adjustments.filter(a => {
    if (statusFilter !== "all" && a.status !== statusFilter) return false
    if (dateFrom && a.adjustment_date < dateFrom) return false
    if (dateTo && a.adjustment_date > dateTo) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      if (
        !a.adjustment_number.toLowerCase().includes(q) &&
        !(a.reference_number ?? "").toLowerCase().includes(q) &&
        !(a.reason ?? "").toLowerCase().includes(q)
      ) return false
    }
    return true
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Stock</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Adjustments</div>
          <div className="mt-1 max-w-2xl text-sm text-muted-foreground">Adjustments made to your stock balances</div>
        </div>
        <Button
          type="button"
          onClick={() => navigate("/stock/adjustments/new")}
          className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white shadow-[0_0_0_1px_rgba(124,157,255,0.25),0_16px_40px_rgba(0,0,0,0.35)] hover:opacity-95"
        >
          <Plus className="mr-2 h-4 w-4" /> New Adjustment
        </Button>
      </div>

      <Card className="min-h-[calc(100vh-220px)] rounded-2xl border-border bg-card p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search adjustments..."
              className="h-10 rounded-xl pl-9 text-sm"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-10 w-36 rounded-xl text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="void">Void</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="h-10 rounded-xl text-sm w-40"
          />
          <Input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="h-10 rounded-xl text-sm w-40"
          />
        </div>

        {isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <SlidersHorizontal className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="mt-4 text-base font-semibold text-foreground">No stock adjustments</div>
            <div className="mt-1 text-sm text-muted-foreground">Create an adjustment to update your stock quantities</div>
            <Button
              type="button"
              onClick={() => navigate("/stock/adjustments/new")}
              className="mt-6 h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white"
            >
              <Plus className="mr-2 h-4 w-4" /> New Adjustment
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">No.</TableHead>
                  <TableHead className="text-muted-foreground">Date</TableHead>
                  <TableHead className="text-muted-foreground">Reference No.</TableHead>
                  <TableHead className="text-muted-foreground">Reason</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="w-[90px] text-right text-muted-foreground">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(a => (
                  <TableRow key={a.id} className="border-border hover:bg-muted/50">
                    <TableCell className="font-medium text-foreground">{a.adjustment_number}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(a.adjustment_date)}</TableCell>
                    <TableCell className="text-muted-foreground">{a.reference_number || "—"}</TableCell>
                    <TableCell className="text-foreground">{a.reason || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("rounded-lg px-2 py-0.5 text-[11px] font-semibold", statusColors[a.status] ?? "")}>
                        {a.status.charAt(0).toUpperCase() + a.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActionsMenu actions={[
                        { label: "View", icon: <FileText className="h-4 w-4" />, onClick: () => setViewItem(a) },
                        { label: "Confirm", icon: <CheckCircle2 className="h-4 w-4" />, onClick: () => { api.patch(`/stock-adjustments/${a.id}`, { status: "confirmed" }).then(() => window.location.reload()) }, disabled: a.status !== "draft", dividerBefore: true },
                        { label: "Void", icon: <XCircle className="h-4 w-4" />, onClick: () => { if (window.confirm("Void this adjustment?")) api.patch(`/stock-adjustments/${a.id}`, { status: "void" }).then(() => window.location.reload()) }, danger: true, dividerBefore: true, disabled: a.status === "void" },
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
        title={viewItem ? `Adjustment ${viewItem.adjustment_number}` : ""}
        subtitle={viewItem?.status ? viewItem.status.charAt(0).toUpperCase() + viewItem.status.slice(1) : undefined}
        fields={viewItem ? [
          { label: "Adjustment Number", value: viewItem.adjustment_number },
          { label: "Date", value: formatDate(viewItem.adjustment_date) },
          { label: "Reason", value: viewItem.reason || "—" },
          { label: "Status", value: <Badge variant="outline" className={cn("rounded-lg px-2 py-0.5 text-[11px] font-semibold", statusColors[viewItem.status] ?? "")}>{viewItem.status.charAt(0).toUpperCase() + viewItem.status.slice(1)}</Badge> },
          { label: "Notes", value: viewItem.reference_number || "—" },
        ] : []}
      />
    </div>
  )
}
