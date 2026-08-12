import { useState } from "react"
import { Loader2, Plus, ClipboardList } from "lucide-react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { useToast } from "../../components/ui/toast"
import { formatCurrency, formatDate } from "../../lib/utils"
import api from "../../lib/api"

interface StockTake {
  id: string
  stock_take_number: string
  status: string
  count_date: string | null
  counted: number
  total_lines: number
  variance_value: number
  completed_at: string | null
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-amber-100 text-amber-700",
  completed: "bg-emerald-100 text-emerald-700",
  void: "bg-slate-100 text-slate-600",
}

export default function StockTakesPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)

  const { data: page, isLoading } = useQuery<{ items: StockTake[] }>({
    queryKey: ["stock-takes"],
    queryFn: () => api.get("/stock-takes", { params: { limit: 100 } }).then(r => r.data),
  })
  const takes = page?.items ?? []

  const create = useMutation({
    mutationFn: () => api.post("/stock-takes", {}).then(r => r.data),
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ["stock-takes"] })
      toast(`Worksheet ${d.stock_take_number} created`, "success")
      navigate(`/stock/stock-takes/${d.id}`)
    },
    onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to create stock take", "warning"),
    onSettled: () => setCreating(false),
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Stocks</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Stock Takes</div>
          <div className="mt-1 text-sm text-muted-foreground">Physical count worksheets — variances post to stock and GL on completion</div>
        </div>
        <Button
          type="button"
          onClick={() => { setCreating(true); create.mutate() }}
          disabled={creating}
          className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white"
        >
          {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          New Stock Take
        </Button>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…
        </div>
      ) : takes.length === 0 ? (
        <Card className="rounded-2xl border-border bg-card p-12 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <ClipboardList className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="text-sm font-semibold text-foreground">No stock takes yet</div>
          <div className="mt-1 text-xs text-muted-foreground">Create a worksheet to snapshot expected quantities and start counting</div>
        </Card>
      ) : (
        <Card className="rounded-2xl border-border bg-card shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Number</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Counted</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Variance Value</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {takes.map(t => (
                <tr
                  key={t.id}
                  className="border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer"
                  onClick={() => navigate(`/stock/stock-takes/${t.id}`)}
                >
                  <td className="px-4 py-2.5 text-sm font-medium text-foreground">{t.stock_take_number}</td>
                  <td className="px-4 py-2.5 text-sm text-muted-foreground">{t.count_date ? formatDate(t.count_date) : "—"}</td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums text-muted-foreground">{t.counted} / {t.total_lines}</td>
                  <td className={`px-4 py-2.5 text-right text-sm tabular-nums ${t.variance_value < 0 ? "text-rose-600" : t.variance_value > 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                    {formatCurrency(t.variance_value)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_COLORS[t.status] ?? "bg-slate-100 text-slate-600"}`}>
                      {t.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
