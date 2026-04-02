import { useDashboard } from "../../lib/hooks"
import { formatCurrency } from "../../lib/utils"
import { useTheme } from "../../lib/theme"
import { useNavigate } from "react-router-dom"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Plus, ChevronDown, FileText, Receipt } from "lucide-react"
import { useEffect, useState } from "react"
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"

type RangeKey = "7" | "30" | "60" | "365"
const RANGE_OPTIONS: { label: string; value: RangeKey }[] = [
  { label: "7-Day", value: "7" },
  { label: "30-Day", value: "30" },
  { label: "60-Day", value: "60" },
  { label: "365-Day", value: "365" },
]

function RangeDropdown({ value, onChange }: { value: RangeKey; onChange: (v: RangeKey) => void }) {
  const [open, setOpen] = useState(false)
  const current = RANGE_OPTIONS.find(o => o.value === value)!
  return (
    <div className="relative">
      <Button type="button" variant="secondary" className="h-8 rounded-xl px-2.5 text-xs font-medium" onClick={() => setOpen(v => !v)}>
        {current.label} <ChevronDown className="ml-1.5 h-4 w-4" />
      </Button>
      {open && (
        <div className="absolute right-0 top-9 z-50 w-32 rounded-xl border border-border bg-card p-1 shadow-lg">
          {RANGE_OPTIONS.map(o => (
            <button
              key={o.value}
              className={`flex w-full rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-muted ${o.value === value ? "text-primary" : "text-foreground"}`}
              onClick={() => { onChange(o.value); setOpen(false) }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const { data, isLoading } = useDashboard()
  const { t } = useTheme()
  const navigate = useNavigate()
  const [mounted, setMounted] = useState(false)
  const [rangeIncome, setRangeIncome] = useState<RangeKey>("7")
  const [rangePL, setRangePL] = useState<RangeKey>("7")
  const [rangeExpenses, setRangeExpenses] = useState<RangeKey>("7")
  const [rangeCash, setRangeCash] = useState<RangeKey>("7")
  useEffect(() => { setMounted(true) }, [])

  const makeChartData = (days: number) => {
    const labels = days <= 7
      ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
      : Array.from({ length: Math.min(days, 12) }, (_, i) => {
          const d = new Date()
          d.setDate(d.getDate() - (days - 1) + Math.floor(i * (days / 12)))
          return d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
        })
    return labels.map((label) => ({ label, value: 0 }))
  }

  const chartCards = [
    { title: t("dashboard.income"), netLabel: `NET ${formatCurrency(data?.total_revenue ?? 0)}`, data: makeChartData(Number(rangeIncome)), lineColor: "#7C9DFF", range: rangeIncome, setRange: setRangeIncome },
    { title: t("dashboard.profitLoss"), netLabel: `NET ${formatCurrency(data?.net_income ?? 0)}`, data: makeChartData(Number(rangePL)), lineColor: "#7C9DFF", range: rangePL, setRange: setRangePL },
    { title: t("dashboard.expenses"), netLabel: `NET ${formatCurrency(data?.total_expenses ?? 0)}`, data: makeChartData(Number(rangeExpenses)), lineColor: "#FF6B8A", range: rangeExpenses, setRange: setRangeExpenses },
    { title: t("dashboard.cashBalance"), netLabel: `${formatCurrency(data?.cash_balance ?? 0)}`, data: makeChartData(Number(rangeCash)), lineColor: "#5CE6C6", range: rangeCash, setRange: setRangeCash },
  ]

  if (isLoading) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground">{t("dashboard.loadingDashboard")}</div>
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Invoices & Bills summary */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="rounded-2xl border-border bg-card p-5 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
                <FileText className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">{t("dashboard.outstandingInvoices")}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{data?.overdue_invoices ?? 0} overdue</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-lg font-semibold text-foreground">{formatCurrency(data?.accounts_receivable ?? 0)}</div>
                <div className="text-[11px] text-muted-foreground">{t("dashboard.outstanding")}</div>
              </div>
              <Button type="button" size="icon" className="h-9 w-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] text-white shadow-sm hover:opacity-90" onClick={() => navigate("/sales/invoices")}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>

        <Card className="rounded-2xl border-border bg-card p-5 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10">
                <Receipt className="h-5 w-5 text-rose-600" />
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">{t("dashboard.outstandingBills")}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{data?.pending_documents ?? 0} pending</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-lg font-semibold text-foreground">{formatCurrency(data?.accounts_payable ?? 0)}</div>
                <div className="text-[11px] text-muted-foreground">{t("dashboard.outstanding")}</div>
              </div>
              <Button type="button" size="icon" className="h-9 w-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] text-white shadow-sm hover:opacity-90" onClick={() => navigate("/purchases/bills")}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Chart cards */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {chartCards.map((c) => (
          <Card key={c.title + c.lineColor} className="rounded-2xl border-border bg-card p-5 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-foreground">{c.title}</div>
                <div className="mt-1 flex items-center gap-2 text-[11px]">
                  <span className="font-semibold text-foreground">{c.netLabel}</span>
                </div>
              </div>
              <RangeDropdown value={c.range} onChange={c.setRange} />
            </div>
            <div className="mt-4 w-full min-h-[176px]">
              {mounted ? (
                <ResponsiveContainer width="100%" aspect={3.2}>
                  <LineChart data={c.data} margin={{ top: 6, right: 10, bottom: 0, left: -12 }}>
                    <CartesianGrid stroke="rgba(15,23,42,0.08)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: "rgba(15,23,42,0.50)", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis hide domain={[0, "dataMax"]} />
                    <Tooltip cursor={{ stroke: "rgba(124,157,255,0.35)" }} contentStyle={{ background: "rgba(255,255,255,0.98)", border: "1px solid rgba(15,23,42,0.12)", borderRadius: 12 }} />
                    <Line type="monotone" dataKey="value" stroke={c.lineColor} strokeWidth={2} dot={{ r: 3, fill: c.lineColor, strokeWidth: 0 }} activeDot={{ r: 4, fill: c.lineColor, stroke: "rgba(255,255,255,0.6)", strokeWidth: 1 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[176px] w-full rounded-xl border border-border bg-muted" />
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
