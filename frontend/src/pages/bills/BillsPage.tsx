import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, Search } from 'lucide-react'

const statusConfig = {
  draft: { label: 'Draft', variant: 'secondary' as const },
  received: { label: 'Received', variant: 'default' as const },
  approved: { label: 'Approved', variant: 'success' as const },
  paid: { label: 'Paid', variant: 'success' as const },
  overdue: { label: 'Overdue', variant: 'destructive' as const },
}

const mockBills = [
  { id: '1', bill_number: 'BILL-0021', contact_name: 'AWS Singapore', status: 'received' as const, issue_date: '2026-03-15', due_date: '2026-04-14', total: 1250 },
  { id: '2', bill_number: 'BILL-0020', contact_name: 'WeWork SG', status: 'approved' as const, issue_date: '2026-03-01', due_date: '2026-03-31', total: 4500 },
  { id: '3', bill_number: 'BILL-0019', contact_name: 'Office Supplies SG', status: 'paid' as const, issue_date: '2026-02-28', due_date: '2026-03-28', total: 520 },
  { id: '4', bill_number: 'BILL-0018', contact_name: 'Singtel', status: 'paid' as const, issue_date: '2026-02-20', due_date: '2026-03-20', total: 380 },
  { id: '5', bill_number: 'BILL-0017', contact_name: 'Google Workspace', status: 'overdue' as const, issue_date: '2026-02-01', due_date: '2026-03-01', total: 890 },
]

export function BillsPage() {
  const [search, setSearch] = useState('')
  const filtered = mockBills.filter((b) => b.bill_number.toLowerCase().includes(search.toLowerCase()) || b.contact_name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Bills</h1>
          <p className="text-muted-foreground">Track and manage vendor bills</p>
        </div>
        <Button><Plus className="h-4 w-4" /> New Bill</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Awaiting Payment</p><p className="text-xl font-bold mt-1">{formatCurrency(6640)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Overdue</p><p className="text-xl font-bold mt-1 text-destructive">{formatCurrency(890)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Paid This Month</p><p className="text-xl font-bold mt-1 text-success">{formatCurrency(900)}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>All Bills</CardTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search bills..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 w-64" />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bill #</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Issue Date</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((b) => (
                <TableRow key={b.id} className="cursor-pointer">
                  <TableCell className="font-medium">{b.bill_number}</TableCell>
                  <TableCell>{b.contact_name}</TableCell>
                  <TableCell><Badge variant={statusConfig[b.status].variant}>{statusConfig[b.status].label}</Badge></TableCell>
                  <TableCell>{formatDate(b.issue_date)}</TableCell>
                  <TableCell>{formatDate(b.due_date)}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(b.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
