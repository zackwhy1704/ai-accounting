import { QueryError } from "../../components/ui/query-error"
import { useState } from "react"
import { Loader2, Download, Printer, FileSpreadsheet } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { formatCurrency, downloadCSV, downloadXLSX, printReport } from "../../lib/utils"
import api from "../../lib/api"

interface PLLine {
  code: string
  name: string
  amount: number
  budget?: number
  variance?: number
  comparative?: number
  change?: number
}

interface ProfitLossReport {
  start_date: string
  end_date: string
  currency: string
  basis?: string
  sections: {
    revenue: { total: number; invoice_count: number; lines?: PLLine[] }
    expenses: { total: number; bill_count: number; lines?: PLLine[] }
  }
  net_income: number
  budget?: { revenue_total: number; expense_total: number; net_income: number; net_variance: number }
  comparative?: { start_date: string; end_date: string; revenue_total: number; expense_total: number; net_income: number }
}

interface Dimension { id: string; name: string; code: string | null }

export default function ProfitLossPage() {
  const thisYear = new Date().getFullYear()
  const today = new Date().toISOString().slice(0, 10)
  const [fromDate, setFromDate] = useState(`${thisYear}-01-01`)
  const [toDate, setToDate] = useState(today)
  const [compare, setCompare] = useState("")
  const [includeBudget, setIncludeBudget] = useState(false)
  const [projectId, setProjectId] = useState("")
  const [departmentId, setDepartmentId] = useState("")
  const [queryParams, setQueryParams] = useState({
    fromDate: `${thisYear}-01-01`, toDate: today, compare: "", includeBudget: false, projectId: "", departmentId: "",
  })

  const { data: projects = [] } = useQuery<Dimension[]>({
    queryKey: ["dimensions", "projects"],
    queryFn: () => api.get("/dimensions/projects").then(r => r.data),
  })
  const { data: departments = [] } = useQuery<Dimension[]>({
    queryKey: ["dimensions", "departments"],
    queryFn: () => api.get("/dimensions/departments").then(r => r.data),
  })

  const { data, isLoading, isFetching, isError, error } = useQuery<ProfitLossReport>({
    queryKey: ["report-profit-loss", queryParams],
    queryFn: () => api.get("/reports/profit-loss", {
      params: {
        start_date: queryParams.fromDate,
        end_date: queryParams.toDate,
        ...(queryParams.compare ? { compare: queryParams.compare } : {}),
        ...(queryParams.includeBudget ? { include_budget: true } : {}),
        ...(queryParams.projectId ? { project_id: queryParams.projectId } : {}),
        ...(queryParams.departmentId ? { department_id: queryParams.departmentId } : {}),
      },
    }).then(r => r.data),
  })

  const hasBudget = !!data?.budget
  const hasComparative = !!data?.comparative
  const extraCols = (hasBudget ? 2 : 0) + (hasComparative ? 2 : 0)

  const buildRows = (): (string | number)[][] => {
    if (!data) return []
    const header = ["Account", "Actual",
      ...(hasBudget ? ["Budget", "Variance"] : []),
      ...(hasComparative ? ["Comparative", "Change"] : [])]
    const lineRow = (l: PLLine) => [
      `${l.code} ${l.name}`, l.amount.toFixed(2),
      ...(hasBudget ? [(l.budget ?? 0).toFixed(2), (l.variance ?? 0).toFixed(2)] : []),
      ...(hasComparative ? [(l.comparative ?? 0).toFixed(2), (l.change ?? 0).toFixed(2)] : []),
    ]
    return [
      header,
      ["REVENUE"],
      ...((data.sections.revenue.lines ?? []).map(lineRow)),
      ["Total Revenue", data.sections.revenue.total.toFixed(2),
        ...(hasBudget ? [data.budget!.revenue_total.toFixed(2), ""] : []),
        ...(hasComparative ? [data.comparative!.revenue_total.toFixed(2), ""] : [])],
      [],
      ["EXPENSES"],
      ...((data.sections.expenses.lines ?? []).map(lineRow)),
      ["Total Expenses", data.sections.expenses.total.toFixed(2),
        ...(hasBudget ? [data.budget!.expense_total.toFixed(2), ""] : []),
        ...(hasComparative ? [data.comparative!.expense_total.toFixed(2), ""] : [])],
      [],
      ["Net Income", data.net_income.toFixed(2),
        ...(hasBudget ? [data.budget!.net_income.toFixed(2), data.budget!.net_variance.toFixed(2)] : []),
        ...(hasComparative ? [data.comparative!.net_income.toFixed(2), (data.net_income - data.comparative!.net_income).toFixed(2)] : [])],
    ]
  }

  const Cell = ({ v, bold = false, negative = false }: { v: string; bold?: boolean; negative?: boolean }) => (
    <td className={`px-3 py-2 text-right text-sm tabular-nums ${bold ? "font-bold" : ""} ${negative ? "text-rose-600" : "text-foreground"}`}>{v}</td>
  )

  const LineRow = ({ l }: { l: PLLine }) => (
    <tr className="border-b border-border last:border-0">
      <td className="px-3 py-2 text-sm text-muted-foreground">{l.code} — {l.name}</td>
      <Cell v={formatCurrency(l.amount)} />
      {hasBudget && <Cell v={formatCurrency(l.budget ?? 0)} />}
      {hasBudget && <Cell v={formatCurrency(l.variance ?? 0)} negative={(l.variance ?? 0) < 0} />}
      {hasComparative && <Cell v={formatCurrency(l.comparative ?? 0)} />}
      {hasComparative && <Cell v={formatCurrency(l.change ?? 0)} negative={(l.change ?? 0) < 0} />}
    </tr>
  )

  const TotalRow = ({ label, actual, budget, comparative, negative = false }: {
    label: string; actual: number; budget?: number; comparative?: number; negative?: boolean
  }) => (
    <tr className="border-b border-border bg-muted/30 last:border-0">
      <td className="px-3 py-2 text-sm font-semibold text-foreground">{label}</td>
      <Cell v={formatCurrency(actual)} bold negative={negative && actual < 0} />
      {hasBudget && <Cell v={budget !== undefined ? formatCurrency(budget) : ""} bold />}
      {hasBudget && <Cell v={budget !== undefined ? formatCurrency(actual - budget) : ""} bold negative={budget !== undefined && actual - budget < 0} />}
      {hasComparative && <Cell v={comparative !== undefined ? formatCurrency(comparative) : ""} bold />}
      {hasComparative && <Cell v={comparative !== undefined ? formatCurrency(actual - comparative) : ""} bold negative={comparative !== undefined && actual - comparative < 0} />}
    </tr>
  )

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Reports</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Profit &amp; Loss</div>
        <div className="mt-1 text-sm text-muted-foreground">Revenue, expenses and net income for a period</div>
      </div>

      {data && (
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={() => downloadCSV(`profit-loss-${data.start_date}-${data.end_date}.csv`, buildRows().map(r => r.map(String)))}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => {
            const rows = buildRows()
            downloadXLSX(`profit-loss-${data.start_date}-${data.end_date}`, "Profit & Loss", rows[0].map(String), rows.slice(1))
          }}>
            <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={printReport}>
            <Printer className="mr-1.5 h-3.5 w-3.5" /> Print / PDF
          </Button>
        </div>
      )}

      <Card className="rounded-2xl border-border bg-card p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">From Date</label>
            <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-9 text-sm w-40" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">To Date</label>
            <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-9 text-sm w-40" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Compare</label>
            <select value={compare} onChange={e => setCompare(e.target.value)} className="h-9 rounded-md border border-border bg-background px-3 text-sm">
              <option value="">No comparison</option>
              <option value="previous_period">Previous period</option>
              <option value="previous_year">Previous year</option>
            </select>
          </div>
          {projects.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Project</label>
              <select value={projectId} onChange={e => setProjectId(e.target.value)} className="h-9 rounded-md border border-border bg-background px-3 text-sm">
                <option value="">All projects</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          {departments.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Department</label>
              <select value={departmentId} onChange={e => setDepartmentId(e.target.value)} className="h-9 rounded-md border border-border bg-background px-3 text-sm">
                <option value="">All departments</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          )}
          <label className="flex h-9 items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={includeBudget} onChange={e => setIncludeBudget(e.target.checked)} className="h-4 w-4" />
            Budget vs actual
          </label>
          <Button
            type="button"
            onClick={() => setQueryParams({ fromDate, toDate, compare, includeBudget, projectId, departmentId })}
            className="h-9 bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-4 text-sm text-white"
            disabled={isFetching}
          >
            {isFetching ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
            Update
          </Button>
        </div>
      </Card>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Generating report…
        </div>
      ) : data ? (
        <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)] overflow-x-auto">
          {hasComparative && (
            <div className="mb-3 text-xs text-muted-foreground">
              Comparative period: {data.comparative!.start_date} — {data.comparative!.end_date}
            </div>
          )}
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b-2 border-border">
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Account</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actual</th>
                {hasBudget && <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Budget</th>}
                {hasBudget && <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Variance</th>}
                {hasComparative && <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Comparative</th>}
                {hasComparative && <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Change</th>}
              </tr>
            </thead>
            <tbody>
              <tr><td colSpan={2 + extraCols} className="px-3 pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Revenue</td></tr>
              {(data.sections.revenue.lines ?? []).map(l => <LineRow key={`r-${l.code}`} l={l} />)}
              <TotalRow label="Total Revenue" actual={data.sections.revenue.total} budget={data.budget?.revenue_total} comparative={data.comparative?.revenue_total} />

              <tr><td colSpan={2 + extraCols} className="px-3 pt-5 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Expenses</td></tr>
              {(data.sections.expenses.lines ?? []).map(l => <LineRow key={`e-${l.code}`} l={l} />)}
              <TotalRow label="Total Expenses" actual={data.sections.expenses.total} budget={data.budget?.expense_total} comparative={data.comparative?.expense_total} />

              <tr><td colSpan={2 + extraCols} className="pt-3" /></tr>
              <TotalRow label="Net Income" actual={data.net_income} budget={data.budget?.net_income} comparative={data.comparative?.net_income} negative />
            </tbody>
          </table>
        </Card>
      ) : isError ? (
        <Card className="rounded-2xl border-border bg-card p-4 shadow-sm"><QueryError error={error} message="Couldn't generate this report." /></Card>
      ) : null}
    </div>
  )
}
