interface PaginationControlsProps {
  page: number
  pages: number
  total: number
  limit: number
  onPageChange: (p: number) => void
}

export function PaginationControls({ page, pages, total, limit, onPageChange }: PaginationControlsProps) {
  if (pages <= 1) return null
  return (
    <div className="flex items-center justify-between border-t border-border px-4 py-3">
      <span className="text-xs text-muted-foreground">
        Showing {Math.min((page - 1) * limit + 1, total)}–{Math.min(page * limit, total)} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="rounded-lg border border-border px-2 py-1 text-xs disabled:opacity-40 hover:bg-muted"
        >← Prev</button>
        <span className="px-2 text-xs text-muted-foreground">{page} / {pages}</span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pages}
          className="rounded-lg border border-border px-2 py-1 text-xs disabled:opacity-40 hover:bg-muted"
        >Next →</button>
      </div>
    </div>
  )
}
