import { useDashboard } from "../../lib/hooks"
import { formatCurrency } from "../../lib/utils"
import { useTheme } from "../../lib/theme"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Minus, Plus, ChevronDown, Settings } from "lucide-react"
import { useEffect, useState } from "react"
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"

const sevenDayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

export default function DashboardPage() {
  const { data, isLoading } = useDashboard()
  const { t } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const summaryMetrics = [
    { title: t("dashboard.accountsReceivable"), value: formatCurrency(data?.accounts_receivable ?? 0), subtitle: t("dashboard.outstanding"), icon: "plus" as const },
    { title: t("dashboard.overdueInvoices"), value: String(data?.overdue_invoices ?? 0), subtitle: t("dashboard.needAttention"), icon: "plus" as const },
    { title: t("dashboard.accountsPayable"), value: formatCurrency(data?.accounts_payable ?? 0), subtitle: t("dashboard.outstanding"), icon: "minus" as const },
    { title: t("dashboard.pendingDocuments"), value: String(data?.pending_documents ?? 0), subtitle: t("dashboard.aiProcessing"), icon: "minus" as const },
  ]

  const agingWidgets = [
    {
      title: t("dashboard.outstandingInvoices"),
      buckets: [
        { label: t("dashboard.upcoming"), color: "#7C9DFF" },
        { label: "1-30", color: "#6C7CFF" },
        { label: "31-60", color: "#4D63FF" },
        { label: "61-90", color: "#3A4DFF" },
        { label: "91+", color: "#2B35D8" },
      ],
    },
    {
      title: t("dashboard.outstandingBills"),
      buckets: [
        { label: t("dashboard.upcoming"), color: "#7C9DFF" },
        { label: "1-30", color: "#6C7CFF" },
        { label: "31-60", color: "#4D63FF" },
        { label: "61-90", color: "#3A4DFF" },
        { label: "91+", color: "#2B35D8" },
      ],
    },
  ]

  const incomeData = sevenDayLabels.map((label) => ({ label, value: 0 }))
  const chartCards = [
    { title: t("dashboard.income"), netLabel: `NET ${formatCurrency(data?.total_revenue ?? 0)}`, data: incomeData, lineColor: "#7C9DFF" },
    { title: t("dashboard.profitLoss"), netLabel: `NET ${formatCurrency(data?.net_income ?? 0)}`, data: incomeData, lineColor: "#7C9DFF" },
    { title: t("dashboard.expenses"), netLabel: `NET ${formatCurrency(data?.total_expenses ?? 0)}`, data: incomeData, lineColor: "#FF6B8A" },
    { title: t("dashboard.cashBalance"), netLabel: `${formatCurrency(data?.cash_balance ?? 0)}`, data: incomeData, lineColor: "#5CE6C6" },
  ]

  if (isLoading) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground">{t("dashboard.loadingDashboard")}</div>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        {summaryMetrics.map((m) => {
          const Icon = m.icon === "plus" ? Plus : Minus
          return (
            <Card key={m.title} className="rounded-2xl border-border bg-card p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-semibold tracking-widest text-muted-foreground">{m.title}</div>
                  <div className="mt-2 text-lg font-semibold text-foreground">{m.value}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{m.subtitle}</div>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-muted">
                  <Icon className="h-4 w-4 text-foreground" />
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {agingWidgets.map((w) => (
          <Card key={w.title} className="rounded-2xl border-border bg-card p-5 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
            <div className="text-sm font-semibold text-foreground">{w.title}</div>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-3">
              {w.buckets.map((b) => (
                <div key={b.label} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: b.color }} />
                  <span className="text-xs text-muted-foreground">{b.label}</span>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {chartCards.map((c) => (
          <Card key={c.title + c.lineColor} className="rounded-2xl border-border bg-card p-5 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-foreground">{c.title}</div>
                <div className="mt-1 flex items-center gap-2 text-[11px]">
                  <span className="font-semibold text-foreground">{c.netLabel}</span>
                  <span className="text-muted-foreground">{t("dashboard.7day")}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" className="h-8 rounded-xl px-2.5 text-xs font-medium">
                  7-Day <ChevronDown className="ml-1.5 h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
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
