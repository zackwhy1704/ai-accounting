import { useState, useEffect, useRef } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Plus, Trash2 } from "lucide-react"
import { useStockTransfer, useUpdateStockTransfer } from "../../lib/hooks"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { useToast } from "../../components/ui/toast"

interface LineItem {
  product: string
  qty: string
}

interface TransferForm {
  transfer_date: string
  from_location: string
  to_location: string
  notes: string
  items: LineItem[]
}

const emptyItem = (): LineItem => ({ product: "", qty: "" })

export default function EditStockTransferPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data } = useStockTransfer(id)
  const updateMutation = useUpdateStockTransfer()

  const [form, setForm] = useState<TransferForm>({
    transfer_date: new Date().toISOString().split("T")[0],
    from_location: "",
    to_location: "",
    notes: "",
    items: [emptyItem()],
  })

  const populated = useRef(false)
  useEffect(() => {
    if (data && !populated.current) {
      populated.current = true
      setForm({
        transfer_date: data.transfer_date ? data.transfer_date.slice(0, 10) : new Date().toISOString().split("T")[0],
        from_location: data.from_location || "",
        to_location: data.to_location || "",
        notes: data.notes || "",
        items: data.items && data.items.length > 0
          ? data.items.map((i: any) => ({
              product: i.product || "",
              qty: i.qty != null ? String(i.qty) : "",
            }))
          : [emptyItem()],
      })
    }
  }, [data])

  const setField = (key: keyof Omit<TransferForm, "items">) => (val: string) =>
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.transfer_date || !form.from_location || !form.to_location) return
    updateMutation.mutate(
      {
        id,
        transfer_date: form.transfer_date,
        from_location: form.from_location,
        to_location: form.to_location,
        notes: form.notes,
        items: form.items.map(item => ({
          product: item.product,
          qty: parseFloat(item.qty) || 0,
        })),
      },
      {
        onSuccess: () => {
          toast("Stock transfer updated", "success")
          navigate("/stock/transfers")
        },
        onError: () => toast("Failed to update transfer", "warning"),
      }
    )
  }

  const isValid = form.transfer_date && form.from_location && form.to_location

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Stock</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Edit Stock Transfer</div>
        <div className="mt-1 text-sm text-muted-foreground">Update this stock transfer between locations</div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
          <div className="text-sm font-semibold text-foreground mb-4">Transfer Details</div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Transfer Date <span className="text-rose-500">*</span>
              </label>
              <Input
                required
                type="date"
                value={form.transfer_date}
                onChange={e => setField("transfer_date")(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                From Location <span className="text-rose-500">*</span>
              </label>
              <Input
                required
                placeholder="e.g. Warehouse A"
                value={form.from_location}
                onChange={e => setField("from_location")(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                To Location <span className="text-rose-500">*</span>
              </label>
              <Input
                required
                placeholder="e.g. Warehouse B"
                value={form.to_location}
                onChange={e => setField("to_location")(e.target.value)}
              />
            </div>
          </div>
        </Card>

        <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
          <div className="text-sm font-semibold text-foreground mb-4">Products to Transfer</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Product</th>
                  <th className="pb-2 pr-3 font-medium w-32">Quantity</th>
                  <th className="pb-2 w-10" />
                </tr>
              </thead>
              <tbody>
                {form.items.map((item, idx) => (
                  <tr key={idx} className="border-b border-border/50 last:border-0">
                    <td className="py-2 pr-3">
                      <Input
                        placeholder="Product name or SKU"
                        value={item.product}
                        onChange={e => updateItem(idx, "product", e.target.value)}
                        className="h-8 text-xs"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <Input
                        type="number"
                        step="0.001"
                        min="0"
                        placeholder="0"
                        value={item.qty}
                        onChange={e => updateItem(idx, "qty", e.target.value)}
                        className="h-8 text-xs"
                      />
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
            <Plus className="h-3 w-3" /> Add Product
          </button>
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
            disabled={updateMutation.isPending || !isValid}
            className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-4 text-xs font-semibold text-white"
          >
            {updateMutation.isPending ? "Saving..." : "Save Transfer"}
          </Button>
        </div>
      </form>
    </div>
  )
}
