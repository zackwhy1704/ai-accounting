import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Plus, RefreshCw, Pause, Play, MoreHorizontal } from "lucide-react"
import { useRecurringInvoices, useContacts, usePauseRecurringInvoice, useResumeRecurringInvoice } from "../../../lib/hooks"
import { formatDate, cn } from "../../../lib/utils"
import { Card } from "../../../components/ui/card"
import { Button } from "../../../components/ui/button"
import { Badge } from "../../../components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table"
import { useToast } from "../../../components/ui/toast"

const statusColors: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-700 border-emerald-400/20",
  paused: "bg-amber-500/10 text-amber-700 border-amber-400/20",
  completed: "bg-blue-500/10 text-blue-700 border-blue-400/20",
  cancelled: "bg-rose-500/10 text-rose-700 border-rose-400/20",
}

const freqLabel: Record<string, string> = {
  daily: "Daily", weekly: "Weekly", monthly: "Monthly", yearly: "Yearly"
}

export default function RecurringInvoicesPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data: recurring = [], isLoading } = useRecurringInvoices()
  const { data: contacts = [] } = useContacts()
  const pause = usePauseRecurringInvoice()
  const resume = useResumeRecurringInvoice()
  const [openMenu, setOpenMenu] = useState<string | null>(null)

  const contactMap = useMemo(() => {
    const m = new Map<string, string>()
    contacts.forEach(c => m.set(c.id, c.name))
    return m
  }, [contacts])

  const handlePause = (id: string) => {
    pause.mutate(id, { onSuccess: () => toast("Recurring invoice paused", "success") })
    setOpenMenu(null)
  }

  const handleResume = (id: string) => {
    resume.mutate(id, { onSuccess: () => toast("Recurring invoice resumed", "success") })
    setOpenMenu(null)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Sales</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Recurring Invoices</div>
          <div className="mt-1 max-w-2xl text-sm text-muted-foreground">Automate repeating invoices sent on a schedule</div>
        </div>
        <Button type="button" onClick={() => navigate("/sales/recurring/new")} className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white shadow-[0_0_0_1px_rgba(124,157,255,0.25),0_16px_40px_rgba(0,0,0,0.35)] hover:opacity-95">
          <Plus className="mr-2 h-4 w-4" /> New Recurring Invoice
        </Button>
      </div>

      <Card className="rounded-2xl border-border bg-card p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        {isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading...</div>
        ) : recurring.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <RefreshCw className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="mt-4 text-base font-semibold text-foreground">No recurring invoices</div>
            <div className="mt-1 text-sm text-muted-foreground">Set up automatic billing for subscriptions or retainers</div>
            <Button type="button" onClick={() => navigate("/sales/recurring/new")} className="mt-6 h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white">
              <Plus className="mr-2 h-4 w-4" /> New Recurring Invoice
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Customer</TableHead>
                  <TableHead className="text-muted-foreground">Frequency</TableHead>
                  <TableHead className="text-muted-foreground">Next Run</TableHead>
                  <TableHead className="text-muted-foreground">Runs</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-right text-muted-foreground">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recurring.map(r => (
                  <TableRow key={r.id} className="border-border hover:bg-muted/50">
                    <TableCell className="font-medium text-foreground">{contactMap.get(r.contact_id) ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.frequency_interval > 1 ? `Every ${r.frequency_interval} ` : ""}{freqLabel[r.frequency] ?? r.frequency}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(r.next_run_date)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.run_count}{r.max_runs ? ` / ${r.max_runs}` : ""}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("rounded-lg px-2 py-0.5 text-[11px] font-semibold", statusColors[r.status] ?? "")}>
                        {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="relative inline-block">
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setOpenMenu(openMenu === r.id ? null : r.id)}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                        {openMenu === r.id && (
                          <div className="absolute right-0 top-8 z-50 w-48 rounded-xl border border-border bg-card p-1 shadow-lg" onMouseLeave={() => setOpenMenu(null)}>
                            {r.status === "active" ? (
                              <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-foreground hover:bg-muted" onClick={() => handlePause(r.id)}>
                                <Pause className="h-3.5 w-3.5" /> Pause
                              </button>
                            ) : r.status === "paused" ? (
                              <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-foreground hover:bg-muted" onClick={() => handleResume(r.id)}>
                                <Play className="h-3.5 w-3.5" /> Resume
                              </button>
                            ) : null}
                          </div>
                        )}
                      </div>
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
