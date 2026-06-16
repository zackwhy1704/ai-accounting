import type { JournalEntryGroup } from "../lib/hooks/_shared"

/** Renders posted GL double-entry groups for a document (invoice/bill/CN). */
export function JournalEntriesPanel({ groups, isLoading }: { groups?: JournalEntryGroup[]; isLoading?: boolean }) {
  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading journal entries…</div>
  }
  if (!groups || groups.length === 0) {
    return <div className="text-sm text-muted-foreground">No journal entries posted yet.</div>
  }
  return (
    <div className="space-y-2">
      {groups.map((g, i) => {
        const totalDr = g.lines.reduce((s, l) => s + (l.debit || 0), 0)
        const totalCr = g.lines.reduce((s, l) => s + (l.credit || 0), 0)
        return (
          <div key={`${g.ref_id}-${i}`} className="rounded-xl border border-border p-3 text-xs">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-medium text-foreground">{g.description || g.ref || "Journal entry"}</span>
              <span className="text-muted-foreground">{g.ts ? new Date(g.ts).toLocaleDateString() : "—"}</span>
            </div>
            <div className="space-y-1">
              {g.lines.map((l, j) => (
                <div key={j} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{l.account_code} — {l.account_name}</span>
                  <span className="tabular-nums">
                    {l.debit > 0 ? (
                      <span className="text-emerald-600">DR {l.debit.toFixed(2)}</span>
                    ) : (
                      <span className="text-rose-600">CR {l.credit.toFixed(2)}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-border pt-2 font-medium text-foreground">
              <span>Balance</span>
              <span className="tabular-nums">DR {totalDr.toFixed(2)} · CR {totalCr.toFixed(2)}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
