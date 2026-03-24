import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { formatCurrency } from '@/lib/utils'
import { Plus, BookOpen, ArrowRightLeft } from 'lucide-react'

const chartOfAccounts = [
  { code: '1000', name: 'Cash at Bank', type: 'asset', balance: 85400 },
  { code: '1100', name: 'Accounts Receivable', type: 'asset', balance: 21800 },
  { code: '1200', name: 'Prepaid Expenses', type: 'asset', balance: 3200 },
  { code: '2000', name: 'Accounts Payable', type: 'liability', balance: 8770 },
  { code: '2100', name: 'GST Payable', type: 'liability', balance: 4500 },
  { code: '2200', name: 'Accrued Expenses', type: 'liability', balance: 2100 },
  { code: '3000', name: 'Owner\'s Equity', type: 'equity', balance: 50000 },
  { code: '3100', name: 'Retained Earnings', type: 'equity', balance: 45030 },
  { code: '4000', name: 'Sales Revenue', type: 'revenue', balance: 318000 },
  { code: '4100', name: 'Service Revenue', type: 'revenue', balance: 45000 },
  { code: '5000', name: 'Cost of Goods Sold', type: 'expense', balance: 142000 },
  { code: '5100', name: 'Payroll Expense', type: 'expense', balance: 96000 },
  { code: '5200', name: 'Rent Expense', type: 'expense', balance: 24000 },
  { code: '5300', name: 'Utilities', type: 'expense', balance: 4800 },
]

const recentJournals = [
  { id: '1', date: '2026-03-22', description: 'Invoice INV-0045 payment received', entries: [{ account: 'Cash at Bank', debit: 5400, credit: 0 }, { account: 'Accounts Receivable', debit: 0, credit: 5400 }] },
  { id: '2', date: '2026-03-21', description: 'AWS monthly bill', entries: [{ account: 'Cloud/IT Expense', debit: 1250, credit: 0 }, { account: 'Accounts Payable', debit: 0, credit: 1250 }] },
  { id: '3', date: '2026-03-20', description: 'March payroll accrual', entries: [{ account: 'Payroll Expense', debit: 24000, credit: 0 }, { account: 'Cash at Bank', debit: 0, credit: 24000 }] },
]

const typeColors: Record<string, string> = {
  asset: 'text-blue-600 bg-blue-50',
  liability: 'text-red-600 bg-red-50',
  equity: 'text-purple-600 bg-purple-50',
  revenue: 'text-green-600 bg-green-50',
  expense: 'text-orange-600 bg-orange-50',
}

export function AccountingPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Accounting</h1>
          <p className="text-muted-foreground">Chart of accounts and journal entries</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline"><ArrowRightLeft className="h-4 w-4" /> New Journal Entry</Button>
          <Button><Plus className="h-4 w-4" /> Add Account</Button>
        </div>
      </div>

      {/* Chart of Accounts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5" /> Chart of Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Account Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {chartOfAccounts.map((a) => (
                <TableRow key={a.code}>
                  <TableCell className="font-mono text-sm">{a.code}</TableCell>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${typeColors[a.type]}`}>{a.type}</span></TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(a.balance)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Recent Journal Entries */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Journal Entries</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentJournals.map((j) => (
              <div key={j.id} className="rounded-lg border border-border p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-medium text-sm">{j.description}</p>
                    <p className="text-xs text-muted-foreground">{j.date}</p>
                  </div>
                  <Badge variant="secondary">Posted</Badge>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {j.entries.map((e, i) => (
                      <TableRow key={i}>
                        <TableCell className={e.credit > 0 ? 'pl-8' : ''}>{e.account}</TableCell>
                        <TableCell className="text-right">{e.debit > 0 ? formatCurrency(e.debit) : ''}</TableCell>
                        <TableCell className="text-right">{e.credit > 0 ? formatCurrency(e.credit) : ''}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
