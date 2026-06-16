import { AlertTriangle } from "lucide-react"

/** Inline error panel for a failed data fetch — replaces the blank-screen
 *  fall-through (isLoading ? … : data ? … : null) on report/list pages. */
export function QueryError({ error, message }: { error?: unknown; message?: string }) {
  const detail = (error as any)?.response?.data?.detail
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <AlertTriangle className="h-6 w-6 text-rose-500" />
      <div className="text-sm font-medium text-rose-600">
        {message ?? "Couldn't load this data."}
      </div>
      <div className="text-xs text-muted-foreground">
        {typeof detail === "string" ? detail : "Please try again, or adjust your filters."}
      </div>
    </div>
  )
}
