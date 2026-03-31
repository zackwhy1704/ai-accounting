import { useNavigate } from "react-router-dom"
import { Plus, ClipboardList } from "lucide-react"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Badge } from "../../components/ui/badge"
import { cn } from "../../lib/utils"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table"

const statusColors: Record<string, string> = {
  draft: "bg-slate-500/10 text-slate-700 border-slate-400/20",
  received: "bg-emerald-500/10 text-emerald-700 border-emerald-400/20",
  partial: "bg-amber-500/10 text-amber-700 border-amber-400/20",
  cancelled: "bg-rose-500/10 text-rose-700 border-rose-400/20",
}

export default function GoodsReceivedNotesPage() {
  const navigate = useNavigate()

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
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">GRN No.</TableHead>
                <TableHead className="text-muted-foreground">Date</TableHead>
                <TableHead className="text-muted-foreground">Supplier</TableHead>
                <TableHead className="text-muted-foreground">PO Ref</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="py-8 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                      <ClipboardList className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div className="mt-4 text-base font-semibold text-foreground">No goods received notes</div>
                    <div className="mt-1 text-sm text-muted-foreground">Record deliveries from your suppliers to update stock levels</div>
                    <div className="mt-3 flex flex-wrap justify-center gap-2">
                      {(["draft", "received", "partial", "cancelled"] as const).map(s => (
                        <Badge key={s} variant="outline" className={cn("rounded-lg px-2 py-0.5 text-[11px] font-semibold", statusColors[s])}>
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                        </Badge>
                      ))}
                    </div>
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
      </Card>
    </div>
  )
}
