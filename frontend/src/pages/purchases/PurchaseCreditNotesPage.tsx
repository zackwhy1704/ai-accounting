import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { ViewDetailSheet } from "../../components/ui/view-detail-sheet"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, Search, FileX, FileText, ArrowRightLeft, XCircle } from "lucide-react"
import api from "../../lib/api"
import { formatCurrency, formatDate, cn } from "../../lib/utils"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Badge } from "../../components/ui/badge"
import { RowActionsMenu } from "../../components/ui/row-actions"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table"

interface VendorCredit {
  id: string
  credit_number: string
  credit_date: string
  contact_name: string
  total: number
  currency: string
  status: string
}

const statusColors: Record<string, string> = {
  draft: "bg-slate-500/10 text-slate-700 border-slate-400/20",
  applied: "bg-emerald-500/10 text-emerald-700 border-emerald-400/20",
  void: "bg-rose-500/10 text-rose-700 border-rose-400/20",
  open: "bg-blue-500/10 text-blue-700 border-blue-400/20",
}

export default function PurchaseCreditNotesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [viewItem, setViewItem] = useState<VendorCredit | null>(null)

  const { data: credits = [], isLoading } = useQuery<VendorCredit[]>({
    queryKey: ["vendor-credits"],
    queryFn: async () => {
      const res = await api.get("/vendor-credits")
      return res.data
    },
  })

  const rows = search.trim()
    ? credits.filter(c =>
        c.credit_number.toLowerCase().includes(search.toLowerCase()) ||
        (c.contact_name ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : credits

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Purchases</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Credit Notes from Suppliers</div>
          <div className="mt-1 max-w-2xl text-sm text-muted-foreground">Credit notes received from suppliers</div>
        </div>
        <Button
          type="button"
          onClick={() => navigate("/purchases/vendor-credits/new")}
          className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white shadow-[0_0_0_1px_rgba(124,157,255,0.25),0_16px_40px_rgba(0,0,0,0.35)] hover:opacity-95"
        >
          <Plus className="mr-2 h-4 w-4" /> New Credit Note
        </Button>
      </div>

      <Card className="rounded-2xl border-border bg-card p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="mb-4 relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search credit notes..."
            className="h-10 rounded-xl pl-9 text-sm"
          />
        </div>

        {isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <FileX className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="mt-4 text-base font-semibold text-foreground">No credit notes</div>
            <div className="mt-1 text-sm text-muted-foreground">Record credit notes received from your suppliers</div>
            <Button
              type="button"
              onClick={() => navigate("/purchases/vendor-credits/new")}
              className="mt-6 h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white"
            >
              <Plus className="mr-2 h-4 w-4" /> New Credit Note
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
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(c => (
                  <TableRow key={c.id} className="border-border hover:bg-muted/50">
                    <TableCell className="font-medium text-foreground">{c.credit_number}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(c.credit_date)}</TableCell>
                    <TableCell className="text-foreground">{c.contact_name || "—"}</TableCell>
                    <TableCell className="text-right text-foreground">{formatCurrency(c.total, c.currency)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("rounded-lg px-2 py-0.5 text-[11px] font-semibold", statusColors[c.status] ?? "")}>
                        {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActionsMenu actions={[
                        { label: "View", icon: <FileText className="h-3.5 w-3.5" />, onClick: () => setViewItem(c) },
                        { label: "Apply to Bill", icon: <ArrowRightLeft className="h-3.5 w-3.5" />, onClick: () => navigate(`/purchases/bills/new?credit_id=${c.id}`), dividerBefore: true, disabled: c.status === "void" || c.status === "applied" },
                        { label: "Void", icon: <XCircle className="h-3.5 w-3.5" />, onClick: () => { if (confirm("Void this credit note?")) api.patch(`/purchase-credit-notes/${c.id}`, { status: "void" }).then(() => queryClient.invalidateQueries({ queryKey: ["vendor-credits"] })) }, danger: true, dividerBefore: true, disabled: c.status === "void" || c.status === "applied" },
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
        title={viewItem ? `CN ${viewItem.credit_number}` : ""}
        subtitle={viewItem?.status ? viewItem.status.charAt(0).toUpperCase() + viewItem.status.slice(1) : undefined}
        fields={viewItem ? [
          { label: "CN Number", value: viewItem.credit_number },
          { label: "Status", value: <Badge variant="outline" className={cn("rounded-lg px-2 py-0.5 text-[11px] font-semibold", statusColors[viewItem.status] ?? "")}>{viewItem.status.charAt(0).toUpperCase() + viewItem.status.slice(1)}</Badge> },
          { label: "Vendor", value: viewItem.contact_name || "—" },
          { label: "Date", value: formatDate(viewItem.credit_date) },
          { label: "Total", value: formatCurrency(viewItem.total, viewItem.currency) },
        ] : []}
      />
    </div>
  )
}
