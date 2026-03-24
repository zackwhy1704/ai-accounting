import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  FileText,
  Upload,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts'

const revenueData = [
  { month: 'Oct', revenue: 42000, expenses: 28000 },
  { month: 'Nov', revenue: 48000, expenses: 31000 },
  { month: 'Dec', revenue: 55000, expenses: 35000 },
  { month: 'Jan', revenue: 51000, expenses: 33000 },
  { month: 'Feb', revenue: 59000, expenses: 36000 },
  { month: 'Mar', revenue: 63000, expenses: 38000 },
]

const recentTransactions = [
  { id: '1', date: '2026-03-22', description: 'Payment from Acme Corp', amount: 5400, type: 'credit' },
  { id: '2', date: '2026-03-21', description: 'AWS Cloud Services', amount: -1250, type: 'debit' },
  { id: '3', date: '2026-03-21', description: 'Office Supplies - Lazada', amount: -320, type: 'debit' },
  { id: '4', date: '2026-03-20', description: 'Invoice #INV-0042 paid', amount: 8900, type: 'credit' },
  { id: '5', date: '2026-03-19', description: 'Payroll - March 2026', amount: -24000, type: 'debit' },
]

const overdueInvoices = [
  { id: 'INV-0038', client: 'TechStart Pte Ltd', amount: 3200, dueDate: '2026-03-10', daysOverdue: 14 },
  { id: 'INV-0035', client: 'Green Solutions SG', amount: 1800, dueDate: '2026-03-05', daysOverdue: 19 },
]

const expenseByCategory = [
  { category: 'Payroll', amount: 24000 },
  { category: 'Cloud/IT', amount: 4500 },
  { category: 'Office', amount: 2100 },
  { category: 'Marketing', amount: 3200 },
  { category: 'Travel', amount: 1800 },
]

export function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back. Here's your financial overview.</p>
      </div>

      {/* Metric Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Revenue"
          value={formatCurrency(63000)}
          change="+6.8%"
          trend="up"
          icon={<DollarSign className="h-4 w-4" />}
        />
        <MetricCard
          title="Total Expenses"
          value={formatCurrency(38000)}
          change="+5.6%"
          trend="up"
          icon={<TrendingDown className="h-4 w-4" />}
        />
        <MetricCard
          title="Net Income"
          value={formatCurrency(25000)}
          change="+9.2%"
          trend="up"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <MetricCard
          title="Outstanding"
          value={formatCurrency(12400)}
          change="3 invoices"
          trend="neutral"
          icon={<FileText className="h-4 w-4" />}
        />
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Revenue vs Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueData}>
                  <defs>
                    <linearGradient id="revenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#16a34a" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="expenses" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(v) => `$${v / 1000}k`} />
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  <Area type="monotone" dataKey="revenue" stroke="#16a34a" fill="url(#revenue)" strokeWidth={2} />
                  <Area type="monotone" dataKey="expenses" stroke="#ef4444" fill="url(#expenses)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Expenses by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={expenseByCategory} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" stroke="#94a3b8" fontSize={12} tickFormatter={(v) => `$${v / 1000}k`} />
                  <YAxis type="category" dataKey="category" stroke="#94a3b8" fontSize={12} width={70} />
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  <Bar dataKey="amount" fill="#16a34a" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Transactions */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Recent Transactions</CardTitle>
            <Badge variant="secondary">{recentTransactions.length} transactions</Badge>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentTransactions.map((t) => (
                <div key={t.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full ${t.amount > 0 ? 'bg-success/10' : 'bg-destructive/10'}`}>
                      {t.amount > 0 ? (
                        <ArrowUpRight className="h-4 w-4 text-success" />
                      ) : (
                        <ArrowDownRight className="h-4 w-4 text-destructive" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{t.description}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(t.date)}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-semibold ${t.amount > 0 ? 'text-success' : 'text-destructive'}`}>
                    {t.amount > 0 ? '+' : ''}{formatCurrency(t.amount)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Overdue & Alerts */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-warning" />
                Overdue Invoices
              </CardTitle>
              <Badge variant="warning">{overdueInvoices.length}</Badge>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {overdueInvoices.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between rounded-lg border border-warning/20 bg-warning/5 p-3">
                    <div>
                      <p className="text-sm font-medium">{inv.id} — {inv.client}</p>
                      <p className="text-xs text-muted-foreground">{inv.daysOverdue} days overdue</p>
                    </div>
                    <span className="text-sm font-semibold text-warning">{formatCurrency(inv.amount)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-4 w-4 text-primary" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <button className="flex flex-col items-center gap-2 rounded-lg border border-border p-4 hover:bg-muted transition-colors">
                  <FileText className="h-6 w-6 text-primary" />
                  <span className="text-xs font-medium">New Invoice</span>
                </button>
                <button className="flex flex-col items-center gap-2 rounded-lg border border-border p-4 hover:bg-muted transition-colors">
                  <Upload className="h-6 w-6 text-primary" />
                  <span className="text-xs font-medium">Upload Document</span>
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function MetricCard({
  title,
  value,
  change,
  trend,
  icon,
}: {
  title: string
  value: string
  change: string
  trend: 'up' | 'down' | 'neutral'
  icon: React.ReactNode
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
        </div>
        <div className="mt-3">
          <p className="text-2xl font-bold">{value}</p>
          <p className={`mt-1 text-xs font-medium ${trend === 'up' ? 'text-success' : trend === 'down' ? 'text-destructive' : 'text-muted-foreground'}`}>
            {change} vs last month
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
