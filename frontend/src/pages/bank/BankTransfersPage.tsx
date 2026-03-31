import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Plus, Search, MoreHorizontal, ArrowLeftRight } from "lucide-react"
import api from "../../lib/api"
import { formatCurrency, formatDate, cn } from "../../lib/utils"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Badge } from "../../components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table"

interface BankTransfer {
  id: string
  transfer_number: string
  transfer_date: string
  from_account_name: string
  to_account_name: string
  amount: number
  currency: string
  reference_number: string
  status: string
}

const statusColors: Record<string, string> = {
  completed: "bg-emerald-500/10 text-emerald-700 border-emerald-400/20",
  pending: "bg-amber-500/10 text-amber-700 border-amber-400/20",
  void: "bg-rose-500/10 text-rose-700 border-rose-400/20",
}

export default function BankTransfersPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState("")

  const { data: transfers = [], isLoading } = useQuery<BankTransfer[]>({
    queryKey: ["bank-transfers"],
    queryFn: async () => {
      const res = await api.get("/bank-transfers")
      return res.data
    },
  })

  const rows = search.trim()
    ? transfers.filter(t =>
        t.transfer_number.toLowerCase().includes(search.toLowerCase()) ||
        (t.reference_number ?? "").toLowerCase().includes(search.toLowerCase()) ||
        t.from_account_name.toLowerCase().includes(search.toLowerCase()) ||
        t.to_account_name.toLowerCase().includes(search.toLowerCase())
      )
    : transfers

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Bank</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Bank Transfers</div>
          <div className="mt-1 max-w-2xl text-sm text-muted-foreground">Transfer funds between your bank accounts</div>
        </div>
        <Button
          type="button"
          onClick={() => navigate("/bank/transfers/new")}
          className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white shadow-[0_0_0_1px_rgba(124,157,255,0.25),0_16px_40px_rgba(0,0,0,0.35)] hover:opacity-95"
        >
          <Plus className="mr-2 h-4 w-4" /> New Transfer
        </Button>
      </div>

      <Card className="rounded-2xl border-border bg-card p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="mb-4 relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search transfers..."
            className="h-10 rounded-xl pl-9 text-sm"
          />
        </div>

        {isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <ArrowLeftRight className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="mt-4 text-base font-semibold text-foreground">No bank transfers</div>
            <div className="mt-1 text-sm text-muted-foreground">Record transfers between your bank accounts</div>
            <Button
              type="button"
              onClick={() => navigate("/bank/transfers/new")}
              className="mt-6 h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white"
            >
              <Plus className="mr-2 h-4 w-4" /> New Transfer
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">No.</TableHead>
                  <TableHead className="text-muted-foreground">Date</TableHead>
                  <TableHead className="text-muted-foreground">From Account</TableHead>
                  <TableHead className="text-muted-foreground">To Account</TableHead>
                  <TableHead className="text-right text-muted-foreground">Amount</TableHead>
                  <TableHead className="text-muted-foreground">Reference</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(t => (
                  <TableRow key={t.id} className="border-border hover:bg-muted/50">
                    <TableCell className="font-medium text-foreground">{t.transfer_number}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(t.transfer_date)}</TableCell>
                    <TableCell className="text-foreground">{t.from_account_name}</TableCell>
                    <TableCell className="text-foreground">{t.to_account_name}</TableCell>
                    <TableCell className="text-right text-foreground">{formatCurrency(t.amount, t.currency)}</TableCell>
                    <TableCell className="text-muted-foreground">{t.reference_number || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("rounded-lg px-2 py-0.5 text-[11px] font-semibold", statusColors[t.status] ?? "")}>
                        {t.status.charAt(0).toUpperCase() + t.status.slice(1)}
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
