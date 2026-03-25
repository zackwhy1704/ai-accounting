import * as React from "react"
import { cn } from "../../lib/utils"

interface TabsProps {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  children: React.ReactNode
  className?: string
}

const TabsContext = React.createContext<{ value: string; onValueChange: (v: string) => void }>({ value: "", onValueChange: () => {} })

function Tabs({ value: controlledValue, defaultValue = "", onValueChange, children, className }: TabsProps) {
  const [internalValue, setInternalValue] = React.useState(defaultValue)
  const value = controlledValue ?? internalValue
  const handleChange = React.useCallback((v: string) => {
    setInternalValue(v)
    onValueChange?.(v)
  }, [onValueChange])

  return (
    <TabsContext.Provider value={{ value, onValueChange: handleChange }}>
      <div className={cn("flex flex-col gap-2", className)}>{children}</div>
    </TabsContext.Provider>
  )
}

function TabsList({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("inline-flex w-fit items-center justify-center rounded-lg bg-muted p-[3px] text-muted-foreground h-8", className)} {...props} />
}

function TabsTrigger({ className, value, ...props }: React.ComponentProps<"button"> & { value: string }) {
  const ctx = React.useContext(TabsContext)
  const isActive = ctx.value === value
  return (
    <button
      type="button"
      onClick={() => ctx.onValueChange(value)}
      data-state={isActive ? "active" : "inactive"}
      className={cn(
        "inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
        "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, value, children, ...props }: React.ComponentProps<"div"> & { value: string }) {
  const ctx = React.useContext(TabsContext)
  if (ctx.value !== value) return null
  return <div className={cn("flex-1 text-sm outline-none", className)} {...props}>{children}</div>
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
