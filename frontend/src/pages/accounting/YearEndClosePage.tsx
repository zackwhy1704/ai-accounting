import { useState } from "react"
import { Loader2, Lock, Undo2, CalendarCheck } from "lucide-react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { useToast } from "../../components/ui/toast"
import { formatCurrency, formatDate } from "../../lib/utils"
import api from "../../lib/api"

interface YearEndStatus {
  closes: Array<{ id: string; date: string; description: string }>
  next_close: {
    fiscal_year_end: string
    net_income: number
    accounts_to_close: number
    already_closed: boolean
  }
}

export default function YearEndClosePage() {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [lockPeriod, setLockPeriod] = useState(true)

  const { data, isLoading } = useQuery<YearEndStatus>({
    queryKey: ["year-end-close"],
    queryFn: () => api.get("/accounting/year-end-close").then(r => r.data),
  })

  const runClose = useMutation({
    mutationFn: () => api.post("/accounting/year-end-close", { lock_period: lockPeriod }).then(r => r.data),
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ["year-end-close"] })
      toast(`Year closed — ${formatCurrency(d.net_income_transferred)} transferred to Retained Earnings`, "success")
    },
    onError: (e: any) => toast(e?.response?.data?.detail ?? "Year-end close failed", "warning"),
  })

  const undoClose = useMutation({
    mutationFn: () => api.post("/accounting/year-end-close/undo").then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["year-end-close"] })
      toast("Latest year-end close undone", "success")
    },
    onError: (e: any) => toast(e?.response?.data?.detail ?? "Undo failed", "warning"),
  })

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Accounting</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Year-End Close</div>
        <div className="mt-1 text-sm text-muted-foreground">
          Sweep revenue and expenses into Retained Earnings and lock the closed year
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…
        </div>
      ) : data ? (
        <>
          <Card className="rounded-2xl border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <CalendarCheck className="h-4 w-4 text-muted-foreground" />
              <div className="text-sm font-semibold text-foreground">Next close preview</div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border p-4">
                <div className="text-xs text-muted-foreground">Fiscal year ending</div>
                <div className="mt-1 text-lg font-semibold text-foreground">{formatDate(data.next_close.fiscal_year_end)}</div>
              </div>
              <div className="rounded-xl border border-border p-4">
                <div className="text-xs text-muted-foreground">Net income to transfer</div>
                <div className={`mt-1 text-lg font-semibold ${data.next_close.net_income < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                  {formatCurrency(data.next_close.net_income)}
                </div>
              </div>
              <div className="rounded-xl border border-border p-4">
                <div className="text-xs text-muted-foreground">P&L accounts to sweep</div>
                <div className="mt-1 text-lg font-semibold text-foreground">{data.next_close.accounts_to_close}</div>
              </div>
            </div>

            <label className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={lockPeriod} onChange={e => setLockPeriod(e.target.checked)} className="h-4 w-4" />
              Lock the period through the fiscal year end after closing
            </label>

            <div className="mt-4 flex justify-end gap-2">
              {data.closes.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { if (confirm("Undo the most recent year-end close? The closing journal will be deleted.")) undoClose.mutate() }}
                  disabled={undoClose.isPending}
                >
                  {undoClose.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Undo2 className="mr-2 h-3.5 w-3.5" />}
                  Undo Last Close
                </Button>
              )}
              <Button
                type="button"
                onClick={() => {
                  if (confirm(`Close the fiscal year ending ${formatDate(data.next_close.fiscal_year_end)}? Revenue and expense accounts will be zeroed into Retained Earnings.`))
                    runClose.mutate()
                }}
                disabled={runClose.isPending || data.next_close.already_closed || data.next_close.accounts_to_close === 0}
                className="bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] text-white"
              >
                {runClose.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Lock className="mr-2 h-3.5 w-3.5" />}
                {data.next_close.already_closed ? "Already Closed" : "Run Year-End Close"}
              </Button>
            </div>
          </Card>

          <Card className="rounded-2xl border-border bg-card shadow-sm overflow-hidden">
            <div className="p-4 text-sm font-semibold text-foreground">Past closes</div>
            {data.closes.length === 0 ? (
              <div className="px-4 pb-6 text-sm text-muted-foreground">No year-end closes yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Date</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {data.closes.map(c => (
                    <tr key={c.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2.5 text-sm text-foreground">{formatDate(c.date)}</td>
                      <td className="px-4 py-2.5 text-sm text-muted-foreground">{c.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      ) : null}
    </div>
  )
}
