/**
 * Reusable row action dropdown for list pages.
 *
 * Usage:
 *   <RowActionsMenu actions={[
 *     { label: "Edit", icon: <Pencil className="h-3.5 w-3.5" />, onClick: () => navigate(`/path/${id}/edit`) },
 *     { label: "Delete", icon: <Trash2 className="h-3.5 w-3.5" />, onClick: handleDelete, danger: true },
 *   ]} />
 */

import { useRef, useEffect, useState, useLayoutEffect } from "react"
import ReactDOM from "react-dom"
import { MoreHorizontal } from "lucide-react"

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
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + window.scrollY + 4, left: rect.right + window.scrollX - 224 })
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  const menu = open ? ReactDOM.createPortal(
    <div
      ref={menuRef}
      style={{ position: "absolute", top: pos.top, left: pos.left, zIndex: 9999 }}
      className="w-56 rounded-xl border border-border bg-card p-1 shadow-lg"
    >
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
    </div>,
    document.body
  ) : null

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors"
        onClick={() => setOpen(v => !v)}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {menu}
    </div>
  )
}
