import { useState } from "react"
import { RefreshCw, Plus, Trash2, Loader2, X, Check } from "lucide-react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { useToast } from "../../components/ui/toast"
import { formatDate } from "../../lib/utils"
import { useExchangeRates, useSyncExchangeRates, useCreateExchangeRate } from "../../lib/hooks"
import api from "../../lib/api"

interface ExchangeRate {
  id: string
  from_currency: string
  to_currency: string
  rate: number
  rate_date: string
  source: string
}

interface NewRateForm {
  from_currency: string
  to_currency: string
  rate: string
}

const EMPTY_FORM: NewRateForm = { from_currency: "USD", to_currency: "MYR", rate: "" }
const CURRENCIES = ["MYR", "SGD", "USD", "EUR", "GBP", "AUD", "JPY", "CNY", "THB", "IDR"]

export default function ExchangeRatesPage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<NewRateForm>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editRate, setEditRate] = useState("")

  const rates = useExchangeRates() as ExchangeRate[]
  const syncMutation = useSyncExchangeRates()
  const createMutation = useCreateExchangeRate()

  const updateMutation = useMutation({
    mutationFn: ({ id, rate }: { id: string; rate: number }) =>
      api.patch(`/exchange-rates/${id}`, { rate }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exchange-rates"] })
      setEditingId(null)
      toast("Rate updated", "success")
    },
    onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to update rate", "warning"),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/exchange-rates/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exchange-rates"] })
      toast("Rate deleted", "success")
    },
    onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to delete rate", "warning"),
  })

  const handleSync = () => {
    syncMutation.mutate(undefined, {
      onSuccess: () => toast("Exchange rates synced", "success"),
      onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to sync rates", "warning"),
    })
  }

  const handleCreate = () => {
    const rate = parseFloat(form.rate)
    if (!rate || rate <= 0) { toast("Enter a valid rate", "warning"); return }
    if (form.from_currency === form.to_currency) { toast("From and To currencies must differ", "warning"); return }
    createMutation.mutate(
      { from_currency: form.from_currency, to_currency: form.to_currency, rate, source: "manual" },
      {
        onSuccess: () => { setShowForm(false); setForm(EMPTY_FORM); toast("Rate added", "success") },
        onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to add rate", "warning"),
      }
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Settings</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Exchange Rates</div>
          <div className="mt-1 text-sm text-muted-foreground">Manage currency exchange rates for multi-currency documents</div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={handleSync}
            disabled={syncMutation.isPending}
            className="h-9 rounded-xl px-3 text-xs font-semibold"
          >
            {syncMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
            Sync Rates
          </Button>
          <Button
            type="button"
            onClick={() => setShowForm(true)}
            className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white"
          >
            <Plus className="mr-1.5 h-4 w-4" /> Add Rate
          </Button>
        </div>
      </div>

      {showForm && (
        <Card className="rounded-2xl border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-foreground">Add Manual Rate</p>
            <button type="button" onClick={() => { setShowForm(false); setForm(EMPTY_FORM) }} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">From Currency</label>
              <select value={form.from_currency} onChange={e => setForm(p => ({ ...p, from_currency: e.target.value }))} className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40">
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">To Currency</label>
              <select value={form.to_currency} onChange={e => setForm(p => ({ ...p, to_currency: e.target.value }))} className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40">
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Rate (6 decimal precision)</label>
              <Input type="number" step="0.000001" placeholder="e.g. 4.450000" value={form.rate} onChange={e => setForm(p => ({ ...p, rate: e.target.value }))} className="h-9 text-sm font-mono" />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => { setShowForm(false); setForm(EMPTY_FORM) }}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending} className="bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] text-white">
              {createMutation.isPending ? <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Saving…</> : "Add Rate"}
            </Button>
          </div>
        </Card>
      )}

      <Card className="rounded-2xl border-border bg-card shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)] overflow-hidden">
        {!rates || rates.length === 0 ? (
          <div className="py-12 text-center">
            <div className="text-sm font-semibold text-foreground">No exchange rates</div>
            <div className="mt-1 text-xs text-muted-foreground">Click "Sync Rates" to pull live rates, or add a manual rate</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Pair</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Rate</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Effective Date</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Source</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rates.map((r: ExchangeRate) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5 font-mono font-semibold text-foreground">
                    {r.from_currency} → {r.to_currency}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">
                    {editingId === r.id ? (
                      <div className="flex items-center gap-2">
                        <Input type="number" step="0.000001" value={editRate} onChange={e => setEditRate(e.target.value)} className="h-7 w-32 text-xs font-mono" autoFocus />
                        <button type="button" onClick={() => updateMutation.mutate({ id: r.id, rate: parseFloat(editRate) })} className="text-emerald-600 hover:text-emerald-700"><Check className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    ) : (
                      <span className="font-mono">{r.rate.toFixed(6)}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{formatDate(r.rate_date)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${r.source === "manual" ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700"}`}>
                      {r.source}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button type="button" onClick={() => { setEditingId(r.id); setEditRate(r.rate.toFixed(6)) }} className="text-xs text-primary hover:underline">Edit</button>
                      <button type="button" onClick={() => { if (confirm("Delete this exchange rate?")) deleteMutation.mutate(r.id) }} className="text-xs text-rose-500 hover:text-rose-600">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
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
