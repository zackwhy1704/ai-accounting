import { X } from "lucide-react"
import { Sheet, SheetContent } from "./sheet"

export interface DetailField {
  label: string
  value: React.ReactNode
}

interface ViewDetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  subtitle?: string
  fields: DetailField[]
}

export function ViewDetailSheet({ open, onOpenChange, title, subtitle, fields }: ViewDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="!w-full !max-w-md">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <div className="text-base font-semibold text-foreground">{title}</div>
            {subtitle && <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-0 divide-y divide-border">
            {fields.map((f, i) => (
              <div key={i} className="flex items-start justify-between py-3">
                <span className="text-sm text-muted-foreground">{f.label}</span>
                <span className="text-sm font-medium text-foreground text-right max-w-[60%]">{f.value ?? "—"}</span>
              </div>
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
