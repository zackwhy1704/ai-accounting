import { useState, useEffect, useRef } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Plus, Trash2 } from "lucide-react"
import { useStockAdjustment, useUpdateStockAdjustment } from "../../lib/hooks"
import { formatCurrency } from "../../lib/utils"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { useToast } from "../../components/ui/toast"

interface LineItem {
  product: string
  description: string
  location: string
  adjustment: string
  unit_cost: string
}

interface AdjustmentForm {
  adjustment_date: string
  reference_number: string
  reason: string
  notes: string
  items: LineItem[]
}

const emptyItem = (): LineItem => ({
  product: "",
  description: "",
  location: "",
  adjustment: "",
  unit_cost: "",
})

function lineAmount(item: LineItem): number {
  const adj = parseFloat(item.adjustment) || 0
  const cost = parseFloat(item.unit_cost) || 0
  return Math.abs(adj) * cost
}

export default function EditStockAdjustmentPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data } = useStockAdjustment(id)
  const updateMutation = useUpdateStockAdjustment()

  const [form, setForm] = useState<AdjustmentForm>({
    adjustment_date: new Date().toISOString().split("T")[0],
    reference_number: "",
    reason: "",
    notes: "",
    items: [emptyItem()],
  })

  const populated = useRef(false)
  useEffect(() => {
    if (data && !populated.current) {
      populated.current = true
      setForm({
        adjustment_date: data.adjustment_date ? data.adjustment_date.slice(0, 10) : new Date().toISOString().split("T")[0],
        reference_number: data.reference_number || "",
        reason: data.reason || "",
        notes: data.notes || "",
        items: data.items && data.items.length > 0
          ? data.items.map((i: any) => ({
              product: i.product || "",
              description: i.description || "",
              location: i.location || "",
              adjustment: i.adjustment != null ? String(i.adjustment) : "",
              unit_cost: i.unit_cost != null ? String(i.unit_cost) : "",
            }))
          : [emptyItem()],
      })
    }
  }, [data])

  const setField = (key: keyof Omit<AdjustmentForm, "items">) => (val: string) =>
    setForm(prev => ({ ...prev, [key]: val }))

  const updateItem = (idx: number, key: keyof LineItem, val: string) =>
    setForm(prev => ({
      ...prev,
      items: prev.items.map((item, i) => i === idx ? { ...item, [key]: val } : item),
    }))

  const addItem = () =>
    setForm(prev => ({ ...prev, items: [...prev.items, emptyItem()] }))

  const removeItem = (idx: number) =>
    setForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }))

  const totalAmount = form.items.reduce((sum, item) => sum + lineAmount(item), 0)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.adjustment_date || form.items.every(i => !i.product)) return
    updateMutation.mutate(
      {
        id,
        adjustment_date: form.adjustment_date,
        reference_number: form.reference_number,
        reason: form.reason,
        notes: form.notes,
        items: form.items.map(item => ({
          product: item.product,
          description: item.description,
          location: item.location,
          adjustment: parseFloat(item.adjustment) || 0,
          unit_cost: parseFloat(item.unit_cost) || 0,
          amount: lineAmount(item),
        })),
      },
      {
        onSuccess: () => {
          toast("Stock adjustment updated", "success")
          navigate("/stock/adjustments")
        },
        onError: () => toast("Failed to update adjustment", "warning"),
      }
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Stock</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Edit Stock Adjustment</div>
        <div className="mt-1 text-sm text-muted-foreground">Update this stock quantity adjustment</div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
          <div className="text-sm font-semibold text-foreground mb-4">Adjustment Details</div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Date <span className="text-rose-500">*</span>
              </label>
              <Input
                required
                type="date"
                value={form.adjustment_date}
                onChange={e => setField("adjustment_date")(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Reference No.</label>
              <Input
                placeholder="e.g. ADJ-001"
                value={form.reference_number}
                onChange={e => setField("reference_number")(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Reason</label>
              <Input
                placeholder="e.g. Physical count correction"
                value={form.reason}
                onChange={e => setField("reason")(e.target.value)}
              />
            </div>
          </div>
        </Card>

        <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
          <div className="text-sm font-semibold text-foreground mb-4">Line Items</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Product</th>
                  <th className="pb-2 pr-3 font-medium">Description</th>
                  <th className="pb-2 pr-3 font-medium">Location</th>
                  <th className="pb-2 pr-3 font-medium w-28">Adjustment</th>
                  <th className="pb-2 pr-3 font-medium w-28">Unit Cost</th>
                  <th className="pb-2 pr-3 font-medium w-28 text-right">Amount</th>
                  <th className="pb-2 w-10" />
                </tr>
              </thead>
              <tbody>
                {form.items.map((item, idx) => (
                  <tr key={idx} className="border-b border-border/50 last:border-0">
                    <td className="py-2 pr-3">
                      <Input
                        placeholder="Product name"
                        value={item.product}
                        onChange={e => updateItem(idx, "product", e.target.value)}
                        className="h-8 text-xs"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <Input
                        placeholder="Description"
                        value={item.description}
                        onChange={e => updateItem(idx, "description", e.target.value)}
                        className="h-8 text-xs"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <Input
                        placeholder="Location"
                        value={item.location}
                        onChange={e => updateItem(idx, "location", e.target.value)}
                        className="h-8 text-xs"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <Input
                        type="number"
                        placeholder="+/- qty"
                        value={item.adjustment}
                        onChange={e => updateItem(idx, "adjustment", e.target.value)}
                        className="h-8 text-xs"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={item.unit_cost}
                        onChange={e => updateItem(idx, "unit_cost", e.target.value)}
                        className="h-8 text-xs"
                      />
                    </td>
                    <td className="py-2 pr-3 text-right text-foreground">
                      {formatCurrency(lineAmount(item))}
                    </td>
                    <td className="py-2">
                      {form.items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={addItem}
            className="mt-3 flex items-center gap-1 text-xs text-blue-600 hover:underline"
          >
            <Plus className="h-3 w-3" /> Add Item
          </button>

          <div className="mt-4 flex justify-end border-t border-border pt-4">
            <div className="flex items-center gap-6">
              <span className="text-sm text-muted-foreground">Total Adjustment Value</span>
              <span className="text-base font-semibold text-foreground">{formatCurrency(totalAmount)}</span>
            </div>
          </div>
        </Card>

        <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Notes</label>
            <textarea
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              rows={3}
              placeholder="Additional notes..."
              value={form.notes}
              onChange={e => setField("notes")(e.target.value)}
            />
          </div>
        </Card>

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            className="h-9 rounded-xl px-4 text-xs font-semibold"
            onClick={() => navigate(-1)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={updateMutation.isPending || !form.adjustment_date}
            className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-4 text-xs font-semibold text-white"
          >
            {updateMutation.isPending ? "Saving..." : "Save Adjustment"}
          </Button>
        </div>
      </form>
    </div>
  )
}
