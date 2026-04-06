import * as React from "react"
import * as ReactDOM from "react-dom"
import { cn } from "../../lib/utils"
import { ChevronDown, Check } from "lucide-react"

interface SelectContextValue {
  value: string
  label: string
  onValueChange: (value: string, label: string) => void
  open: boolean
  setOpen: (o: boolean) => void
  triggerRef: React.RefObject<HTMLButtonElement | null>
}

const SelectContext = React.createContext<SelectContextValue>({
  value: "",
  label: "",
  onValueChange: () => {},
  open: false,
  setOpen: () => {},
  triggerRef: { current: null },
})

interface SelectProps {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  children: React.ReactNode
}

function Select({ value: controlledValue, defaultValue = "", onValueChange, children }: SelectProps) {
  const [internalValue, setInternalValue] = React.useState(defaultValue)
  const [label, setLabel] = React.useState("")
  const [open, setOpen] = React.useState(false)
  const triggerRef = React.useRef<HTMLButtonElement>(null)

  const value = controlledValue ?? internalValue

  const handleChange = React.useCallback((v: string, l: string) => {
    setInternalValue(v)
    setLabel(l)
    onValueChange?.(v)
    setOpen(false)
  }, [onValueChange])

  return (
    <SelectContext.Provider value={{ value, label, onValueChange: handleChange, open, setOpen, triggerRef }}>
      <div className="relative">{children}</div>
    </SelectContext.Provider>
  )
}

function SelectTrigger({ className, children, ...props }: React.ComponentProps<"button">) {
  const ctx = React.useContext(SelectContext)
  return (
    <button
      ref={ctx.triggerRef}
      type="button"
      onClick={() => ctx.setOpen(!ctx.open)}
      className={cn(
        "flex w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none h-8",
        className
      )}
      {...props}
    >
      {children}
      <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
    </button>
  )
}

function SelectValue({ placeholder }: { placeholder?: string; className?: string }) {
  const ctx = React.useContext(SelectContext)
  // Show the label of the selected item, or the placeholder
  const display = ctx.label || (ctx.value && ctx.value !== "" ? ctx.value : "")
  return <span className="flex flex-1 text-left truncate">{display || <span className="text-muted-foreground">{placeholder}</span>}</span>
}

function SelectContent({ className, children, ...props }: React.ComponentProps<"div">) {
  const ctx = React.useContext(SelectContext)
  const ref = React.useRef<HTMLDivElement>(null)
  const [pos, setPos] = React.useState({ top: 0, left: 0, width: 0 })

  // Calculate dropdown position from trigger
  React.useLayoutEffect(() => {
    if (!ctx.open || !ctx.triggerRef.current) return
    const rect = ctx.triggerRef.current.getBoundingClientRect()
    setPos({
      top: rect.bottom + window.scrollY + 4,
      left: rect.left + window.scrollX,
      width: rect.width,
    })
  }, [ctx.open, ctx.triggerRef])

  // Close on outside click
  React.useEffect(() => {
    if (!ctx.open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        ref.current && !ref.current.contains(target) &&
        ctx.triggerRef.current && !ctx.triggerRef.current.contains(target)
      ) {
        ctx.setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [ctx.open, ctx])

  if (!ctx.open) return null

  return ReactDOM.createPortal(
    <div
      ref={ref}
      style={{ top: pos.top, left: pos.left, minWidth: pos.width }}
      className={cn(
        "fixed z-[9999] max-h-60 overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 py-1",
        className
      )}
      {...props}
    >
      {children}
    </div>,
    document.body
  )
}

function SelectItem({ value, children, className, disabled, ...props }: React.ComponentProps<"div"> & { value: string; disabled?: boolean }) {
  const ctx = React.useContext(SelectContext)
  const isSelected = ctx.value === value
  const label = typeof children === "string" ? children : ""

  return (
    <div
      onClick={() => !disabled && ctx.onValueChange(value, label)}
      aria-disabled={disabled}
      className={cn(
        "relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1.5 pr-8 pl-2 text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground",
        disabled && "pointer-events-none opacity-40",
        className
      )}
      {...props}
    >
      <span className="flex-1">{children}</span>
      {isSelected && <Check className="absolute right-2 size-4" />}
    </div>
  )
}

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue }
