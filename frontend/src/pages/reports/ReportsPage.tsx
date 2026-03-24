import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

import { formatCurrency } from '@/lib/utils'
import {

  TrendingUp,

  FileSpreadsheet,
  Download,
  Calendar,
  DollarSign,
  Scale,
  Wallet,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RPieChart,
  Pie,
  Cell,
} from 'recharts'

const monthlyPnL = [
  { month: 'Oct', revenue: 42000, expenses: 28000, profit: 14000 },
  { month: 'Nov', revenue: 48000, expenses: 31000, profit: 17000 },
  { month: 'Dec', revenue: 55000, expenses: 35000, profit: 20000 },
  { month: 'Jan', revenue: 51000, expenses: 33000, profit: 18000 },
  { month: 'Feb', revenue: 59000, expenses: 36000, profit: 23000 },
  { month: 'Mar', revenue: 63000, expenses: 38000, profit: 25000 },
]

const expenseBreakdown = [
  { name: 'Payroll', value: 24000, color: '#16a34a' },
  { name: 'Cloud/IT', value: 4500, color: '#3b82f6' },
  { name: 'Marketing', value: 3200, color: '#f59e0b' },
  { name: 'Office', value: 2100, color: '#8b5cf6' },
  { name: 'Travel', value: 1800, color: '#ec4899' },
  { name: 'Other', value: 2400, color: '#6b7280' },
]

const reportTypes = [
  { title: 'Profit & Loss', description: 'Revenue, expenses, and net income', icon: TrendingUp, color: 'text-success' },
  { title: 'Balance Sheet', description: 'Assets, liabilities, and equity', icon: Scale, color: 'text-blue-500' },
  { title: 'Cash Flow', description: 'Cash inflows and outflows', icon: Wallet, color: 'text-purple-500' },
  { title: 'GST Report', description: 'GST collected and paid (F5/F7)', icon: DollarSign, color: 'text-warning' },
  { title: 'Aged Receivables', description: 'Outstanding customer invoices', icon: FileSpreadsheet, color: 'text-primary' },
  { title: 'Aged Payables', description: 'Outstanding vendor bills', icon: FileSpreadsheet, color: 'text-destructive' },
]

export function ReportsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="text-muted-foreground">Financial reports and analytics</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline"><Calendar className="h-4 w-4" /> Mar 2026</Button>
          <Button variant="outline"><Download className="h-4 w-4" /> Export All</Button>
        </div>
      </div>

      {/* Report Type Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {reportTypes.map((r) => (
          <Card key={r.title} className="cursor-pointer hover:shadow-md transition-shadow">
            <CardContent className="flex items-center gap-4 p-5">
              <div className={`flex h-12 w-12 items-center justify-center rounded-lg bg-muted ${r.color}`}>
                <r.icon className="h-6 w-6" />
              </div>
              <div>
                <p className="font-medium">{r.title}</p>
                <p className="text-xs text-muted-foreground">{r.description}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Monthly Profit & Loss</CardTitle>
            <CardDescription>Last 6 months</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyPnL}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(v) => `$${v / 1000}k`} />
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  <Bar dataKey="revenue" fill="#16a34a" radius={[4, 4, 0, 0]} name="Revenue" />
                  <Bar dataKey="expenses" fill="#ef4444" radius={[4, 4, 0, 0]} name="Expenses" />
                  <Bar dataKey="profit" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Net Profit" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Expense Breakdown</CardTitle>
            <CardDescription>Current month</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <RPieChart>
                  <Pie data={expenseBreakdown} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                    {expenseBreakdown.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                </RPieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 space-y-2">
              {expenseBreakdown.map((e) => (
                <div key={e.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: e.color }} />
                    <span>{e.name}</span>
                  </div>
                  <span className="font-medium">{formatCurrency(e.value)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
