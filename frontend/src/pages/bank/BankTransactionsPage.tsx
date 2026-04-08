import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { ViewDetailSheet } from "../../components/ui/view-detail-sheet"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, Search, ArrowDownCircle, ArrowUpCircle, FileText, Tag, ArrowRightLeft, Trash2, Pencil } from "lucide-react"
import api from "../../lib/api"
import { formatCurrency, formatDate, cn } from "../../lib/utils"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Badge } from "../../components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"
import { RowActionsMenu } from "../../components/ui/row-actions"

interface BankTransaction {
  id: string
  transaction_number: string
  transaction_date: string
  contact_name: string
  reference_number: string
  amount: number
  currency: string
  category: string
  status: string
  transaction_type: "income" | "expense"
  bank_account_id: string
}

interface BankAccount {
  id: string
  name: string
}

const statusColors: Record<string, string> = {
  completed: "bg-emerald-500/10 text-emerald-700 border-emerald-400/20",
  pending: "bg-amber-500/10 text-amber-700 border-amber-400/20",
  void: "bg-rose-500/10 text-rose-700 border-rose-400/20",
}

interface Props {
  type: "income" | "expense"
}

export default function BankTransactionsPage({ type }: Props) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [viewItem, setViewItem] = useState<BankTransaction | null>(null)
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [bankAccountId, setBankAccountId] = useState("all")

  const { data: transactions = [], isLoading } = useQuery<BankTransaction[]>({
    queryKey: ["bank-transactions", type],
    queryFn: async () => {
      const res = await api.get("/bank-transactions", {
        params: { transaction_type: type },
      })
      return res.data
    },
  })

  const { data: bankAccounts = [] } = useQuery<BankAccount[]>({
    queryKey: ["bank-accounts"],
    queryFn: async () => {
      const res = await api.get("/bank-accounts")
      return res.data
    },
  })

  const rows = transactions.filter(t => {
    if (search.trim()) {
      const q = search.toLowerCase()
      if (
        !t.transaction_number.toLowerCase().includes(q) &&
        !(t.contact_name ?? "").toLowerCase().includes(q) &&
        !(t.reference_number ?? "").toLowerCase().includes(q)
      ) return false
    }
    if (dateFrom && t.transaction_date < dateFrom) return false
    if (dateTo && t.transaction_date > dateTo) return false
    if (bankAccountId !== "all" && t.bank_account_id !== bankAccountId) return false
    return true
  })

  const title = type === "income" ? "Money In" : "Money Out"
  const newPath = type === "income" ? "/bank/money-in/new" : "/bank/money-out/new"
  const EmptyIcon = type === "income" ? ArrowDownCircle : ArrowUpCircle

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Bank</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{title}</div>
          <div className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {type === "income" ? "Track money received into your accounts" : "Track money paid out of your accounts"}
          </div>
        </div>
        <Button
          type="button"
          onClick={() => navigate(newPath)}
          className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white shadow-[0_0_0_1px_rgba(124,157,255,0.25),0_16px_40px_rgba(0,0,0,0.35)] hover:opacity-95"
        >
          <Plus className="mr-2 h-4 w-4" /> New {title}
        </Button>
      </div>

      <Card className="rounded-2xl border-border bg-card p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search transactions..."
              className="h-10 rounded-xl pl-9 text-sm"
            />
          </div>
          <Input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="h-10 rounded-xl text-sm w-40"
            placeholder="From"
          />
          <Input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="h-10 rounded-xl text-sm w-40"
            placeholder="To"
          />
          <Select value={bankAccountId} onValueChange={setBankAccountId}>
            <SelectTrigger className="h-10 w-44 rounded-xl text-sm">
              <SelectValue placeholder="All accounts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Accounts</SelectItem>
              {bankAccounts.map(a => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <EmptyIcon className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="mt-4 text-base font-semibold text-foreground">
              No {type === "income" ? "money in" : "money out"} transactions
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {type === "income"
                ? "Record payments received from customers and other sources"
                : "Record payments made to suppliers and other expenses"}
            </div>
            <Button
              type="button"
              onClick={() => navigate(newPath)}
              className="mt-6 h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white"
            >
              <Plus className="mr-2 h-4 w-4" /> New {title}
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">No.</TableHead>
                  <TableHead className="text-muted-foreground">Date</TableHead>
                  <TableHead className="text-muted-foreground">Contact</TableHead>
                  <TableHead className="text-muted-foreground">Reference No.</TableHead>
                  <TableHead className="text-right text-muted-foreground">Amount</TableHead>
                  <TableHead className="text-muted-foreground">Category</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(t => (
                  <TableRow key={t.id} className="border-border hover:bg-muted/50">
                    <TableCell className="font-medium text-foreground">{t.transaction_number}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(t.transaction_date)}</TableCell>
                    <TableCell className="text-foreground">{t.contact_name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{t.reference_number || "—"}</TableCell>
                    <TableCell className={cn("text-right font-medium", type === "income" ? "text-emerald-600" : "text-rose-600")}>
                      {type === "expense" ? "–" : ""}{formatCurrency(t.amount, t.currency)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{t.category || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("rounded-lg px-2 py-0.5 text-[11px] font-semibold", statusColors[t.status] ?? "")}>
                        {t.status.charAt(0).toUpperCase() + t.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActionsMenu actions={[
                        { label: "Edit", icon: <Pencil className="h-3.5 w-3.5" />, onClick: () => navigate(`/bank/money-in/${t.id}/edit`) },
                        { label: "View", icon: <FileText className="h-4 w-4" />, onClick: () => setViewItem(t) },
                        { label: "Categorise", icon: <Tag className="h-4 w-4" />, onClick: () => navigate(`/bank/transactions/${t.id}/categorise`), dividerBefore: true },
                        { label: "Match to Invoice", icon: <ArrowRightLeft className="h-4 w-4" />, onClick: () => navigate(`/bank/transactions/${t.id}/match`) },
                        { label: "Delete", icon: <Trash2 className="h-4 w-4" />, onClick: () => { if (confirm("Delete this transaction?")) api.delete(`/bank-transactions/${t.id}`).then(() => queryClient.invalidateQueries({ queryKey: ["bank-transactions", type] })) }, danger: true, dividerBefore: true },
                      ]} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
      <ViewDetailSheet
        open={!!viewItem}
        onOpenChange={(open) => { if (!open) setViewItem(null) }}
        title={viewItem ? `Transaction ${viewItem.transaction_number}` : ""}
        subtitle={viewItem?.status ? viewItem.status.charAt(0).toUpperCase() + viewItem.status.slice(1) : undefined}
        fields={viewItem ? [
          { label: "Date", value: formatDate(viewItem.transaction_date) },
          { label: "Description", value: viewItem.contact_name || "—" },
          { label: "Reference", value: viewItem.reference_number || "—" },
          { label: "Type", value: viewItem.transaction_type === "income" ? "Money In" : "Money Out" },
          { label: "Amount", value: formatCurrency(viewItem.amount, viewItem.currency) },
          { label: "Category", value: viewItem.category || "—" },
          { label: "Payment Method", value: "—" },
          { label: "Status", value: <Badge variant="outline" className={cn("rounded-lg px-2 py-0.5 text-[11px] font-semibold", statusColors[viewItem.status] ?? "")}>{viewItem.status.charAt(0).toUpperCase() + viewItem.status.slice(1)}</Badge> },
        ] : []}
      />
    </div>
  )
}
