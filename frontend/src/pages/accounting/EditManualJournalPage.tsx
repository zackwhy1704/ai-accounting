import { useState, useEffect, useRef } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Plus, Trash2 } from "lucide-react"
import { useManualJournal, useUpdateManualJournal, usePostManualJournal, useAccounts, useContacts } from "../../lib/hooks"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"
import { Badge } from "../../components/ui/badge"
import { useToast } from "../../components/ui/toast"

const statusColors: Record<string, string> = {
  draft: "bg-slate-500/10 text-slate-600 border-slate-300/20",
  posted: "bg-emerald-500/10 text-emerald-700 border-emerald-400/20",
  void: "bg-rose-500/10 text-rose-700 border-rose-400/20",
}

interface JournalLine {
  account_id: string
  description: string
  debit: string
  credit: string
  contact_id: string
}

const emptyLine = (): JournalLine => ({
  account_id: "", description: "", debit: "", credit: "", contact_id: ""
})

export default function EditManualJournalPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data } = useManualJournal(id)
  const updateJournal = useUpdateManualJournal()
  const postJournal = usePostManualJournal()
  const { data: accounts = [] } = useAccounts()
  const { data: contacts = [] } = useContacts()

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [reference, setReference] = useState("")
  const [description, setDescription] = useState("")
  const [currency, setCurrency] = useState("MYR")
  const [lines, setLines] = useState<JournalLine[]>([emptyLine(), emptyLine()])

  const populated = useRef(false)
  useEffect(() => {
    if (data && !populated.current) {
      populated.current = true
      setDate(data.date ? data.date.slice(0, 10) : new Date().toISOString().slice(0, 10))
      setReference(data.reference || "")
      setDescription(data.description || "")
      setCurrency(data.currency || "MYR")
      if (data.lines && data.lines.length > 0) {
        setLines(data.lines.map((l: any) => ({
          account_id: l.account_id || "",
          description: l.description || "",
          debit: l.debit != null ? String(l.debit) : "",
          credit: l.credit != null ? String(l.credit) : "",
          contact_id: l.contact_id || "",
        })))
      }
    }
  }, [data])

  const updateLine = (idx: number, field: keyof JournalLine, val: string) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: val } : l))
  }

  const addLine = () => setLines(prev => [...prev, emptyLine()])
  const removeLine = (idx: number) => setLines(prev => prev.filter((_, i) => i !== idx))

  const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0)
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0)
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01
  const hasLines = lines.every(l => l.account_id)

  const handleSave = () => {
    if (!isBalanced) {
      toast("Debits must equal credits", "warning")
      return
    }
    updateJournal.mutate(
      {
        id,
        date: new Date(date).toISOString(),
        reference: reference || null,
        description: description || null,
        currency,
        lines: lines.map(l => ({
          account_id: l.account_id,
          description: l.description || null,
          debit: parseFloat(l.debit) || 0,
          credit: parseFloat(l.credit) || 0,
          contact_id: l.contact_id || null,
        })),
      },
      { onSuccess: () => navigate("/accounting/journals") }
    )
  }

  const handlePost = () => {
    if (!id) return
    if (!confirm("Post this journal entry? It will appear in reports and can no longer be edited.")) return
    postJournal.mutate(id, {
      onSuccess: () => { toast("Journal entry posted", "success"); navigate("/accounting/journals") },
      onError: (e: any) => toast(e?.response?.data?.detail ?? "Failed to post journal entry", "warning"),
    })
  }

  const status = data?.status ?? "draft"
  const isDraft = status === "draft"

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-8">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Accounting</div>
          <h1 className="mt-1 text-2xl font-bold text-foreground">Edit Journal Entry</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isDraft ? "This entry is a draft and will not appear in reports until posted." : "Update this manual general ledger entry"}
          </p>
        </div>
        <Badge variant="outline" className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${statusColors[status] ?? ""}`}>
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </Badge>
      </div>

      <Card className="rounded-2xl border-border bg-card p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Date</label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} disabled={!isDraft} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Currency</label>
            <Select value={currency} onValueChange={setCurrency} disabled={!isDraft}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["MYR", "SGD", "USD", "EUR", "AUD"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Reference</label>
            <Input placeholder="e.g. ADJ-001" value={reference} onChange={e => setReference(e.target.value)} disabled={!isDraft} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Description</label>
            <Input placeholder="Brief description" value={description} onChange={e => setDescription(e.target.value)} disabled={!isDraft} />
          </div>
        </div>

        {/* Journal Lines */}
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-[30%]">Account</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Description</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Contact</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground w-[110px]">Debit</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground w-[110px]">Credit</th>
                <th className="w-[40px]" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => (
                <tr key={idx} className="border-b border-border last:border-0">
                  <td className="px-2 py-1.5">
                    <Select value={line.account_id} onValueChange={v => updateLine(idx, "account_id", v)} disabled={!isDraft}>
                      <SelectTrigger className="h-8 text-xs border-0 bg-transparent focus:ring-1"><SelectValue placeholder="Select account" /></SelectTrigger>
                      <SelectContent>
                        {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.code} – {a.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-1.5">
                    <Input className="h-8 text-xs border-0 bg-transparent focus-visible:ring-1" placeholder="Description" value={line.description} onChange={e => updateLine(idx, "description", e.target.value)} disabled={!isDraft} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Select value={line.contact_id} onValueChange={v => updateLine(idx, "contact_id", v)} disabled={!isDraft}>
                      <SelectTrigger className="h-8 text-xs border-0 bg-transparent focus:ring-1"><SelectValue placeholder="Optional" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        {contacts.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-1.5">
                    <Input type="number" className="h-8 text-xs text-right border-0 bg-transparent focus-visible:ring-1" placeholder="0.00" value={line.debit} onChange={e => updateLine(idx, "debit", e.target.value)} disabled={!isDraft} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input type="number" className="h-8 text-xs text-right border-0 bg-transparent focus-visible:ring-1" placeholder="0.00" value={line.credit} onChange={e => updateLine(idx, "credit", e.target.value)} disabled={!isDraft} />
                  </td>
                  <td className="px-2 py-1.5">
                    {isDraft && (
                      <button type="button" onClick={() => removeLine(idx)} className="text-muted-foreground hover:text-rose-600">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-muted/20">
                <td colSpan={3} className="px-3 py-2 text-xs text-muted-foreground">
                  {isDraft && (
                    <button type="button" onClick={addLine} className="flex items-center gap-1 text-blue-600 hover:underline">
                      <Plus className="h-3.5 w-3.5" /> Add line
                    </button>
                  )}
                </td>
                <td className={`px-3 py-2 text-right text-xs font-semibold ${isBalanced ? "text-emerald-700" : "text-rose-600"}`}>
                  {totalDebit.toFixed(2)}
                </td>
                <td className={`px-3 py-2 text-right text-xs font-semibold ${isBalanced ? "text-emerald-700" : "text-rose-600"}`}>
                  {totalCredit.toFixed(2)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        {!isBalanced && totalDebit > 0 && (
          <div className="mt-2 text-xs text-rose-600">Debits ({totalDebit.toFixed(2)}) do not equal Credits ({totalCredit.toFixed(2)})</div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => navigate("/accounting/journals")}>Cancel</Button>
          {isDraft && (
            <Button
              onClick={handleSave}
              disabled={updateJournal.isPending || !isBalanced || !hasLines || totalDebit === 0}
              variant="outline"
            >
              {updateJournal.isPending ? "Saving..." : "Save Draft"}
            </Button>
          )}
          {isDraft && (
            <Button
              onClick={handlePost}
              disabled={postJournal.isPending || !isBalanced || !hasLines || totalDebit === 0}
              className="bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] text-white"
            >
              {postJournal.isPending ? "Posting..." : "Post Journal Entry"}
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}
