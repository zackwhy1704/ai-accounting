import { useState } from "react"
import { Plus, Trash2, Loader2 } from "lucide-react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { useToast } from "../../components/ui/toast"
import { formatCurrency, formatDate } from "../../lib/utils"
import api from "../../lib/api"

interface FixedAsset {
  id: string
  code: string
  serial_no: string | null
  name: string
  asset_type: string
  purchase_date: string
  purchase_cost: number
  current_value: number
  currency: string
  status: "registered" | "disposed"
  salvage_value: number | null
  useful_life_years: number | null
  depreciation_method: string | null
}

type Tab = "registered" | "disposed"

export default function FixedAssetsPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>("registered")

  const { data: assets = [], isLoading } = useQuery<FixedAsset[]>({
    queryKey: ["fixed-assets", tab],
    queryFn: () => api.get(`/fixed-assets?status=${tab}`).then(r => r.data),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/fixed-assets/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fixed-assets"] })
      toast("Asset removed", "success")
    },
    onError: () => toast("Failed to remove asset", "warning"),
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Accounting</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Fixed Assets</div>
          <div className="mt-1 text-sm text-muted-foreground">Grouping of your fixed assets</div>
        </div>
        <Button
          type="button"
          onClick={() => navigate("/accounting/fixed-assets/new")}
          className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white"
        >
          <Plus className="mr-2 h-4 w-4" /> Register
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1">
        {(["registered", "disposed"] as Tab[]).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors ${tab === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
          >
            {t}
          </button>
        ))}
      </div>

      <Card className="rounded-2xl border-border bg-card shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)] overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin inline" />
          </div>
        ) : assets.length === 0 ? (
          <div className="py-12 text-center">
            <div className="text-sm font-semibold text-foreground">No {tab} assets</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {tab === "registered" ? "Register your first fixed asset to track depreciation" : "No disposed assets yet"}
            </div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Code</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Serial No.</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Purchased</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Cost</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Current Value</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {assets.map(a => (
                <tr key={a.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{a.code}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{a.serial_no ?? "—"}</td>
                  <td className="px-4 py-2.5 text-sm font-medium text-foreground">{a.name}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{a.asset_type}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatDate(a.purchase_date)}</td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{formatCurrency(a.purchase_cost, a.currency)}</td>
                  <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{formatCurrency(a.current_value, a.currency)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-rose-500"
                      onClick={() => deleteMutation.mutate(a.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
