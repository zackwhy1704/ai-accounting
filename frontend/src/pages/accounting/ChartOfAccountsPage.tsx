import { useState } from "react"
import { Plus, Loader2 } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { formatCurrency } from "../../lib/utils"
import api from "../../lib/api"

interface Account {
  id: string
  code: string
  name: string
  account_type: string
  balance: number
  currency: string
  is_active: boolean
}

type AccountTypeFilter = "All" | "Assets" | "Liabilities" | "Equity" | "Revenue" | "Expenses"

const FILTER_TABS: AccountTypeFilter[] = ["All", "Assets", "Liabilities", "Equity", "Revenue", "Expenses"]

const TYPE_LABEL_MAP: Record<string, string> = {
  asset: "Assets",
  assets: "Assets",
  liability: "Liabilities",
  liabilities: "Liabilities",
  equity: "Equity",
  revenue: "Revenue",
  income: "Revenue",
  expense: "Expenses",
  expenses: "Expenses",
}

const TYPE_COLOR: Record<string, string> = {
  Assets: "bg-blue-100 text-blue-700",
  Liabilities: "bg-rose-100 text-rose-700",
  Equity: "bg-purple-100 text-purple-700",
  Revenue: "bg-emerald-100 text-emerald-700",
  Expenses: "bg-amber-100 text-amber-700",
}

export default function ChartOfAccountsPage() {
  const navigate = useNavigate()
  const [activeFilter, setActiveFilter] = useState<AccountTypeFilter>("All")

  const { data: accounts = [], isLoading } = useQuery<Account[]>({
    queryKey: ["accounts"],
    queryFn: () => api.get("/accounts").then(r => r.data),
  })

  const normaliseType = (t: string | undefined | null): string =>
    t ? (TYPE_LABEL_MAP[t.toLowerCase()] ?? t) : "Other"

  const filtered = activeFilter === "All"
    ? accounts
    : accounts.filter(a => normaliseType(a.account_type) === activeFilter)

  const grouped = filtered.reduce<Record<string, Account[]>>((acc, a) => {
    const type = normaliseType(a.account_type)
    if (!acc[type]) acc[type] = []
    acc[type].push(a)
    return acc
  }, {})

  const groupOrder = ["Assets", "Liabilities", "Equity", "Revenue", "Expenses"]
  const sortedGroups = Object.entries(grouped).sort(
    ([a], [b]) => groupOrder.indexOf(a) - groupOrder.indexOf(b)
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Accounting</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Chart of Accounts</div>
          <div className="mt-1 text-sm text-muted-foreground">All accounts used in your general ledger</div>
        </div>
        <Button
          type="button"
          onClick={() => navigate("/accounting/chart/new")}
          className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white"
        >
          <Plus className="mr-2 h-4 w-4" /> New Account
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {FILTER_TABS.map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveFilter(tab)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${activeFilter === tab ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
          >
            {tab}
          </button>
        ))}
      </div>

      <Card className="rounded-2xl border-border bg-card shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)] overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin inline" />
          </div>
        ) : accounts.length === 0 ? (
          <div className="py-12 text-center">
            <div className="text-sm font-semibold text-foreground">No accounts found</div>
            <div className="mt-1 text-xs text-muted-foreground">Create your first account to get started</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Code</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Balance</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {sortedGroups.map(([type, accs]) => (
                <>
                  <tr key={`group-${type}`} className="bg-muted/20">
                    <td colSpan={5} className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {type}
                    </td>
                  </tr>
                  {accs.map(a => (
                    <tr key={a.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{a.code}</td>
                      <td className="px-4 py-2.5 text-sm font-medium text-foreground">{a.name}</td>
                      <td className="px-4 py-2.5">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${TYPE_COLOR[type] ?? "bg-muted text-muted-foreground"}`}>
                          {type}
                        </span>
                      </td>
                      <td className={`px-4 py-2.5 text-right text-sm tabular-nums ${a.balance < 0 ? "text-rose-600" : "text-foreground"}`}>
                        {formatCurrency(a.balance, a.currency)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => navigate(`/accounting/chart/${a.id}`)}
                          className="text-xs text-primary hover:underline"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
