import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Plus, Download, Search, MoreHorizontal } from "lucide-react"
import { useVendorCredits, useContacts } from "../../lib/hooks"
import { formatCurrency, formatDate, cn } from "../../lib/utils"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table"
import { Badge } from "../../components/ui/badge"

const statusColors: Record<string, string> = {
  open: "bg-blue-500/10 text-blue-700 border-blue-400/20",
  applied: "bg-emerald-500/10 text-emerald-700 border-emerald-400/20",
  void: "bg-rose-500/10 text-rose-700 border-rose-400/20",
}

export default function VendorCreditsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState("")
  const { data: vendorCredits = [], isLoading } = useVendorCredits()
  const { data: contacts = [] } = useContacts()

  const contactMap = useMemo(() => {
    const m = new Map<string, string>()
    contacts.forEach(c => m.set(c.id, c.name))
    return m
  }, [contacts])

  const rows = useMemo(() => {
    if (!search.trim()) return vendorCredits
    const q = search.toLowerCase()
    return vendorCredits.filter(vc =>
      vc.vendor_credit_number.toLowerCase().includes(q) ||
      (contactMap.get(vc.contact_id) ?? "").toLowerCase().includes(q)
    )
  }, [vendorCredits, search, contactMap])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Purchases</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Vendor Credits</div>
          <div className="mt-1 max-w-2xl text-sm text-muted-foreground">Credit notes received from suppliers for returns or adjustments</div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" className="h-9 rounded-xl px-3 text-xs font-semibold shadow-sm">
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
          <Button type="button" onClick={() => navigate("/purchases/vendor-credits/new")} className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white shadow-[0_0_0_1px_rgba(124,157,255,0.25),0_16px_40px_rgba(0,0,0,0.35)] hover:opacity-95">
            <Plus className="mr-2 h-4 w-4" /> New Vendor Credit
          </Button>
        </div>
      </div>

      <Card className="rounded-2xl border-border bg-card p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="mb-4 relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vendor credits..." className="h-10 rounded-xl pl-9 text-sm" />
        </div>

        {isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center">
            <div className="mt-4 text-base font-semibold text-foreground">No vendor credits</div>
            <div className="mt-1 text-sm text-muted-foreground">Record credit notes you receive from suppliers</div>
            <Button type="button" onClick={() => navigate("/purchases/vendor-credits/new")} className="mt-6 h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white">
              <Plus className="mr-2 h-4 w-4" /> New Vendor Credit
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">No.</TableHead>
                  <TableHead className="text-muted-foreground">Date</TableHead>
                  <TableHead className="text-muted-foreground">Supplier</TableHead>
                  <TableHead className="text-right text-muted-foreground">Total</TableHead>
                  <TableHead className="text-right text-muted-foreground">Applied</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(vc => (
                  <TableRow key={vc.id} className="border-border hover:bg-muted/50">
                    <TableCell className="font-medium text-foreground">{vc.vendor_credit_number}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(vc.issue_date)}</TableCell>
                    <TableCell className="text-foreground">{contactMap.get(vc.contact_id) ?? "—"}</TableCell>
                    <TableCell className="text-right text-foreground">{formatCurrency(vc.total, vc.currency)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatCurrency(vc.amount_applied, vc.currency)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("rounded-lg px-2 py-0.5 text-[11px] font-semibold", statusColors[vc.status] ?? "")}>
                        {vc.status.charAt(0).toUpperCase() + vc.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  )
}
