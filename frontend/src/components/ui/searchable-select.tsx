import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, Check, X } from "lucide-react"

export interface SearchableOption {
  value: string
  label: string
  hint?: string
}

interface SearchableSelectProps {
  value: string
  onChange: (v: string) => void
  options: SearchableOption[]
  placeholder?: string
  emptyText?: string
  className?: string
  triggerClassName?: string
  footerAction?: { label: string; onClick: () => void }
  allowClear?: boolean
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Select...",
  emptyText = "No matches",
  className = "",
  triggerClassName = "",
  footerAction,
  allowClear = false,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = useMemo(() => options.find(o => o.value === value), [options, value])

  const filtered = useMemo(() => {
    if (!query.trim()) return options
    const q = query.toLowerCase()
    return options.filter(o =>
      o.label.toLowerCase().includes(q) || (o.hint?.toLowerCase().includes(q) ?? false),
    )
  }, [options, query])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery("")
      }
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [open])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex h-10 w-full items-center justify-between rounded-xl border border-input bg-transparent px-3 py-2 text-sm shadow-sm hover:bg-accent/40 focus:outline-none focus:ring-2 focus:ring-ring ${triggerClassName}`}
      >
        <span className={`truncate text-left ${selected ? "text-foreground" : "text-muted-foreground"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <div className="ml-2 flex items-center gap-1 shrink-0">
          {allowClear && selected && (
            <span
              role="button"
              onClick={e => { e.stopPropagation(); onChange("") }}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </div>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-auto rounded-xl border border-border bg-popover text-popover-foreground shadow-lg">
          <div className="sticky top-0 border-b border-border bg-popover p-2">
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Type to search..."
              className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">{emptyText}</div>
            ) : (
              filtered.map(o => (
                <button
                  key={o.value}
                  type="button"
                  onMouseDown={e => {
                    e.preventDefault()
                    onChange(o.value)
                    setOpen(false)
                    setQuery("")
                  }}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent ${o.value === value ? "bg-accent/40" : ""}`}
                >
                  <span className="truncate">{o.label}</span>
                  {o.value === value && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                </button>
              ))
            )}
            {footerAction && (
              <button
                type="button"
                onMouseDown={e => {
                  e.preventDefault()
                  footerAction.onClick()
                  setOpen(false)
                  setQuery("")
                }}
                className="w-full border-t border-border px-3 py-2 text-left text-xs font-medium text-primary hover:bg-accent"
              >
                {footerAction.label}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
