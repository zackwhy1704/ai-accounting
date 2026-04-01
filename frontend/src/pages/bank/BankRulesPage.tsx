import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Plus, Zap, Pencil, Trash2 } from "lucide-react"
import { useBankRules, useAccounts, useContacts } from "../../lib/hooks"
import { formatDate } from "../../lib/utils"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"
import { useToast } from "../../components/ui/toast"
import { useCreateBankRule } from "../../lib/hooks"
import { RowActionsMenu } from "../../components/ui/row-actions"

interface ConditionRow {
  field: string
  operator: string
  value: string
}

const FIELDS = [
  { value: "description", label: "Description" },
  { value: "amount", label: "Amount" },
  { value: "reference", label: "Reference" },
]

const OPERATORS: Record<string, string[]> = {
  description: ["contains", "starts_with", "ends_with", "equals"],
  amount: ["equals", "greater_than", "less_than"],
  reference: ["contains", "equals"],
}

export default function BankRulesPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data: rules = [], isLoading } = useBankRules()
  const { data: accounts = [] } = useAccounts()
  const { data: contacts = [] } = useContacts()
  const createRule = useCreateBankRule()

  const [showForm, setShowForm] = useState(false)
  const [ruleName, setRuleName] = useState("")
  const [conditions, setConditions] = useState<ConditionRow[]>([{ field: "description", operator: "contains", value: "" }])
  const [conditionLogic, setConditionLogic] = useState("AND")
  const [actionAccountId, setActionAccountId] = useState("")
  const [actionContactId, setActionContactId] = useState("")

  const addCondition = () => setConditions(prev => [...prev, { field: "description", operator: "contains", value: "" }])
  const updateCondition = (idx: number, key: keyof ConditionRow, val: string) =>
    setConditions(prev => prev.map((c, i) => i === idx ? { ...c, [key]: val } : c))
  const removeCondition = (idx: number) => setConditions(prev => prev.filter((_, i) => i !== idx))

  const handleSave = () => {
    if (!ruleName || conditions.some(c => !c.value)) return
    createRule.mutate(
      {
        name: ruleName,
        conditions,
        condition_logic: conditionLogic,
        action_account_id: actionAccountId || null,
        action_contact_id: actionContactId || null,
      },
      {
        onSuccess: () => {
          toast("Bank rule created", "success")
          setShowForm(false)
          setRuleName(""); setConditions([{ field: "description", operator: "contains", value: "" }])
          setActionAccountId(""); setActionContactId("")
        },
        onError: () => toast("Failed to create rule", "warning"),
      }
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Bank</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Bank Rules</div>
          <div className="mt-1 max-w-2xl text-sm text-muted-foreground">Automatically categorize bank transactions based on rules</div>
        </div>
        <Button type="button" onClick={() => setShowForm(v => !v)} className="h-9 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-3 text-xs font-semibold text-white shadow-[0_0_0_1px_rgba(124,157,255,0.25),0_16px_40px_rgba(0,0,0,0.35)] hover:opacity-95">
          <Plus className="mr-2 h-4 w-4" /> New Rule
        </Button>
      </div>

      {showForm && (
        <Card className="rounded-2xl border-border bg-card p-5 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
          <div className="text-sm font-semibold text-foreground mb-4">New Bank Rule</div>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Rule Name</label>
              <Input placeholder="e.g. Auto-categorize Shopee payments" value={ruleName} onChange={e => setRuleName(e.target.value)} />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-foreground">Conditions</label>
                <Select value={conditionLogic} onValueChange={setConditionLogic}>
                  <SelectTrigger className="h-7 w-20 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AND">AND</SelectItem>
                    <SelectItem value="OR">OR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {conditions.map((c, idx) => (
                <div key={idx} className="flex items-center gap-2 mb-2">
                  <Select value={c.field} onValueChange={v => updateCondition(idx, "field", v)}>
                    <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FIELDS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={c.operator} onValueChange={v => updateCondition(idx, "operator", v)}>
                    <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(OPERATORS[c.field] ?? ["contains", "equals"]).map(op => <SelectItem key={op} value={op}>{op.replace("_", " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input className="h-8 text-xs flex-1" placeholder="Value" value={c.value} onChange={e => updateCondition(idx, "value", e.target.value)} />
                  {conditions.length > 1 && (
                    <button type="button" className="text-rose-600 text-xs" onClick={() => removeCondition(idx)}>✕</button>
                  )}
                </div>
              ))}
              <button type="button" onClick={addCondition} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                <Plus className="h-3 w-3" /> Add condition
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Assign Account</label>
                <Select value={actionAccountId} onValueChange={setActionAccountId}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.code} – {a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Assign Contact</label>
                <Select value={actionContactId} onValueChange={setActionContactId}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select contact" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {contacts.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button type="button" variant="secondary" className="h-8 text-xs" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="button" className="h-8 text-xs bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] text-white" onClick={handleSave} disabled={createRule.isPending || !ruleName}>
                {createRule.isPending ? "Saving..." : "Save Rule"}
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card className="rounded-2xl border-border bg-card p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        {isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading...</div>
        ) : rules.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <Zap className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="mt-4 text-base font-semibold text-foreground">No bank rules</div>
            <div className="mt-1 text-sm text-muted-foreground">Create rules to automatically categorize transactions</div>
          </div>
        ) : (
          <div className="space-y-2">
            {rules.map(r => (
              <div key={r.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 hover:bg-muted/30">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium text-foreground">{r.name}</div>
                    {r.is_active && <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-700">Active</span>}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {r.conditions.length} condition{r.conditions.length !== 1 ? "s" : ""} · Applied {r.times_applied}×
                    {r.last_applied_at ? ` · Last: ${formatDate(r.last_applied_at)}` : ""}
                  </div>
                </div>
                <RowActionsMenu actions={[
                  { label: "Edit", icon: <Pencil className="h-4 w-4" />, onClick: () => navigate(`/bank/rules/${r.id}/edit`) },
                  { label: "Delete", icon: <Trash2 className="h-4 w-4" />, onClick: () => {}, danger: true, dividerBefore: true },
                ]} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
