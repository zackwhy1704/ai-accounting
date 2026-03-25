import { useMemo, useState } from "react"
import { Download, Plus, Search, Users, MoreHorizontal } from "lucide-react"
import { useContacts } from "../../lib/hooks"
import { cn } from "../../lib/utils"
import { useTheme } from "../../lib/theme"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table"
import { Badge } from "../../components/ui/badge"

export default function ContactsPage() {
  const [tab, setTab] = useState("all")
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const pageSize = 10
  const { data: contacts = [], isLoading } = useContacts(tab === "all" ? undefined : tab)
  const { t } = useTheme()

  const contactTabs = [
    { label: t("common.all"), value: "all" },
    { label: t("contacts.customers"), value: "customer" },
    { label: t("contacts.vendors"), value: "vendor" },
  ]

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return contacts
    return contacts.filter(c => c.name.toLowerCase().includes(q) || (c.email ?? "").toLowerCase().includes(q))
  }, [contacts, query])

  const total = filtered.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs text-muted-foreground">{t("contacts.category")}</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{t("contacts.title")}</div>
          <div className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("contacts.desc")}</div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" className="h-9 rounded-xl px-3 text-xs font-semibold shadow-sm"><Users className="mr-2 h-4 w-4" /> {t("contacts.groups")}</Button>
          <Button type="button" className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white shadow-[0_0_0_1px_rgba(124,157,255,0.25),0_16px_40px_rgba(0,0,0,0.35)] hover:opacity-95"><Plus className="mr-2 h-4 w-4" /> {t("contacts.new")}</Button>
        </div>
      </div>

      <Card className="rounded-2xl border-border bg-card p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Tabs value={tab} onValueChange={(v) => { setTab(v); setPage(1) }}>
            <TabsList className="h-auto flex-wrap justify-start gap-1 rounded-xl bg-muted p-1">
              {contactTabs.map(ct => (<TabsTrigger key={ct.value} value={ct.value} className="rounded-lg px-3 py-1.5 text-xs">{ct.label}</TabsTrigger>))}
            </TabsList>
          </Tabs>
          <Button type="button" variant="secondary" className="h-9 rounded-xl px-3 text-xs font-semibold shadow-sm"><Download className="mr-2 h-4 w-4" /> {t("common.export")}</Button>
        </div>
        <div className="mt-4"><div className="text-xs font-medium text-muted-foreground">{t("common.search")}</div>
          <div className="relative mt-2 max-w-md"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={query} onChange={e => { setQuery(e.target.value); setPage(1) }} placeholder={t("contacts.nameEmail")} className="h-10 rounded-xl pl-9 text-sm" /></div>
        </div>
        <div className="mt-4">
          {isLoading ? (<div className="py-10 text-center text-sm text-muted-foreground">{t("common.loading")}</div>
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted shadow-[0_0_0_1px_rgba(15,23,42,0.08)]"><Users className="h-6 w-6 text-muted-foreground" /></div>
              <div className="mt-4 text-base font-semibold text-foreground">{t("contacts.noContacts")}</div>
              <div className="mt-1 text-sm text-muted-foreground">{t("contacts.noContactsDesc")}</div>
            </div>
          ) : (
            <>
              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                <Table>
                  <TableHeader><TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">{t("contacts.name")}</TableHead><TableHead className="text-muted-foreground">{t("contacts.email")}</TableHead><TableHead className="text-muted-foreground">{t("contacts.phone")}</TableHead><TableHead className="text-muted-foreground">{t("contacts.type")}</TableHead><TableHead className="text-muted-foreground">{t("contacts.company")}</TableHead><TableHead className="w-[90px] text-right text-muted-foreground">{t("common.action")}</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {rows.map(c => (
                      <TableRow key={c.id} className="border-border hover:bg-muted/50">
                        <TableCell className="font-medium text-foreground">{c.name}</TableCell>
                        <TableCell className="text-muted-foreground">{c.email ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{c.phone ?? "—"}</TableCell>
                        <TableCell><Badge variant="outline" className={cn("rounded-lg px-2 py-0.5 text-[11px] font-semibold", c.type === "customer" ? "bg-sky-500/10 text-sky-700 border-sky-400/20" : c.type === "vendor" ? "bg-amber-500/10 text-amber-700 border-amber-400/20" : "bg-violet-500/10 text-violet-700 border-violet-400/20")}>{c.type.charAt(0).toUpperCase() + c.type.slice(1)}</Badge></TableCell>
                        <TableCell className="text-muted-foreground">{c.company ?? "—"}</TableCell>
                        <TableCell className="text-right"><Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"><MoreHorizontal className="h-4 w-4" /></Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div className="text-xs text-muted-foreground">{total === 0 ? "0" : `${(page-1)*pageSize+1}-${Math.min(total, page*pageSize)} / ${total}`}</div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="secondary" className="h-8 rounded-xl px-3 text-xs font-semibold" onClick={() => setPage(p => Math.max(1, p-1))} disabled={page <= 1}>{t("common.prev")}</Button>
                  <div className="rounded-xl border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground">{page} / {pageCount}</div>
                  <Button type="button" variant="secondary" className="h-8 rounded-xl px-3 text-xs font-semibold" onClick={() => setPage(p => Math.min(pageCount, p+1))} disabled={page >= pageCount}>{t("common.next")}</Button>
                </div>
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  )
}
