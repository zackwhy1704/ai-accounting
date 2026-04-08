import { useState, useEffect, useRef } from "react"
import { ArrowLeft, Loader2 } from "lucide-react"
import { useNavigate, useParams } from "react-router-dom"
import { useFixedAsset, useUpdateFixedAsset } from "../../lib/hooks"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"
import { useToast } from "../../components/ui/toast"

export default function EditFixedAssetPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data } = useFixedAsset(id)
  const updateMutation = useUpdateFixedAsset()

  const [form, setForm] = useState({
    code: "",
    name: "",
    asset_type: "",
    serial_no: "",
    purchase_date: new Date().toISOString().slice(0, 10),
    purchase_cost: "",
    salvage_value: "",
    useful_life_years: "",
    depreciation_method: "straight_line",
  })

  const populated = useRef(false)
  useEffect(() => {
    if (data && !populated.current) {
      populated.current = true
      setForm({
        code: data.code || "",
        name: data.name || "",
        asset_type: data.asset_type || "",
        serial_no: data.serial_no || "",
        purchase_date: data.purchase_date ? data.purchase_date.slice(0, 10) : new Date().toISOString().slice(0, 10),
        purchase_cost: data.purchase_cost != null ? String(data.purchase_cost) : "",
        salvage_value: data.salvage_value != null ? String(data.salvage_value) : "",
        useful_life_years: data.useful_life_years != null ? String(data.useful_life_years) : "",
        depreciation_method: data.depreciation_method || "straight_line",
      })
    }
  }, [data])

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.purchase_cost) return
    updateMutation.mutate(
      {
        id,
        code: form.code,
        name: form.name,
        asset_type: form.asset_type,
        serial_no: form.serial_no,
        purchase_date: form.purchase_date,
        purchase_cost: parseFloat(form.purchase_cost),
        salvage_value: form.salvage_value ? parseFloat(form.salvage_value) : null,
        useful_life_years: form.useful_life_years ? parseInt(form.useful_life_years, 10) : null,
        depreciation_method: form.depreciation_method,
      },
      {
        onSuccess: () => {
          toast("Fixed asset updated", "success")
          navigate("/accounting/fixed-assets")
        },
        onError: () => toast("Failed to update asset", "warning"),
      }
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate("/accounting/fixed-assets")} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <div className="text-xs text-muted-foreground">Accounting / Fixed Assets</div>
          <div className="mt-0.5 text-2xl font-semibold tracking-tight text-foreground">Edit Fixed Asset</div>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Code</label>
              <Input className="h-9 text-sm" placeholder="FA-001" value={form.code} onChange={set("code")} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Name <span className="text-rose-500">*</span></label>
              <Input className="h-9 text-sm" placeholder="Office Laptop" value={form.name} onChange={set("name")} required />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Asset Type</label>
              <Input className="h-9 text-sm" placeholder="Computer Equipment" value={form.asset_type} onChange={set("asset_type")} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Serial No.</label>
              <Input className="h-9 text-sm" placeholder="SN-123456" value={form.serial_no} onChange={set("serial_no")} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Purchase Date</label>
              <Input type="date" className="h-9 text-sm" value={form.purchase_date} onChange={set("purchase_date")} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Purchase Cost <span className="text-rose-500">*</span></label>
              <Input type="number" min="0" step="0.01" className="h-9 text-sm" placeholder="5000.00" value={form.purchase_cost} onChange={set("purchase_cost")} required />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Salvage Value</label>
              <Input type="number" min="0" step="0.01" className="h-9 text-sm" placeholder="500.00" value={form.salvage_value} onChange={set("salvage_value")} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Useful Life (years)</label>
              <Input type="number" min="1" step="1" className="h-9 text-sm" placeholder="5" value={form.useful_life_years} onChange={set("useful_life_years")} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Depreciation Method</label>
              <Select value={form.depreciation_method} onValueChange={v => setForm(prev => ({ ...prev, depreciation_method: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="straight_line">Straight Line</SelectItem>
                  <SelectItem value="declining_balance">Declining Balance</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="secondary" className="h-9 text-sm" onClick={() => navigate("/accounting/fixed-assets")}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="h-9 bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] text-sm text-white"
              disabled={updateMutation.isPending || !form.name || !form.purchase_cost}
            >
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Asset"}
            </Button>
          </div>
        </Card>
      </form>
    </div>
  )
}
