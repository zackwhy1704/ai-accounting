import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from "react"
import { X } from "lucide-react"
import { cn } from "../../lib/utils"

interface Toast {
  id: number
  message: string
  type?: "info" | "success" | "warning"
}

interface ToastContextType {
  toast: (message: string, type?: Toast["type"]) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

let nextId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((message: string, type: Toast["type"] = "info") => {
    const id = ++nextId
    setToasts(prev => [...prev, { id, message, type }])
  }, [])

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onDismiss={() => removeToast(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3500)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <div
      className={cn(
        "pointer-events-auto flex items-center gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm animate-in slide-in-from-bottom-2 fade-in duration-200",
        toast.type === "success"
          ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : toast.type === "warning"
            ? "border-amber-400/20 bg-amber-500/10 text-amber-700 dark:text-amber-300"
            : "border-border bg-card text-foreground"
      )}
    >
      <span className="text-sm">{toast.message}</span>
      <button type="button" onClick={onDismiss} className="ml-auto shrink-0 rounded-lg p-0.5 hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error("useToast must be used within ToastProvider")
  return ctx
}
