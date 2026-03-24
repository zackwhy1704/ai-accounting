import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { formatCurrency } from '@/lib/utils'
import { Plus, Search, Users, Building2, Mail, Phone } from 'lucide-react'

const mockContacts = [
  { id: '1', name: 'Acme Corp Pte Ltd', email: 'billing@acme.sg', phone: '+65 6234 5678', type: 'customer' as const, company: 'Acme Corp', outstanding_balance: 5400 },
  { id: '2', name: 'DataFlow Systems', email: 'accounts@dataflow.io', phone: '+65 6345 6789', type: 'customer' as const, company: 'DataFlow', outstanding_balance: 12800 },
  { id: '3', name: 'AWS Singapore', email: 'invoicing@aws.com', phone: '', type: 'vendor' as const, company: 'Amazon Web Services', outstanding_balance: -1250 },
  { id: '4', name: 'TechStart Pte Ltd', email: 'finance@techstart.sg', phone: '+65 6456 7890', type: 'customer' as const, company: 'TechStart', outstanding_balance: 3200 },
  { id: '5', name: 'Office Supplies SG', email: 'sales@officesupplies.sg', phone: '+65 6567 8901', type: 'vendor' as const, company: 'Office Supplies', outstanding_balance: -520 },
  { id: '6', name: 'Green Solutions SG', email: 'pay@greensolutions.sg', phone: '+65 6678 9012', type: 'both' as const, company: 'Green Solutions', outstanding_balance: 1800 },
]

export function ContactsPage() {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'customer' | 'vendor'>('all')

  const filtered = mockContacts.filter((c) => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.email.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === 'all' || c.type === filter || (filter === 'customer' && c.type === 'both') || (filter === 'vendor' && c.type === 'both')
    return matchSearch && matchFilter
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Contacts</h1>
          <p className="text-muted-foreground">Manage your customers and vendors</p>
        </div>
        <Button><Plus className="h-4 w-4" /> Add Contact</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="p-4 flex items-center gap-3"><Users className="h-8 w-8 text-primary" /><div><p className="text-sm text-muted-foreground">Total Contacts</p><p className="text-xl font-bold">{mockContacts.length}</p></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><Building2 className="h-8 w-8 text-success" /><div><p className="text-sm text-muted-foreground">Customers</p><p className="text-xl font-bold">{mockContacts.filter(c => c.type === 'customer' || c.type === 'both').length}</p></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><Building2 className="h-8 w-8 text-warning" /><div><p className="text-sm text-muted-foreground">Vendors</p><p className="text-xl font-bold">{mockContacts.filter(c => c.type === 'vendor' || c.type === 'both').length}</p></div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>All Contacts</CardTitle>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search contacts..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 w-64" />
            </div>
            <div className="flex gap-1 rounded-lg border border-border p-1">
              {(['all', 'customer', 'vendor'] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)} className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${filter === f ? 'bg-primary text-white' : 'hover:bg-muted'}`}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}s
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow key={c.id} className="cursor-pointer">
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell><span className="flex items-center gap-1 text-muted-foreground"><Mail className="h-3 w-3" />{c.email}</span></TableCell>
                  <TableCell>{c.phone && <span className="flex items-center gap-1 text-muted-foreground"><Phone className="h-3 w-3" />{c.phone}</span>}</TableCell>
                  <TableCell><Badge variant={c.type === 'customer' ? 'success' : c.type === 'vendor' ? 'warning' : 'default'}>{c.type}</Badge></TableCell>
                  <TableCell className={`text-right font-medium ${c.outstanding_balance >= 0 ? 'text-success' : 'text-destructive'}`}>{formatCurrency(Math.abs(c.outstanding_balance))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
