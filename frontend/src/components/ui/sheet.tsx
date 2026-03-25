import * as React from "react"
import { cn } from "../../lib/utils"

interface SheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}

function Sheet({ open, onOpenChange, children }: SheetProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-black/10 backdrop-blur-xs" onClick={() => onOpenChange(false)} />
      {children}
    </div>
  )
}

function SheetContent({
  className,
  children,
  side = "right",
}: {
  className?: string
  children: React.ReactNode
  side?: "left" | "right"
}) {
  return (
    <div
      className={cn(
        "fixed z-50 flex flex-col bg-background shadow-lg",
        side === "left" ? "inset-y-0 left-0 h-full w-3/4 max-w-sm border-r" : "inset-y-0 right-0 h-full w-3/4 max-w-sm border-l",
        className
      )}
    >
      {children}
    </div>
  )
}

export { Sheet, SheetContent }
