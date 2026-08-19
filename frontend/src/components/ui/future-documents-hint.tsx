import { useQuery } from "@tanstack/react-query"
import api from "../../lib/api"

/** How many invoices/bills are dated after `after` and so excluded from a
 * report ending on that date — surfaced as a small hint so a correctly
 * recorded future-dated document doesn't read as "missing". */
export function useFutureDocumentsCount(after: string | undefined) {
  return useQuery<{ after: string; invoices: number; bills: number; total: number }>({
    queryKey: ["future-documents-count", after],
    queryFn: () => api.get("/reports/future-documents-count", { params: { after } }).then(r => r.data),
    enabled: !!after,
  })
}

export function FutureDocumentsHint({ after }: { after: string | undefined }) {
  const { data } = useFutureDocumentsCount(after)
  if (!data || data.total === 0) return null
  const parts: string[] = []
  if (data.invoices > 0) parts.push(`${data.invoices} invoice${data.invoices === 1 ? "" : "s"}`)
  if (data.bills > 0) parts.push(`${data.bills} bill${data.bills === 1 ? "" : "s"}`)
  return (
    <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-700">
      ⚠ {parts.join(" and ")} dated after {after} {data.total === 1 ? "isn't" : "aren't"} shown in this range — extend the date range to see {data.total === 1 ? "it" : "them"}.
    </div>
  )
}
