import { useAccounts } from "../../lib/hooks"
import { useTheme } from "../../lib/theme"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table"
import { Badge } from "../../components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs"
import { Plus } from "lucide-react"
import { useState } from "react"
import { cn } from "../../lib/utils"

const typeColors: Record<string, string> = {
  asset: "bg-sky-500/10 text-sky-700 border-sky-400/20",
  liability: "bg-rose-500/10 text-rose-700 border-rose-400/20",
  equity: "bg-violet-500/10 text-violet-700 border-violet-400/20",
  revenue: "bg-emerald-500/10 text-emerald-700 border-emerald-400/20",
  expense: "bg-amber-500/10 text-amber-700 border-amber-400/20",
}

export default function AccountingPage() {
  const [tab, setTab] = useState("all")
  const { data: accounts = [], isLoading } = useAccounts(tab === "all" ? undefined : tab)
  const { t } = useTheme()

  const accountTypes = [
    { label: t("common.all"), value: "all" },
    { label: t("accounting.asset"), value: "asset" },
    { label: t("accounting.liability"), value: "liability" },
    { label: t("accounting.equity"), value: "equity" },
    { label: t("accounting.revenue"), value: "revenue" },
    { label: t("accounting.expense"), value: "expense" },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs text-muted-foreground">{t("accounting.category")}</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{t("accounting.title")}</div>
          <div className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("accounting.desc")}</div>
        </div>
        <Button type="button" className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white shadow-[0_0_0_1px_rgba(124,157,255,0.25),0_16px_40px_rgba(0,0,0,0.35)] hover:opacity-95"><Plus className="mr-2 h-4 w-4" /> {t("accounting.newAccount")}</Button>
      </div>

      <Card className="rounded-2xl border-border bg-card p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="h-auto flex-wrap justify-start gap-1 rounded-xl bg-muted p-1">
            {accountTypes.map(at => (<TabsTrigger key={at.value} value={at.value} className="rounded-lg px-3 py-1.5 text-xs">{at.label}</TabsTrigger>))}
          </TabsList>
        </Tabs>
        <div className="mt-4">
          {isLoading ? (<div className="py-10 text-center text-sm text-muted-foreground">{t("common.loading")}</div>
          ) : accounts.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center">
              <div className="text-base font-semibold text-foreground">{t("accounting.noAccounts")}</div>
              <div className="mt-1 text-sm text-muted-foreground">{t("accounting.noAccountsDesc")}</div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <Table>
                <TableHeader><TableRow className="border-border hover:bg-transparent">
                  <TableHead className="w-[100px] text-muted-foreground">{t("accounting.code")}</TableHead><TableHead className="text-muted-foreground">{t("accounting.name")}</TableHead><TableHead className="text-muted-foreground">{t("accounting.type")}</TableHead><TableHead className="text-muted-foreground">{t("accounting.subtype")}</TableHead><TableHead className="text-muted-foreground">{t("accounting.currency")}</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {accounts.map(a => (
                    <TableRow key={a.id} className="border-border hover:bg-muted/50">
                      <TableCell className="font-medium text-foreground">{a.code}</TableCell>
                      <TableCell className="text-foreground">{a.name}</TableCell>
                      <TableCell><Badge variant="outline" className={cn("rounded-lg px-2 py-0.5 text-[11px] font-semibold", typeColors[a.type] ?? "")}>{a.type.charAt(0).toUpperCase() + a.type.slice(1)}</Badge></TableCell>
                      <TableCell className="text-muted-foreground">{a.subtype ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{a.currency}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
