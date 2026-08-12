import { useEffect, useState } from "react"
import { Loader2, ArrowLeft, Save, Plus, Trash2 } from "lucide-react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useParams } from "react-router-dom"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { useToast } from "../../components/ui/toast"
import { formatCurrency, formatDate } from "../../lib/utils"
import api from "../../lib/api"

type Tab = "card" | "batches" | "uoms" | "prices"

interface StockCardMove {
  date: string | null
  source_type: string
  note: string | null
  qty_in: number
  qty_out: number
  unit_cost: number
  balance: number
}

export default function ProductInventoryPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>("card")

  const { data: card, isLoading } = useQuery<{
    product_id: string; code: string | null; name: string
    qty_on_hand: number; avg_cost: number; moves: StockCardMove[]
  }>({
    queryKey: ["stock-card", id],
    queryFn: () => api.get(`/products/${id}/stock-card`).then(r => r.data),
    enabled: !!id,
  })

  return (
    <div className="flex flex-col gap-4">
      <div>
        <button type="button" onClick={() => navigate("/products")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Products
        </button>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          {card ? <>{card.code && <span className="font-mono text-lg text-muted-foreground mr-2">{card.code}</span>}{card.name}</> : "Product Inventory"}
        </div>
        {card && (
          <div className="mt-1 text-sm text-muted-foreground">
            On hand: <span className="font-medium text-foreground">{card.qty_on_hand}</span> · Avg cost:{" "}
            <span className="font-medium text-foreground">{formatCurrency(card.avg_cost)}</span> · Value:{" "}
            <span className="font-medium text-foreground">{formatCurrency(card.qty_on_hand * card.avg_cost)}</span>
          </div>
        )}
      </div>

      <div className="flex gap-1">
        {([["card", "Stock Card"], ["batches", "Batches / Serials"], ["uoms", "Units"], ["prices", "Price Levels"]] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${tab === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "card" && (
        isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline" /></div>
        ) : (
          <Card className="rounded-2xl border-border bg-card shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Date</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Source</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">In</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Out</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Unit Cost</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Balance</th>
                </tr>
              </thead>
              <tbody>
                {(card?.moves ?? []).map((m, i) => (
                  <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{m.date ? formatDate(m.date) : "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{m.source_type.replace(/_/g, " ")}</span>
                      {m.note && <span className="ml-2 text-xs text-muted-foreground">{m.note}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums text-emerald-600">{m.qty_in || ""}</td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums text-rose-600">{m.qty_out || ""}</td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums text-muted-foreground">{m.unit_cost.toFixed(4)}</td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums font-medium text-foreground">{m.balance}</td>
                  </tr>
                ))}
                {(card?.moves ?? []).length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-muted-foreground">No movements yet — post an invoice, GRN or adjustment for this product</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        )
      )}
      {tab === "batches" && id && <BatchesTab productId={id} />}
      {tab === "uoms" && id && <UomsTab productId={id} />}
      {tab === "prices" && id && <PricesTab productId={id} />}
    </div>
  )
}

function BatchesTab({ productId }: { productId: string }) {
  const { data, isLoading } = useQuery<{
    tracking_mode: string
    batches: Array<{ id: string; batch_no: string; expiry_date: string | null; qty_on_hand: number }>
  }>({
    queryKey: ["product-batches", productId],
    queryFn: () => api.get(`/products/${productId}/batches`, { params: { include_empty: true } }).then(r => r.data),
  })

  if (isLoading) return <div className="py-12 text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline" /></div>

  return (
    <Card className="rounded-2xl border-border bg-card shadow-sm overflow-hidden">
      <div className="p-4 text-xs text-muted-foreground">
        Tracking mode: <span className="font-medium text-foreground">{data?.tracking_mode ?? "none"}</span>
        {data?.tracking_mode === "none" && " — set the product's tracking mode to batch or serial to capture batches at receipt; issues auto-pick earliest expiry first."}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Batch / Serial</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Expiry</th>
            <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Qty On Hand</th>
          </tr>
        </thead>
        <tbody>
          {(data?.batches ?? []).map(b => (
            <tr key={b.id} className="border-b border-border last:border-0">
              <td className="px-4 py-2.5 text-sm font-mono text-foreground">{b.batch_no}</td>
              <td className="px-4 py-2.5 text-sm text-muted-foreground">{b.expiry_date ? formatDate(b.expiry_date) : "—"}</td>
              <td className={`px-4 py-2.5 text-right text-sm tabular-nums ${b.qty_on_hand > 0 ? "text-foreground" : "text-muted-foreground"}`}>{b.qty_on_hand}</td>
            </tr>
          ))}
          {(data?.batches ?? []).length === 0 && (
            <tr><td colSpan={3} className="px-4 py-8 text-center text-xs text-muted-foreground">No batches recorded yet</td></tr>
          )}
        </tbody>
      </table>
    </Card>
  )
}

function UomsTab({ productId }: { productId: string }) {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [rows, setRows] = useState<Array<{ name: string; factor: string; barcode: string }>>([])

  const { data, isLoading } = useQuery<{
    base_unit: string
    uoms: Array<{ id: string; name: string; factor: number; barcode: string | null }>
  }>({
    queryKey: ["product-uoms", productId],
    queryFn: () => api.get(`/products/${productId}/uoms`).then(r => r.data),
  })

  useEffect(() => {
    if (data) setRows(data.uoms.map(u => ({ name: u.name, factor: String(u.factor), barcode: u.barcode ?? "" })))
  }, [data])

  const save = useMutation({
    mutationFn: () => api.put(`/products/${productId}/uoms`, {
      uoms: rows.filter(r => r.name.trim()).map(r => ({ name: r.name.trim(), factor: parseFloat(r.factor) || 1, barcode: r.barcode || null })),
    }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product-uoms", productId] })
      toast("Units saved", "success")
    },
    onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to save units", "warning"),
  })

  if (isLoading) return <div className="py-12 text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline" /></div>

  return (
    <Card className="rounded-2xl border-border bg-card p-5 shadow-sm">
      <div className="text-xs text-muted-foreground mb-4">
        Base unit: <span className="font-medium text-foreground">{data?.base_unit}</span>. Each alternate unit converts by its factor —
        e.g. a box of 12 has factor 12; selling 2 boxes moves 24 base units.
      </div>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-center">
            <Input value={r.name} onChange={e => setRows(p => p.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))} placeholder="box" className="col-span-4 h-9 text-sm" />
            <Input type="number" value={r.factor} onChange={e => setRows(p => p.map((x, idx) => idx === i ? { ...x, factor: e.target.value } : x))} placeholder="12" className="col-span-3 h-9 text-sm text-right" />
            <Input value={r.barcode} onChange={e => setRows(p => p.map((x, idx) => idx === i ? { ...x, barcode: e.target.value } : x))} placeholder="Barcode (optional)" className="col-span-4 h-9 text-sm" />
            <Button type="button" variant="ghost" size="icon" className="col-span-1 h-8 w-8 text-rose-500" onClick={() => setRows(p => p.filter((_, idx) => idx !== i))}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between">
        <Button type="button" variant="outline" size="sm" onClick={() => setRows(p => [...p, { name: "", factor: "", barcode: "" }])}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Unit
        </Button>
        <Button type="button" onClick={() => save.mutate()} disabled={save.isPending} className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white">
          {save.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
          Save Units
        </Button>
      </div>
    </Card>
  )
}

function PricesTab({ productId }: { productId: string }) {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [prices, setPrices] = useState<Record<string, string>>({})

  const { data: levels = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["price-levels"],
    queryFn: () => api.get("/price-levels").then(r => r.data),
  })

  const { data: productPrices, isLoading } = useQuery<{
    standard_price: number
    prices: Array<{ price_level_id: string; price_level_name: string; unit_price: number }>
  }>({
    queryKey: ["product-prices", productId],
    queryFn: () => api.get(`/products/${productId}/prices`).then(r => r.data),
  })

  useEffect(() => {
    if (!productPrices) return
    const m: Record<string, string> = {}
    productPrices.prices.forEach(p => { m[p.price_level_id] = String(p.unit_price) })
    setPrices(m)
  }, [productPrices])

  const save = useMutation({
    mutationFn: () => {
      const payload: Record<string, number> = {}
      Object.entries(prices).forEach(([levelId, v]) => {
        if (v !== "") payload[levelId] = parseFloat(v) || 0
      })
      return api.put(`/products/${productId}/prices`, { prices: payload }).then(r => r.data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product-prices", productId] })
      toast("Tier prices saved", "success")
    },
    onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to save prices", "warning"),
  })

  if (isLoading) return <div className="py-12 text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline" /></div>

  return (
    <Card className="rounded-2xl border-border bg-card p-5 shadow-sm">
      <div className="text-xs text-muted-foreground mb-4">
        Standard price: <span className="font-medium text-foreground">{formatCurrency(productPrices?.standard_price ?? 0)}</span>.
        Contacts assigned a price level get that tier's price instead.
        {levels.length === 0 && " Create price levels under Settings → Price Levels first."}
      </div>
      <div className="space-y-2 max-w-md">
        {levels.map(l => (
          <div key={l.id} className="flex items-center justify-between gap-3">
            <span className="text-sm text-foreground">{l.name}</span>
            <Input
              type="number"
              value={prices[l.id] ?? ""}
              onChange={e => setPrices(p => ({ ...p, [l.id]: e.target.value }))}
              placeholder={`${productPrices?.standard_price ?? 0}`}
              className="h-9 w-40 text-right text-sm tabular-nums"
            />
          </div>
        ))}
      </div>
      {levels.length > 0 && (
        <div className="mt-4 flex justify-end">
          <Button type="button" onClick={() => save.mutate()} disabled={save.isPending} className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white">
            {save.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
            Save Prices
          </Button>
        </div>
      )}
    </Card>
  )
}
