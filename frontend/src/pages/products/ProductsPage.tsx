import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { Plus, Search, Package, Eye, Pencil, ArrowUpDown, Trash2 } from "lucide-react"
import { useProducts } from "../../lib/hooks"
import { formatCurrency } from "../../lib/utils"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table"
import { Badge } from "../../components/ui/badge"
import { RowActionsMenu } from "../../components/ui/row-actions"
import api from "../../lib/api"

const typeColors: Record<string, string> = {
  service: "bg-blue-500/10 text-blue-700 border-blue-400/20",
  inventory: "bg-amber-500/10 text-amber-700 border-amber-400/20",
  non_inventory: "bg-slate-500/10 text-slate-600 border-slate-300/20",
}

export default function ProductsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState("")
  const { data: products = [], isLoading } = useProducts()
  const queryClient = useQueryClient()

  const rows = useMemo(() => {
    if (!search.trim()) return products
    const q = search.toLowerCase()
    return products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.code ?? "").toLowerCase().includes(q) ||
      (p.description ?? "").toLowerCase().includes(q)
    )
  }, [products, search])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Inventory</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Products & Services</div>
          <div className="mt-1 max-w-2xl text-sm text-muted-foreground">Manage your product catalog, services, and inventory items</div>
        </div>
        <div className="flex items-center gap-2">
<Button type="button" onClick={() => navigate("/products/new")} className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white shadow-[0_0_0_1px_rgba(124,157,255,0.25),0_16px_40px_rgba(0,0,0,0.35)] hover:opacity-95">
            <Plus className="mr-2 h-4 w-4" /> New Product
          </Button>
        </div>
      </div>

      <Card className="rounded-2xl border-border bg-card p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="mb-4 relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products..." className="h-10 rounded-xl pl-9 text-sm" />
        </div>

        {isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted shadow-[0_0_0_1px_rgba(15,23,42,0.08)]">
              <Package className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="mt-4 text-base font-semibold text-foreground">No products yet</div>
            <div className="mt-1 text-sm text-muted-foreground">Add your first product or service to use it in invoices</div>
            <Button type="button" onClick={() => navigate("/products/new")} className="mt-6 h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white">
              <Plus className="mr-2 h-4 w-4" /> New Product
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Code</TableHead>
                  <TableHead className="text-muted-foreground">Name</TableHead>
                  <TableHead className="text-muted-foreground">Type</TableHead>
                  <TableHead className="text-muted-foreground">Unit</TableHead>
                  <TableHead className="text-right text-muted-foreground">Unit Price</TableHead>
                  <TableHead className="text-right text-muted-foreground">On Hand</TableHead>
                  <TableHead className="w-[90px] text-right text-muted-foreground">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(p => (
                  <TableRow key={p.id} className="border-border hover:bg-muted/50">
                    <TableCell className="text-muted-foreground">{p.code ?? "—"}</TableCell>
                    <TableCell>
                      <div className="font-medium text-foreground">{p.name}</div>
                      {p.description && <div className="text-xs text-muted-foreground truncate max-w-[200px]">{p.description}</div>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold ${typeColors[p.product_type] ?? ""}`}>
                        {p.product_type.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.unit ?? "—"}</TableCell>
                    <TableCell className="text-right text-foreground">{formatCurrency(p.unit_price, p.currency)}</TableCell>
                    <TableCell className="text-right text-foreground">
                      {p.track_inventory ? Number(p.qty_on_hand).toFixed(2) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActionsMenu actions={[
                        { label: "View", icon: <Eye className="h-4 w-4" />, onClick: () => navigate(`/products/new?view=${p.id}`) },
                        { label: "Edit", icon: <Pencil className="h-4 w-4" />, onClick: () => navigate(`/products/new?edit=${p.id}`) },
                        { label: "Adjust Stock", icon: <ArrowUpDown className="h-4 w-4" />, onClick: () => navigate(`/stock/adjustments/new?product_id=${p.id}`), dividerBefore: true },
                        { label: "Delete", icon: <Trash2 className="h-4 w-4" />, onClick: () => { if (confirm("Are you sure you want to delete this product?")) api.delete(`/products/${p.id}`).then(() => queryClient.invalidateQueries({ queryKey: ["products"] })) }, danger: true, dividerBefore: true },
                      ]} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  )
}
