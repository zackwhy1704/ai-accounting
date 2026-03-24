import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, Search, Filter, Download, MoreHorizontal, Send, Eye } from 'lucide-react'

const statusConfig = {
  draft: { label: 'Draft', variant: 'secondary' as const },
  sent: { label: 'Sent', variant: 'default' as const },
  viewed: { label: 'Viewed', variant: 'default' as const },
  paid: { label: 'Paid', variant: 'success' as const },
  overdue: { label: 'Overdue', variant: 'destructive' as const },
  cancelled: { label: 'Cancelled', variant: 'secondary' as const },
}

const mockInvoices = [
  { id: '1', invoice_number: 'INV-0045', contact_name: 'Acme Corp Pte Ltd', status: 'paid' as const, issue_date: '2026-03-15', due_date: '2026-04-14', total: 5400, currency: 'SGD' },
  { id: '2', invoice_number: 'INV-0044', contact_name: 'DataFlow Systems', status: 'sent' as const, issue_date: '2026-03-12', due_date: '2026-04-11', total: 12800, currency: 'SGD' },
  { id: '3', invoice_number: 'INV-0043', contact_name: 'Marina Bay Tech', status: 'viewed' as const, issue_date: '2026-03-10', due_date: '2026-04-09', total: 3200, currency: 'SGD' },
  { id: '4', invoice_number: 'INV-0042', contact_name: 'Sunrise Holdings', status: 'paid' as const, issue_date: '2026-03-08', due_date: '2026-04-07', total: 8900, currency: 'SGD' },
  { id: '5', invoice_number: 'INV-0041', contact_name: 'CloudNine Solutions', status: 'draft' as const, issue_date: '2026-03-05', due_date: '2026-04-04', total: 6750, currency: 'SGD' },
  { id: '6', invoice_number: 'INV-0038', contact_name: 'TechStart Pte Ltd', status: 'overdue' as const, issue_date: '2026-02-10', due_date: '2026-03-10', total: 3200, currency: 'SGD' },
  { id: '7', invoice_number: 'INV-0035', contact_name: 'Green Solutions SG', status: 'overdue' as const, issue_date: '2026-02-05', due_date: '2026-03-05', total: 1800, currency: 'SGD' },
]

export function InvoicesPage() {
  const [search, setSearch] = useState('')

  const filtered = mockInvoices.filter(
    (inv) =>
      inv.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
      inv.contact_name.toLowerCase().includes(search.toLowerCase())
  )

  const totalOutstanding = mockInvoices
    .filter((i) => i.status === 'sent' || i.status === 'viewed' || i.status === 'overdue')
    .reduce((sum, i) => sum + i.total, 0)

  const totalOverdue = mockInvoices
    .filter((i) => i.status === 'overdue')
    .reduce((sum, i) => sum + i.total, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Invoices</h1>
          <p className="text-muted-foreground">Manage and track your invoices</p>
        </div>
        <Button>
          <Plus className="h-4 w-4" />
          New Invoice
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Outstanding</p>
            <p className="text-xl font-bold mt-1">{formatCurrency(totalOutstanding)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Overdue</p>
            <p className="text-xl font-bold mt-1 text-destructive">{formatCurrency(totalOverdue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Paid This Month</p>
            <p className="text-xl font-bold mt-1 text-success">{formatCurrency(14300)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Invoices Table */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>All Invoices</CardTitle>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search invoices..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 w-64"
              />
            </div>
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4" />
              Filter
            </Button>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4" />
              Export
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Issue Date</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((inv) => (
                <TableRow key={inv.id} className="cursor-pointer">
                  <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                  <TableCell>{inv.contact_name}</TableCell>
                  <TableCell>
                    <Badge variant={statusConfig[inv.status].variant}>
                      {statusConfig[inv.status].label}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(inv.issue_date)}</TableCell>
                  <TableCell>{formatDate(inv.due_date)}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(inv.total)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <button className="rounded p-1 hover:bg-muted">
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      </button>
                      <button className="rounded p-1 hover:bg-muted">
                        <Send className="h-4 w-4 text-muted-foreground" />
                      </button>
                      <button className="rounded p-1 hover:bg-muted">
                        <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
