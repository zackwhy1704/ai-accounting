import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Search, Boxes } from "lucide-react"
import api from "../../lib/api"
import { formatCurrency } from "../../lib/utils"
import { Card } from "../../components/ui/card"
import { Input } from "../../components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table"

interface StockOverride { qty?: number; cost?: number }

interface Product {
  id: string
  name: string
  sku: string
  qty_on_hand?: number
  avg_cost?: number
}

export default function StockValuesPage() {
  const [search, setSearch] = useState("")
  const [overrides, setOverrides] = useState<Record<string, StockOverride>>({})

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["products"],
    queryFn: async () => {
      const res = await api.get("/products")
      return res.data
    },
  })

  const rows = search.trim()
    ? products.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.sku ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : products

  const totalValue = rows.reduce((sum, p) => {
    const qty = overrides[p.id]?.qty ?? p.qty_on_hand ?? 0
    const cost = overrides[p.id]?.cost ?? p.avg_cost ?? 0
    return sum + qty * cost
  }, 0)

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Stock</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Stock Values</div>
        <div className="mt-1 max-w-2xl text-sm text-muted-foreground">Current inventory value by product</div>
      </div>

      <Card className="rounded-2xl border-border bg-card p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="mb-4 relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search products..."
            className="h-10 rounded-xl pl-9 text-sm"
          />
        </div>

        {isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <Boxes className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="mt-4 text-base font-semibold text-foreground">No products found</div>
            <div className="mt-1 text-sm text-muted-foreground">Add products to your inventory to see stock values here</div>
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Product</TableHead>
                    <TableHead className="text-muted-foreground">SKU</TableHead>
                    <TableHead className="text-right text-muted-foreground">Qty on Hand</TableHead>
                    <TableHead className="text-right text-muted-foreground">Avg Cost</TableHead>
                    <TableHead className="text-right text-muted-foreground">Total Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(p => {
                    const qty = p.qty_on_hand ?? 0
                    const cost = p.avg_cost ?? 0
                    const effectiveQty = overrides[p.id]?.qty ?? qty
                    const effectiveCost = overrides[p.id]?.cost ?? cost
                    const total = effectiveQty * effectiveCost
                    return (
                      <TableRow key={p.id} className="border-border hover:bg-muted/50">
                        <TableCell className="font-medium text-foreground">{p.name}</TableCell>
                        <TableCell className="text-muted-foreground">{p.sku || "—"}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            className="h-8 w-24 text-right text-sm ml-auto"
                            value={overrides[p.id]?.qty ?? qty}
                            onChange={e => setOverrides(prev => ({ ...prev, [p.id]: { ...prev[p.id], qty: Number(e.target.value) } }))}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            step="0.01"
                            className="h-8 w-28 text-right text-sm ml-auto"
                            value={overrides[p.id]?.cost ?? cost}
                            onChange={e => setOverrides(prev => ({ ...prev, [p.id]: { ...prev[p.id], cost: Number(e.target.value) } }))}
                          />
                        </TableCell>
                        <TableCell className="text-right font-medium text-foreground">
                          {total > 0 ? formatCurrency(total) : "—"}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="mt-4 flex justify-end border-t border-border pt-4">
              <div className="flex items-center gap-6">
                <span className="text-sm text-muted-foreground">Total Inventory Value</span>
                <span className="text-base font-semibold text-foreground">{formatCurrency(totalValue)}</span>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
