import { useState } from "react"
import { useTheme, LANG_LABELS, type Language } from "../../lib/theme"
import { useOrgSettings, useUpdateCurrency } from "../../lib/hooks"
import { useToast } from "../../components/ui/toast"
import { Card } from "../../components/ui/card"
import { Check, Globe, DollarSign, Loader2 } from "lucide-react"
import { cn } from "../../lib/utils"

const CURRENCIES = [
  { code: "SGD", label: "SGD — Singapore Dollar", symbol: "S$" },
  { code: "MYR", label: "MYR — Malaysian Ringgit", symbol: "RM" },
  { code: "USD", label: "USD — US Dollar", symbol: "$" },
]

export default function SettingsPage() {
  const { language, setLanguage, t } = useTheme()
  const { data: orgSettings } = useOrgSettings()
  const updateCurrency = useUpdateCurrency()
  const { toast } = useToast()
  const [pendingCurrency, setPendingCurrency] = useState<string | null>(null)

  const currentCurrency = pendingCurrency ?? orgSettings?.currency ?? "SGD"

  const handleCurrencyChange = (code: string) => {
    setPendingCurrency(code)
    updateCurrency.mutate(code, {
      onSuccess: () => {
        toast(`Currency updated to ${code}`, "success")
        setPendingCurrency(null)
      },
      onError: () => {
        toast("Failed to update currency", "warning")
        setPendingCurrency(null)
      },
    })
  }

  const languages: Language[] = ["en", "zh", "ms"]

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Settings</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{t("nav.controlPanel")}</div>
        <div className="mt-1 max-w-2xl text-sm text-muted-foreground">Manage your organization preferences</div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Currency */}
        <Card className="rounded-2xl border-border bg-card p-5 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <div className="text-sm font-semibold text-foreground">Default Currency</div>
            {updateCurrency.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>
          <div className="space-y-1.5">
            {CURRENCIES.map((c) => (
              <button
                key={c.code}
                type="button"
                disabled={updateCurrency.isPending}
                onClick={() => handleCurrencyChange(c.code)}
                className={cn(
                  "flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm transition-colors",
                  currentCurrency === c.code
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                <span>{c.label}</span>
                {currentCurrency === c.code && <Check className="h-4 w-4" />}
              </button>
            ))}
          </div>
        </Card>

        {/* Language */}
        <Card className="rounded-2xl border-border bg-card p-5 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
          <div className="flex items-center gap-2 mb-4">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <div className="text-sm font-semibold text-foreground">{t("user.language")}</div>
          </div>
          <div className="space-y-1.5">
            {languages.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLanguage(l)}
                className={cn(
                  "flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm transition-colors",
                  l === language
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                {LANG_LABELS[l]}
                {l === language && <Check className="h-4 w-4" />}
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
