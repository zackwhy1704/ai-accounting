/**
 * Reusable row action dropdown for list pages.
 *
 * Usage:
 *   <RowActionsMenu actions={[
 *     { label: "Edit", icon: <Pencil className="h-3.5 w-3.5" />, onClick: () => navigate(`/path/${id}/edit`) },
 *     { label: "Delete", icon: <Trash2 className="h-3.5 w-3.5" />, onClick: handleDelete, danger: true },
 *   ]} />
 */

import { useRef, useEffect, useState } from "react"
import { MoreHorizontal } from "lucide-react"
import { Button } from "./button"

export interface RowAction {
  label: string
  icon?: React.ReactNode
  onClick: () => void
  danger?: boolean
  /** Render a separator line above this action */
  dividerBefore?: boolean
  disabled?: boolean
}

interface RowActionsMenuProps {
  actions: RowAction[]
}

export function RowActionsMenu({ actions }: RowActionsMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground"
        onClick={() => setOpen(v => !v)}
      >
        <MoreHorizontal className="h-4 w-4" />
      </Button>
      {open && (
        <div className="absolute right-0 top-8 z-50 w-56 rounded-xl border border-border bg-card p-1 shadow-lg">
          {actions.map((action, i) => (
            <div key={i}>
              {action.dividerBefore && <div className="my-1 h-px bg-border" />}
              <button
                disabled={action.disabled}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed ${
                  action.danger ? "text-rose-600" : "text-foreground"
                }`}
                onClick={() => {
                  setOpen(false)
                  action.onClick()
                }}
              >
                {action.icon}
                {action.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
