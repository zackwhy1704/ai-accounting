import { useNavigate } from "react-router-dom"
import { TrendingUp, Scale, BookOpen, Users, Building2, Receipt, Landmark, Package, ChevronRight } from "lucide-react"
import { Card } from "../../components/ui/card"

interface ReportLink {
  label: string
  route: string
  available: boolean
}

interface ReportCategory {
  title: string
  icon: React.ReactNode
  color: string
  reports: ReportLink[]
}

const CATEGORIES: ReportCategory[] = [
  {
    title: "Financial",
    icon: <TrendingUp className="h-4 w-4" />,
    color: "from-emerald-500 to-teal-600",
    reports: [
      { label: "Profit & Loss", route: "/reports/profit-loss", available: true },
      { label: "Balance Sheet", route: "/reports/balance-sheet", available: true },
      { label: "Cash Flow Statement", route: "/reports/cash-flow", available: true },
      { label: "Trial Balance", route: "/reports/trial-balance", available: true },
      { label: "General Ledger", route: "/reports/general-ledger", available: true },
    ],
  },
  {
    title: "Sales",
    icon: <Users className="h-4 w-4" />,
    color: "from-blue-500 to-indigo-600",
    reports: [
      { label: "Invoice Summary", route: "/reports/invoice-summary", available: true },
      { label: "Aged Receivables", route: "/reports/aged-receivables", available: true },
      { label: "Debtor Ledger", route: "/reports/debtor-ledger", available: true },
      { label: "Payment Summary", route: "/reports/payment-summary", available: true },
    ],
  },
  {
    title: "Purchases",
    icon: <Building2 className="h-4 w-4" />,
    color: "from-violet-500 to-purple-600",
    reports: [
      { label: "Bill Summary", route: "/reports/bill-summary", available: true },
      { label: "Aged Payables", route: "/reports/aged-payables", available: true },
      { label: "Creditor Ledger", route: "/reports/creditor-ledger", available: true },
    ],
  },
  {
    title: "Inventory",
    icon: <Package className="h-4 w-4" />,
    color: "from-amber-500 to-orange-600",
    reports: [
      { label: "Stock Values", route: "/reports/stock-values", available: true },
      { label: "Inventory Summary", route: "/reports/inventory-summary", available: true },
    ],
  },
  {
    title: "Tax",
    icon: <Receipt className="h-4 w-4" />,
    color: "from-rose-500 to-red-600",
    reports: [
      { label: "SST-02 Return", route: "/reports/sst-02", available: true },
      { label: "SST Sales Detail", route: "/reports/sst-sales-detail", available: true },
      { label: "SST Purchase Detail", route: "/reports/sst-purchase-detail", available: true },
    ],
  },
  {
    title: "Banking",
    icon: <Landmark className="h-4 w-4" />,
    color: "from-cyan-500 to-sky-600",
    reports: [
      { label: "Bank Reconciliation", route: "/reports/bank-reconciliation", available: true },
      { label: "Transaction List", route: "/reports/transaction-list", available: true },
      { label: "Exchange Rates", route: "/reports/exchange-rates", available: false },
    ],
  },
]

export default function ReportsIndexPage() {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Analytics</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Reports</div>
        <div className="mt-1 text-sm text-muted-foreground">Financial reports and analytics for your business</div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORIES.map(cat => (
          <Card key={cat.title} className="rounded-2xl border-border bg-card p-5 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
            {/* Category header */}
            <div className="mb-4 flex items-center gap-3">
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${cat.color} text-white shadow-sm`}>
                {cat.icon}
              </div>
              <div className="text-sm font-semibold text-foreground">{cat.title}</div>
            </div>

            {/* Report links */}
            <div className="space-y-0.5">
              {cat.reports.map(report => (
                <button
                  key={report.route}
                  type="button"
                  disabled={!report.available}
                  onClick={() => report.available && navigate(report.route)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors
                    ${report.available
                      ? "text-foreground hover:bg-muted/50 cursor-pointer"
                      : "text-muted-foreground/50 cursor-not-allowed"
                    }`}
                >
                  <span>{report.label}</span>
                  <div className="flex items-center gap-1.5">
                    {!report.available && (
                      <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-muted text-muted-foreground">
                        Soon
                      </span>
                    )}
                    {report.available && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                  </div>
                </button>
              ))}
            </div>
          </Card>
        ))}
      </div>

      {/* Quick access row */}
      <div>
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quick Access</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Trial Balance", route: "/reports/trial-balance", icon: <Scale className="h-4 w-4" />, color: "bg-amber-100 text-amber-700" },
            { label: "General Ledger", route: "/reports/general-ledger", icon: <BookOpen className="h-4 w-4" />, color: "bg-blue-100 text-blue-700" },
            { label: "Aged Receivables", route: "/reports/aged-receivables", icon: <Users className="h-4 w-4" />, color: "bg-emerald-100 text-emerald-700" },
            { label: "SST-02", route: "/reports/sst-02", icon: <Receipt className="h-4 w-4" />, color: "bg-rose-100 text-rose-700" },
          ].map(item => (
            <button
              key={item.route}
              type="button"
              onClick={() => navigate(item.route)}
              className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left hover:shadow-md transition-shadow"
            >
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${item.color}`}>
                {item.icon}
              </div>
              <span className="text-sm font-medium text-foreground">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
