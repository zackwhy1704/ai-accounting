import { useEffect, useState } from "react"
import { Loader2, BookOpen } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { Card } from "../../components/ui/card"
import { PaginationControls } from "../../components/ui/pagination-controls"
import { formatCurrency, formatDate } from "../../lib/utils"
import { useProducts } from "../../lib/hooks"
import api from "../../lib/api"

interface StockMove {
  id: string
  product_id: string
  location_id: string | null
  date: string | null
  qty: number
  unit_cost: number
  value: number
  source_type: string
  note: string | null
}

interface LocationLevel {
  product_id: string
  product_code: string | null
  product_name: string | null
  location_id: string | null
  location_name: string
  qty: number
  avg_cost: number
  value: number
}

type Tab = "moves" | "locations"

export default function StockLedgerPage() {
  const { data: products = [] } = useProducts()
  const [tab, setTab] = useState<Tab>("moves")
  const [productId, setProductId] = useState("")
  const [page, setPage] = useState(1)

  useEffect(() => { setPage(1) }, [productId])

  const productById: Record<string, any> = {}
  products.forEach((p: any) => { productById[p.id] = p })

  const { data: movesPage, isLoading } = useQuery<{ items: StockMove[]; total: number; pages: number }>({
    queryKey: ["stock-moves", { productId, page }],
    queryFn: () => api.get("/stock/moves", {
      params: { page, limit: 50, ...(productId ? { product_id: productId } : {}) },
    }).then(r => r.data),
    enabled: tab === "moves",
  })

  const { data: levels, isLoading: levelsLoading } = useQuery<{ rows: LocationLevel[] }>({
    queryKey: ["stock-levels-by-location"],
    queryFn: () => api.get("/stock/levels-by-location").then(r => r.data),
    enabled: tab === "locations",
  })

  const moves = movesPage?.items ?? []

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Stocks</div>
        <div className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
          <BookOpen className="h-6 w-6 text-muted-foreground" /> Stock Ledger
        </div>
        <div className="mt-1 text-sm text-muted-foreground">Every stock movement, and balances by location</div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {(["moves", "locations"] as Tab[]).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors ${tab === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
            >
              {t === "moves" ? "Movements" : "By Location"}
            </button>
          ))}
        </div>
        {tab === "moves" && (
          <select
            value={productId}
            onChange={e => setProductId(e.target.value)}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value="">All products</option>
            {products.filter((p: any) => p.track_inventory).map((p: any) => (
              <option key={p.id} value={p.id}>{p.code ? `${p.code} — ` : ""}{p.name}</option>
            ))}
          </select>
        )}
      </div>

      {tab === "moves" ? (
        isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading ledger…
          </div>
        ) : (
          <Card className="rounded-2xl border-border bg-card shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Date</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Product</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Source</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Qty</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Unit Cost</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Value</th>
                </tr>
              </thead>
              <tbody>
                {moves.map(m => {
                  const p = productById[m.product_id]
                  return (
                    <tr key={m.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{m.date ? formatDate(m.date) : "—"}</td>
                      <td className="px-4 py-2.5 text-sm text-foreground">{p ? p.name : m.product_id.slice(0, 8)}</td>
                      <td className="px-4 py-2.5">
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {m.source_type.replace(/_/g, " ")}
                        </span>
                        {m.note && <span className="ml-2 text-xs text-muted-foreground">{m.note}</span>}
                      </td>
                      <td className={`px-4 py-2.5 text-right text-sm tabular-nums font-medium ${m.qty > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        {m.qty > 0 ? `+${m.qty}` : m.qty}
                      </td>
                      <td className="px-4 py-2.5 text-right text-sm tabular-nums text-muted-foreground">{m.unit_cost.toFixed(4)}</td>
                      <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{formatCurrency(m.value)}</td>
                    </tr>
                  )
                })}
                {moves.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-muted-foreground">No stock movements yet</td></tr>
                )}
              </tbody>
            </table>
            <PaginationControls page={page} pages={movesPage?.pages ?? 1} total={movesPage?.total ?? 0} limit={50} onPageChange={setPage} />
          </Card>
        )
      ) : levelsLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading balances…
        </div>
      ) : (
        <Card className="rounded-2xl border-border bg-card shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Product</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Location</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Qty</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Avg Cost</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Value</th>
              </tr>
            </thead>
            <tbody>
              {(levels?.rows ?? []).map(r => (
                <tr key={`${r.product_id}-${r.location_id}`} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5 text-sm text-foreground">
                    <span className="font-mono text-xs text-muted-foreground mr-2">{r.product_code}</span>{r.product_name}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-muted-foreground">{r.location_name}</td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{r.qty}</td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums text-muted-foreground">{r.avg_cost.toFixed(4)}</td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{formatCurrency(r.value)}</td>
                </tr>
              ))}
              {(levels?.rows ?? []).length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-xs text-muted-foreground">No location-tagged stock yet — receive or transfer stock with locations to see balances here</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
