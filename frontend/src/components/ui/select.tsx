import * as React from "react"
import { cn } from "../../lib/utils"
import { ChevronDown, Check } from "lucide-react"

interface SelectProps {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  children: React.ReactNode
}

const SelectContext = React.createContext<{
  value: string
  onValueChange: (v: string) => void
  open: boolean
  setOpen: (o: boolean) => void
}>({ value: "", onValueChange: () => {}, open: false, setOpen: () => {} })

function Select({ value: controlledValue, defaultValue = "", onValueChange, children }: SelectProps) {
  const [internalValue, setInternalValue] = React.useState(defaultValue)
  const [open, setOpen] = React.useState(false)
  const value = controlledValue ?? internalValue
  const handleChange = React.useCallback((v: string) => {
    setInternalValue(v)
    onValueChange?.(v)
    setOpen(false)
  }, [onValueChange])

  return (
    <SelectContext.Provider value={{ value, onValueChange: handleChange, open, setOpen }}>
      <div className="relative">{children}</div>
    </SelectContext.Provider>
  )
}

function SelectTrigger({ className, children, ...props }: React.ComponentProps<"button">) {
  const ctx = React.useContext(SelectContext)
  return (
    <button
      type="button"
      onClick={() => ctx.setOpen(!ctx.open)}
      className={cn(
        "flex w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none h-8",
        className
      )}
      {...props}
    >
      {children}
      <ChevronDown className="size-4 text-muted-foreground" />
    </button>
  )
}

function SelectValue({ placeholder }: { placeholder?: string; className?: string }) {
  const ctx = React.useContext(SelectContext)
  return <span className="flex flex-1 text-left truncate">{ctx.value || placeholder}</span>
}

function SelectContent({ className, children, ...props }: React.ComponentProps<"div">) {
  const ctx = React.useContext(SelectContext)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!ctx.open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.closest('.relative')?.contains(e.target as Node)) {
        ctx.setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [ctx.open, ctx])

  if (!ctx.open) return null
  return (
    <div
      ref={ref}
      className={cn(
        "absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 py-1",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

function SelectItem({ value, children, className, ...props }: React.ComponentProps<"div"> & { value: string }) {
  const ctx = React.useContext(SelectContext)
  const isSelected = ctx.value === value
  return (
    <div
      onClick={() => ctx.onValueChange(value)}
      className={cn(
        "relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1.5 pr-8 pl-2 text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground",
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
