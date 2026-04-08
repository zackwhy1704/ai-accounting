import { useState, useEffect, useRef } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useProduct, useUpdateProduct, useTaxRates, useAccounts } from "../../lib/hooks"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"

const PRODUCT_TYPES = [
  { value: "service", label: "Service" },
  { value: "inventory", label: "Inventory Item" },
  { value: "non_inventory", label: "Non-inventory Item" },
]

const UNITS = ["pcs", "kg", "hr", "day", "m", "L", "box", "set"]

export default function EditProductPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data } = useProduct(id)
  const updateProduct = useUpdateProduct()
  const { data: taxRates = [] } = useTaxRates()
  const { data: accounts = [] } = useAccounts()

  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [productType, setProductType] = useState("service")
  const [unit, setUnit] = useState("")
  const [unitPrice, setUnitPrice] = useState("")
  const [costPrice, setCostPrice] = useState("")
  const [currency, setCurrency] = useState("MYR")
  const [taxRateId, setTaxRateId] = useState("")
  const [incomeAccountId, setIncomeAccountId] = useState("")
  const [expenseAccountId, setExpenseAccountId] = useState("")
  const [trackInventory, setTrackInventory] = useState(false)
  const [qtyOnHand, setQtyOnHand] = useState("")

  const populated = useRef(false)
  useEffect(() => {
    if (data && !populated.current) {
      populated.current = true
      setCode(data.code || "")
      setName(data.name || "")
      setDescription(data.description || "")
      setProductType(data.product_type || "service")
      setUnit(data.unit || "")
      setUnitPrice(data.unit_price != null ? String(data.unit_price) : "")
      setCostPrice(data.cost_price != null ? String(data.cost_price) : "")
      setCurrency(data.currency || "MYR")
      setTaxRateId(data.tax_rate_id || "")
      setIncomeAccountId(data.income_account_id || "")
      setExpenseAccountId(data.expense_account_id || "")
      setTrackInventory(data.track_inventory || false)
      setQtyOnHand(data.qty_on_hand != null ? String(data.qty_on_hand) : "")
    }
  }, [data])

  const incomeAccounts = accounts.filter(a => a.type === "income" || a.type === "revenue")
  const expenseAccounts = accounts.filter(a => a.type === "expense")

  const handleSave = () => {
    if (!name) return
    updateProduct.mutate(
      {
        id,
        code: code || null,
        name,
        description: description || null,
        product_type: productType,
        unit: unit || null,
        unit_price: parseFloat(unitPrice) || 0,
        cost_price: parseFloat(costPrice) || 0,
        currency,
        tax_rate_id: taxRateId || null,
        income_account_id: incomeAccountId || null,
        expense_account_id: expenseAccountId || null,
        track_inventory: trackInventory,
        qty_on_hand: parseFloat(qtyOnHand) || 0,
      },
      { onSuccess: () => navigate("/products") }
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-8">
      <div>
        <div className="text-xs text-muted-foreground">Inventory</div>
        <h1 className="mt-1 text-2xl font-bold text-foreground">Edit Product / Service</h1>
        <p className="mt-1 text-sm text-muted-foreground">Update this item in your product catalog</p>
      </div>

      <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="grid gap-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Product Code</label>
              <Input placeholder="e.g. PROD-001" value={code} onChange={e => setCode(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Type</label>
              <Select value={productType} onValueChange={setProductType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRODUCT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Name <span className="text-rose-500">*</span></label>
            <Input placeholder="Product or service name" value={name} onChange={e => setName(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Description</label>
            <textarea
              className="flex min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring placeholder:text-muted-foreground"
              placeholder="Optional description..."
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Unit Price</label>
              <Input type="number" min="0" step="0.01" placeholder="0.00" value={unitPrice} onChange={e => setUnitPrice(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Cost Price</label>
              <Input type="number" min="0" step="0.01" placeholder="0.00" value={costPrice} onChange={e => setCostPrice(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Unit</label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                <SelectContent>
                  {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Currency</label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["MYR", "SGD", "USD", "EUR", "AUD"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Tax Rate</label>
              <Select value={taxRateId} onValueChange={setTaxRateId}>
                <SelectTrigger><SelectValue placeholder="No tax" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No tax</SelectItem>
                  {taxRates.map(r => <SelectItem key={r.id} value={r.id}>{r.name} ({Number(r.rate).toFixed(1)}%)</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Income Account</label>
              <Select value={incomeAccountId} onValueChange={setIncomeAccountId}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {incomeAccounts.map(a => <SelectItem key={a.id} value={a.id}>{a.code} – {a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Expense Account</label>
              <Select value={expenseAccountId} onValueChange={setExpenseAccountId}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {expenseAccounts.map(a => <SelectItem key={a.id} value={a.id}>{a.code} – {a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {productType === "inventory" && (
            <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
              <div className="text-sm font-medium text-foreground">Inventory Tracking</div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={trackInventory} onChange={e => setTrackInventory(e.target.checked)} className="rounded" />
                <span className="text-sm text-foreground">Track inventory quantity</span>
              </label>
              {trackInventory && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Quantity on Hand</label>
                  <Input type="number" min="0" step="0.01" placeholder="0" value={qtyOnHand} onChange={e => setQtyOnHand(e.target.value)} />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => navigate("/products")}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={updateProduct.isPending || !name}
            className="bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] text-white"
          >
            {updateProduct.isPending ? "Saving..." : "Save Product"}
          </Button>
        </div>
      </Card>
    </div>
  )
}
