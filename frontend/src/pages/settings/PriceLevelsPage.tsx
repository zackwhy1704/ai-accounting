import { useState } from "react"
import { Loader2, Plus, Trash2, Tags } from "lucide-react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { useToast } from "../../components/ui/toast"
import api from "../../lib/api"

interface PriceLevel {
  id: string
  name: string
  description: string | null
  is_active: boolean
}

export default function PriceLevelsPage() {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")

  const { data: levels = [], isLoading } = useQuery<PriceLevel[]>({
    queryKey: ["price-levels-all"],
    queryFn: () => api.get("/price-levels", { params: { include_inactive: true } }).then(r => r.data),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["price-levels-all"] })
    qc.invalidateQueries({ queryKey: ["price-levels"] })
  }

  const create = useMutation({
    mutationFn: () => api.post("/price-levels", { name, description: description || null }).then(r => r.data),
    onSuccess: () => { invalidate(); setName(""); setDescription(""); toast("Price level created", "success") },
    onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to create price level", "warning"),
  })

  const toggle = useMutation({
    mutationFn: (l: PriceLevel) => api.patch(`/price-levels/${l.id}`, { is_active: !l.is_active }).then(r => r.data),
    onSuccess: () => invalidate(),
    onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to update", "warning"),
  })

  const deactivate = useMutation({
    mutationFn: (id: string) => api.delete(`/price-levels/${id}`),
    onSuccess: () => { invalidate(); toast("Price level deactivated", "success") },
    onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to deactivate", "warning"),
  })

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Settings</div>
        <div className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
          <Tags className="h-6 w-6 text-muted-foreground" /> Price Levels
        </div>
        <div className="mt-1 text-sm text-muted-foreground">
          Customer pricing tiers (e.g. Retail, Wholesale, VIP). Set per-product tier prices on each product's Inventory page,
          assign a tier to contacts, and the line-item editor resolves the right price automatically.
        </div>
      </div>

      <Card className="rounded-2xl border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5 w-56">
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Wholesale" className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5 flex-1 min-w-[200px]">
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Bulk buyers, 20% below retail" className="h-9 text-sm" />
          </div>
          <Button
            type="button"
            onClick={() => create.mutate()}
            disabled={create.isPending || !name.trim()}
            className="h-9 bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] text-white"
          >
            {create.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-2 h-3.5 w-3.5" />}
            Add Level
          </Button>
        </div>
      </Card>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline" /></div>
      ) : levels.length === 0 ? (
        <Card className="rounded-2xl border-border bg-card p-12 text-center shadow-sm">
          <div className="text-sm font-semibold text-foreground">No price levels yet</div>
          <div className="mt-1 text-xs text-muted-foreground">Create tiers like Retail / Wholesale / VIP to price customers differently</div>
        </Card>
      ) : (
        <Card className="rounded-2xl border-border bg-card shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Description</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {levels.map(l => (
                <tr key={l.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5 text-sm font-medium text-foreground">{l.name}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{l.description ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => toggle.mutate(l)}
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${l.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
                    >
                      {l.is_active ? "active" : "inactive"}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {l.is_active && (
                      <Button
                        type="button" variant="ghost" size="icon" className="h-7 w-7 text-rose-500"
                        onClick={() => { if (confirm("Deactivate this price level? Contacts assigned to it fall back to standard pricing.")) deactivate.mutate(l.id) }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
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
