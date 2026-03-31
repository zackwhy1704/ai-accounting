import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Plus, BookOpen, MoreHorizontal, CheckCircle, XCircle } from "lucide-react"
import { useManualJournals } from "../../lib/hooks"
import { formatDate, formatCurrency } from "../../lib/utils"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Badge } from "../../components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table"
import { cn } from "../../lib/utils"

const statusColors: Record<string, string> = {
  draft: "bg-slate-500/10 text-slate-600 border-slate-300/20",
  posted: "bg-emerald-500/10 text-emerald-700 border-emerald-400/20",
  void: "bg-rose-500/10 text-rose-700 border-rose-400/20",
}

export default function ManualJournalsPage() {
  const navigate = useNavigate()
  const { data: journals = [], isLoading } = useManualJournals()

  const totalDebit = (j: typeof journals[0]) =>
    j.lines.reduce((s, l) => s + Number(l.debit), 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Accounting</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Manual Journals</div>
          <div className="mt-1 max-w-2xl text-sm text-muted-foreground">Record direct general ledger journal entries</div>
        </div>
        <Button type="button" onClick={() => navigate("/accounting/journals/new")} className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white shadow-[0_0_0_1px_rgba(124,157,255,0.25),0_16px_40px_rgba(0,0,0,0.35)] hover:opacity-95">
          <Plus className="mr-2 h-4 w-4" /> New Journal Entry
        </Button>
      </div>

      <Card className="rounded-2xl border-border bg-card p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        {isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading...</div>
        ) : journals.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <BookOpen className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="mt-4 text-base font-semibold text-foreground">No journal entries</div>
            <div className="mt-1 text-sm text-muted-foreground">Manual journals are used for accruals, adjustments, and corrections</div>
            <Button type="button" onClick={() => navigate("/accounting/journals/new")} className="mt-6 h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white">
              <Plus className="mr-2 h-4 w-4" /> New Journal Entry
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">No.</TableHead>
                  <TableHead className="text-muted-foreground">Date</TableHead>
                  <TableHead className="text-muted-foreground">Description</TableHead>
                  <TableHead className="text-muted-foreground">Reference</TableHead>
                  <TableHead className="text-right text-muted-foreground">Amount</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {journals.map(j => (
                  <TableRow key={j.id} className="border-border hover:bg-muted/50 cursor-pointer" onClick={() => navigate(`/accounting/journals/${j.id}`)}>
                    <TableCell className="font-medium text-foreground">{j.journal_number}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(j.date)}</TableCell>
                    <TableCell className="text-foreground">{j.description ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{j.reference ?? "—"}</TableCell>
                    <TableCell className="text-right text-foreground">{formatCurrency(totalDebit(j), j.currency)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("rounded-lg px-2 py-0.5 text-[11px] font-semibold", statusColors[j.status] ?? "")}>
                        {j.status.charAt(0).toUpperCase() + j.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={e => e.stopPropagation()}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
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
