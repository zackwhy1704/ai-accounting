import { useEffect, useState } from "react"
import { Loader2, Save, CheckCircle2, Ban, Printer, ArrowLeft } from "lucide-react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useParams } from "react-router-dom"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { useToast } from "../../components/ui/toast"
import { formatCurrency, formatDate, printReport } from "../../lib/utils"
import api from "../../lib/api"

interface TakeLine {
  product_id: string
  code: string | null
  name: string
  unit: string | null
  expected_qty: number
  counted_qty: number | null
  unit_cost: number
}

interface StockTakeDetail {
  id: string
  stock_take_number: string
  status: string
  count_date: string | null
  notes: string | null
  lines: TakeLine[]
  counted: number
  total_lines: number
  variance_value: number
}

export default function StockTakeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const qc = useQueryClient()
  const [counts, setCounts] = useState<Record<string, string>>({})

  const { data: take, isLoading } = useQuery<StockTakeDetail>({
    queryKey: ["stock-take", id],
    queryFn: () => api.get(`/stock-takes/${id}`).then(r => r.data),
    enabled: !!id,
  })

  useEffect(() => {
    if (!take) return
    const m: Record<string, string> = {}
    take.lines.forEach(l => { m[l.product_id] = l.counted_qty !== null ? String(l.counted_qty) : "" })
    setCounts(m)
  }, [take])

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["stock-take", id] })
    qc.invalidateQueries({ queryKey: ["stock-takes"] })
  }

  const saveCounts = useMutation({
    mutationFn: () => {
      const payload: Record<string, number> = {}
      Object.entries(counts).forEach(([pid, v]) => {
        if (v !== "") payload[pid] = parseFloat(v) || 0
      })
      return api.patch(`/stock-takes/${id}`, { counts: payload }).then(r => r.data)
    },
    onSuccess: () => { invalidate(); toast("Counts saved", "success") },
    onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to save counts", "warning"),
  })

  const complete = useMutation({
    mutationFn: async () => {
      const payload: Record<string, number> = {}
      Object.entries(counts).forEach(([pid, v]) => {
        if (v !== "") payload[pid] = parseFloat(v) || 0
      })
      await api.patch(`/stock-takes/${id}`, { counts: payload })
      return api.post(`/stock-takes/${id}/complete`).then(r => r.data)
    },
    onSuccess: (d: any) => {
      invalidate()
      qc.invalidateQueries({ queryKey: ["products"] })
      toast(`Completed — ${d.adjusted_lines} adjustment(s), ${formatCurrency(d.posted_value)} posted`, "success")
    },
    onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to complete stock take", "warning"),
  })

  const voidTake = useMutation({
    mutationFn: () => api.post(`/stock-takes/${id}/void`).then(r => r.data),
    onSuccess: () => { invalidate(); toast("Stock take voided — movements reversed", "success") },
    onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to void", "warning"),
  })

  if (isLoading || !take) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading worksheet…
      </div>
    )
  }

  const editable = take.status === "draft"
  const varianceOf = (l: TakeLine) => {
    const v = counts[l.product_id]
    if (v === "" || v === undefined) return null
    return (parseFloat(v) || 0) - l.expected_qty
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <div>
          <button type="button" onClick={() => navigate("/stock/stock-takes")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground print:hidden">
            <ArrowLeft className="h-3 w-3" /> Stock Takes
          </button>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{take.stock_take_number}</div>
          <div className="mt-1 text-sm text-muted-foreground">
            {take.count_date ? formatDate(take.count_date) : ""} · {take.counted}/{take.total_lines} counted ·{" "}
            <span className="capitalize">{take.status}</span>
          </div>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={printReport}>
            <Printer className="mr-1.5 h-3.5 w-3.5" /> Worksheet
          </Button>
          {editable && (
            <>
              <Button variant="outline" size="sm" onClick={() => saveCounts.mutate()} disabled={saveCounts.isPending}>
                {saveCounts.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                Save Counts
              </Button>
              <Button
                size="sm"
                className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white"
                onClick={() => { if (confirm("Complete this stock take? Variances will adjust stock and post to the GL.")) complete.mutate() }}
                disabled={complete.isPending}
              >
                {complete.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
                Complete
              </Button>
            </>
          )}
          {take.status === "completed" && (
            <Button
              variant="outline"
              size="sm"
              className="text-rose-600"
              onClick={() => { if (confirm("Void this stock take? All posted movements and GL entries will be reversed.")) voidTake.mutate() }}
              disabled={voidTake.isPending}
            >
              <Ban className="mr-1.5 h-3.5 w-3.5" /> Void
            </Button>
          )}
        </div>
      </div>

      <Card className="rounded-2xl border-border bg-card shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Product</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Expected</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Counted</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Variance</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Variance Value</th>
            </tr>
          </thead>
          <tbody>
            {take.lines.map(l => {
              const variance = varianceOf(l)
              return (
                <tr key={l.product_id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">
                    <span className="font-mono text-xs text-muted-foreground mr-2">{l.code}</span>
                    <span className="text-sm text-foreground">{l.name}</span>
                    {l.unit && <span className="ml-1 text-xs text-muted-foreground">({l.unit})</span>}
                  </td>
                  <td className="px-4 py-2 text-right text-sm tabular-nums text-muted-foreground">{l.expected_qty}</td>
                  <td className="px-4 py-2 text-right">
                    {editable ? (
                      <Input
                        type="number"
                        value={counts[l.product_id] ?? ""}
                        onChange={e => setCounts(prev => ({ ...prev, [l.product_id]: e.target.value }))}
                        placeholder="—"
                        className="h-8 w-28 text-right text-sm tabular-nums inline-block"
                      />
                    ) : (
                      <span className="text-sm tabular-nums text-foreground">{l.counted_qty ?? "—"}</span>
                    )}
                  </td>
                  <td className={`px-4 py-2 text-right text-sm tabular-nums ${variance === null ? "text-muted-foreground" : variance < 0 ? "text-rose-600" : variance > 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                    {variance === null ? "—" : variance > 0 ? `+${variance.toFixed(2)}` : variance.toFixed(2)}
                  </td>
                  <td className={`px-4 py-2 text-right text-sm tabular-nums ${variance === null || variance === 0 ? "text-muted-foreground" : variance < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                    {variance === null ? "—" : formatCurrency(variance * l.unit_cost)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
