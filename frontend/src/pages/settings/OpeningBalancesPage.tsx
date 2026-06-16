import { useState, useEffect, useMemo } from "react"
import { Loader2, Save } from "lucide-react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { useToast } from "../../components/ui/toast"
import { useAccounts } from "../../lib/hooks"
import api from "../../lib/api"

interface ExistingLine {
  account_id: string
  account_code: string
  account_name: string
  debit: number
  credit: number
}

// Balance-sheet account types only (P&L accounts don't carry opening balances)
const BS_TYPES = ["asset", "liability", "equity"]

export default function OpeningBalancesPage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { data: accounts = [] } = useAccounts()
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10))
  const [rows, setRows] = useState<Record<string, { debit: string; credit: string }>>({})

  const { data: existing } = useQuery<{ exists: boolean; as_of_date?: string; lines: ExistingLine[] }>({
    queryKey: ["opening-balances"],
    queryFn: () => api.get("/accounting/opening-balances").then(r => r.data),
  })

  useEffect(() => {
    if (existing?.exists) {
      if (existing.as_of_date) setAsOfDate(existing.as_of_date.slice(0, 10))
      const m: Record<string, { debit: string; credit: string }> = {}
      existing.lines.forEach(l => { m[l.account_id] = { debit: l.debit ? String(l.debit) : "", credit: l.credit ? String(l.credit) : "" } })
      setRows(m)
    }
  }, [existing])

  const bsAccounts = useMemo(
    () => accounts.filter((a: any) => BS_TYPES.includes(a.type) && a.account_role !== "header" && a.account_role !== "subheader"),
    [accounts]
  )

  const totals = useMemo(() => {
    let dr = 0, cr = 0
    Object.values(rows).forEach(r => { dr += parseFloat(r.debit) || 0; cr += parseFloat(r.credit) || 0 })
    return { dr, cr, diff: dr - cr }
  }, [rows])

  const save = useMutation({
    mutationFn: () => {
      const lines = Object.entries(rows)
        .map(([account_id, v]) => ({ account_id, debit: parseFloat(v.debit) || 0, credit: parseFloat(v.credit) || 0 }))
        .filter(l => l.debit > 0 || l.credit > 0)
      return api.post("/accounting/opening-balances", { as_of_date: new Date(asOfDate).toISOString(), lines }).then(r => r.data)
    },
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ["opening-balances"] })
      const plug = d.imbalance_to_retained_earnings
      toast(plug ? `Opening balances saved. ${Math.abs(plug).toFixed(2)} posted to Retained Earnings.` : "Opening balances saved", "success")
    },
    onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to save opening balances", "warning"),
  })

  const setCell = (id: string, field: "debit" | "credit", val: string) =>
    setRows(p => ({ ...p, [id]: { debit: field === "debit" ? val : (p[id]?.debit ?? ""), credit: field === "credit" ? val : (p[id]?.credit ?? "") } }))

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Settings</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Opening Balances</div>
        <div className="mt-1 text-sm text-muted-foreground">Enter balance-sheet account balances when migrating from another system. Any imbalance posts to Retained Earnings.</div>
      </div>

      <Card className="rounded-2xl border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-end gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">As of date</label>
            <Input type="date" value={asOfDate} onChange={e => setAsOfDate(e.target.value)} className="h-9 text-sm w-44" />
          </div>
          <div className="ml-auto text-xs text-muted-foreground">
            Debits {totals.dr.toFixed(2)} · Credits {totals.cr.toFixed(2)}
            {Math.abs(totals.diff) > 0.005 && <span className="ml-2 text-amber-600">→ {Math.abs(totals.diff).toFixed(2)} to Retained Earnings</span>}
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="px-2 py-2 text-left">Account</th>
              <th className="px-2 py-2 text-right w-40">Debit</th>
              <th className="px-2 py-2 text-right w-40">Credit</th>
            </tr>
          </thead>
          <tbody>
            {bsAccounts.map((a: any) => (
              <tr key={a.id} className="border-b border-border last:border-0">
                <td className="px-2 py-1.5"><span className="text-muted-foreground">{a.code}</span> — {a.name}</td>
                <td className="px-2 py-1.5"><Input type="number" step="0.01" value={rows[a.id]?.debit ?? ""} onChange={e => setCell(a.id, "debit", e.target.value)} className="h-8 text-right text-xs" /></td>
                <td className="px-2 py-1.5"><Input type="number" step="0.01" value={rows[a.id]?.credit ?? ""} onChange={e => setCell(a.id, "credit", e.target.value)} className="h-8 text-right text-xs" /></td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex justify-end">
          <Button onClick={() => save.mutate()} disabled={save.isPending} className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white">
            {save.isPending ? <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Saving…</> : <><Save className="mr-2 h-3.5 w-3.5" />Save Opening Balances</>}
          </Button>
        </div>
      </Card>
    </div>
  )
}
