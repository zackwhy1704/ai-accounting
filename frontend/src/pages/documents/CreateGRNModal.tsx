import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { X, Loader2, CheckCircle2, AlertTriangle, Bot, BookOpen } from "lucide-react"
import api from "../../lib/api"
import { useToast } from "../../components/ui/toast"
import { useContacts } from "../../lib/hooks"

interface JournalLine {
  account_code: string
  account_name: string
  debit: number
  credit: number
  description: string
}

interface GRNSuggestion {
  document_id: string
  vendor_name: string
  contact_id: string | null
  received_date: string
  currency: string
  subtotal: number
  tax_amount: number
  total: number
  line_items: Array<{
    description: string
    quantity_ordered: number
    quantity_received: number
    unit_price: number
  }>
  journal_preview: JournalLine[]
}

interface EditableLineItem {
  description: string
  quantity_ordered: number
  quantity_received: number
  unit_price: number
}

export default function CreateGRNModal({
  documentId,
  onClose,
}: {
  documentId: string
  onClose: () => void
}) {
  const { toast } = useToast()
  const qc = useQueryClient()
  const { data: contacts = [] } = useContacts()

  const { data: suggestion, isLoading, error } = useQuery<GRNSuggestion>({
    queryKey: ["suggest-grn", documentId],
    queryFn: () => api.get(`/documents/${documentId}/suggest-grn`).then(r => r.data),
  })

  const [contactId, setContactId] = useState<string>("")
  const [receivedDate, setReceivedDate] = useState("")
  const [currency, setCurrency] = useState("SGD")
  const [postGL, setPostGL] = useState(true)
  const [lineItems, setLineItems] = useState<EditableLineItem[]>([])
  const [initialized, setInitialized] = useState(false)

  // Initialize state once suggestion loads
  if (suggestion && !initialized) {
    setContactId(suggestion.contact_id ?? "")
    setReceivedDate(suggestion.received_date.slice(0, 10))
    setCurrency(suggestion.currency)
    setLineItems(suggestion.line_items.map(li => ({ ...li })))
    setInitialized(true)
  }

  const updateLine = (i: number, field: keyof EditableLineItem, value: string | number) => {
    setLineItems(prev => {
      const updated = [...prev]
      updated[i] = { ...updated[i], [field]: typeof value === "string" ? parseFloat(value) || 0 : value }
      return updated
    })
  }

  const updateLineDesc = (i: number, value: string) => {
    setLineItems(prev => {
      const updated = [...prev]
      updated[i] = { ...updated[i], description: value }
      return updated
    })
  }

  const subtotal = lineItems.reduce((s, l) => s + l.quantity_received * l.unit_price, 0)
  const taxAmount = suggestion?.tax_amount ?? 0
  const total = subtotal + taxAmount

  const create = useMutation({
    mutationFn: () =>
      api.post(`/documents/${documentId}/create-grn`, {
        contact_id: contactId,
        received_date: new Date(receivedDate).toISOString(),
        currency,
        post_gl: postGL,
        line_items: lineItems,
      }),
    onSuccess: (res) => {
      toast(`GRN ${res.data.grn_number} created${postGL ? " — GL posted" : ""}`, "success")
      qc.invalidateQueries({ queryKey: ["documents"] })
      qc.invalidateQueries({ queryKey: ["goods-received-notes"] })
      onClose()
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { detail?: string } } }
      toast(err?.response?.data?.detail || "Failed to create GRN", "warning")
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 overflow-y-auto py-8">
      <div className="w-full max-w-3xl rounded-2xl bg-card border border-border shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-border">
          <div>
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-blue-500" />
              <span className="text-base font-semibold text-foreground">Create Goods Received Note</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              AI has extracted the following data. Review and confirm before posting.
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground ml-4">
            <X className="h-4 w-4" />
          </button>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Analysing document with AI...</span>
          </div>
        )}

        {error && (
          <div className="px-6 py-8 text-center text-sm text-rose-600">
            <AlertTriangle className="mx-auto mb-2 h-6 w-6" />
            Failed to extract document data. Ensure the document has been processed by AI.
          </div>
        )}

        {suggestion && initialized && (
          <div className="px-6 py-5 space-y-6">
            {/* GRN Details */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Supplier</label>
                <select
                  value={contactId}
                  onChange={e => setContactId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">— {suggestion.vendor_name} (new) —</option>
                  {contacts.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Received Date</label>
                <input
                  type="date"
                  value={receivedDate}
                  onChange={e => setReceivedDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Currency</label>
                <select
                  value={currency}
                  onChange={e => setCurrency(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {["SGD", "MYR", "USD", "EUR", "GBP"].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Line Items */}
            <div>
              <div className="text-xs font-semibold text-foreground mb-2">Line Items</div>
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Description</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground w-20">Qty Ord</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground w-20">Qty Recv</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground w-24">Unit Price</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground w-24">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {lineItems.map((li, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5">
                          <input
                            value={li.description}
                            onChange={e => updateLineDesc(i, e.target.value)}
                            className="w-full bg-transparent text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 rounded px-1 py-0.5"
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <input
                            type="number"
                            value={li.quantity_ordered}
                            onChange={e => updateLine(i, "quantity_ordered", e.target.value)}
                            className="w-full bg-transparent text-right text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 rounded px-1 py-0.5"
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <input
                            type="number"
                            value={li.quantity_received}
                            onChange={e => updateLine(i, "quantity_received", e.target.value)}
                            className="w-full bg-transparent text-right text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 rounded px-1 py-0.5"
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <input
                            type="number"
                            value={li.unit_price}
                            onChange={e => updateLine(i, "unit_price", e.target.value)}
                            className="w-full bg-transparent text-right text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 rounded px-1 py-0.5"
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right text-foreground font-medium">
                          {(li.quantity_received * li.unit_price).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/30 border-t border-border">
                    <tr>
                      <td colSpan={4} className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Subtotal</td>
                      <td className="px-3 py-2 text-right text-xs font-semibold text-foreground">{subtotal.toFixed(2)}</td>
                    </tr>
                    {taxAmount > 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-1 text-right text-xs text-muted-foreground">Tax (SST/GST)</td>
                        <td className="px-3 py-1 text-right text-xs text-foreground">{taxAmount.toFixed(2)}</td>
                      </tr>
                    )}
                    <tr>
                      <td colSpan={4} className="px-3 py-2 text-right text-xs font-semibold text-foreground">Total</td>
                      <td className="px-3 py-2 text-right text-sm font-bold text-foreground">{currency} {total.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Journal Preview */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <BookOpen className="h-4 w-4 text-blue-500" />
                <span className="text-xs font-semibold text-foreground">Journal Entry Preview</span>
                <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">AI Suggested</span>
              </div>
              <div className="rounded-xl border border-blue-200/60 dark:border-blue-800/30 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-blue-50/50 dark:bg-blue-900/10">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Account Code</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Account Name</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Description</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground w-24">Debit</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground w-24">Credit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {suggestion.journal_preview.map((jl, i) => (
                      <tr key={i} className="hover:bg-muted/30">
                        <td className="px-3 py-2 font-mono text-foreground">{jl.account_code}</td>
                        <td className="px-3 py-2 text-foreground">{jl.account_name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{jl.description}</td>
                        <td className="px-3 py-2 text-right text-emerald-600 font-medium">{jl.debit > 0 ? jl.debit.toFixed(2) : "—"}</td>
                        <td className="px-3 py-2 text-right text-rose-600 font-medium">{jl.credit > 0 ? jl.credit.toFixed(2) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-1.5 text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                Review before confirming — GL entries cannot be undone without a manual reversal.
              </p>
            </div>

            {/* Post GL toggle */}
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                onClick={() => setPostGL(p => !p)}
                className={`relative h-5 w-9 rounded-full transition-colors ${postGL ? "bg-primary" : "bg-muted"}`}
              >
                <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${postGL ? "translate-x-4" : "translate-x-0.5"}`} />
              </div>
              <span className="text-sm font-medium text-foreground">Post to General Ledger</span>
              <span className="text-xs text-muted-foreground">{postGL ? "Will create double-entry journal" : "GRN only — no GL posting"}</span>
            </label>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/20 rounded-b-2xl">
          <button onClick={onClose} className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => create.mutate()}
            disabled={!suggestion || !initialized || create.isPending || (!contactId && !suggestion?.contact_id)}
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {create.isPending
              ? <><Loader2 className="h-4 w-4 animate-spin" />Creating...</>
              : <><CheckCircle2 className="h-4 w-4" />Confirm &amp; Create GRN</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
