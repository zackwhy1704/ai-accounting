import { useState, useMemo } from "react"
import { useBillingPlans, useBillingUsage } from "../../lib/hooks"
import { useAuth } from "../../lib/auth"
import { useTheme } from "../../lib/theme"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Check } from "lucide-react"
import { cn } from "../../lib/utils"

function detectDefaultCurrency(orgCountry?: string): "MYR" | "SGD" {
  if (orgCountry) {
    const c = orgCountry.toUpperCase()
    if (c === "SG" || c === "SGP" || c === "SINGAPORE") return "SGD"
    if (c === "MY" || c === "MYS" || c === "MALAYSIA") return "MYR"
  }
  // Browser locale fallback
  try {
    const locale = (navigator.languages?.[0] || navigator.language || "").toLowerCase()
    if (locale.includes("sg") || locale.includes("en-sg")) return "SGD"
  } catch { /* ignore */ }
  // Timezone fallback
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""
    if (tz.includes("Singapore")) return "SGD"
  } catch { /* ignore */ }
  return "MYR"
}

export default function BillingPage() {
  const { user } = useAuth()
  const defaultCurrency = useMemo(() => detectDefaultCurrency((user as any)?.country), [user])
  const [currency, setCurrency] = useState<"MYR" | "SGD">(defaultCurrency)
  const { data: plans = [] } = useBillingPlans(currency)
  const { data: usage } = useBillingUsage()
  const { t } = useTheme()

  const currencySymbol = currency === "SGD" ? "S$" : "RM"
  const businessPlans = plans.filter(p => p.audience !== "firm")
  const firmPlans = plans.filter(p => p.audience === "firm")

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("billing.category") || "Settings"}</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Billing & Plans</div>
          <div className="mt-1 max-w-2xl text-sm text-muted-foreground">Choose the plan that fits your organization. Prices are billed monthly.</div>
        </div>
        <div className="flex items-center rounded-xl border border-border bg-card p-1 text-xs">
          <button
            type="button"
            onClick={() => setCurrency("MYR")}
            className={cn("h-8 rounded-lg px-3 font-medium", currency === "MYR" ? "bg-slate-900 text-white" : "text-muted-foreground hover:text-foreground")}
          >MYR</button>
          <button
            type="button"
            onClick={() => setCurrency("SGD")}
            className={cn("h-8 rounded-lg px-3 font-medium", currency === "SGD" ? "bg-slate-900 text-white" : "text-muted-foreground hover:text-foreground")}
          >SGD</button>
        </div>
      </div>

      {usage && (
        <Card className="rounded-2xl border border-border bg-card p-5">
          <div className="text-sm font-semibold text-foreground">Current Usage</div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <div className="text-xs text-muted-foreground">Plan</div>
              <div className="mt-1 text-lg font-semibold capitalize text-foreground">{usage.plan}</div>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <div className="text-xs text-muted-foreground">AI Scans</div>
              <div className="mt-1 text-lg font-semibold text-foreground">{usage.ai_scans_used} / {usage.ai_scans_limit}</div>
              <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
                <div className="h-1.5 rounded-full bg-slate-900" style={{ width: `${Math.min(100, (usage.ai_scans_used / Math.max(1, usage.ai_scans_limit)) * 100)}%` }} />
              </div>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <div className="text-xs text-muted-foreground">Users</div>
              <div className="mt-1 text-lg font-semibold text-foreground">{usage.users_count}</div>
            </div>
          </div>
        </Card>
      )}

      <div>
        <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Proposed plan pricing ({currency}, billed monthly)
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {businessPlans.map((plan) => {
            const isCurrent = usage?.plan === plan.id
            const isPopular = !!plan.popular
            return (
              <Card
                key={plan.id}
                className={cn(
                  "relative flex flex-col rounded-2xl border bg-card p-6 transition-colors",
                  isPopular ? "border-slate-900 ring-1 ring-slate-900" : "border-border",
                  isCurrent && "ring-2 ring-emerald-500"
                )}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-6 inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-900 ring-1 ring-slate-200">
                    Most popular
                  </div>
                )}
                <div className="text-sm font-medium text-muted-foreground">{plan.name}</div>
                <div className="mt-1 flex items-baseline gap-1">
                  {plan.price === 0 ? (
                    <span className="text-3xl font-bold text-foreground">Free</span>
                  ) : (
                    <>
                      <span className="text-3xl font-bold text-foreground">{currencySymbol} {plan.price}</span>
                      <span className="text-sm text-muted-foreground">/mo</span>
                    </>
                  )}
                </div>
                {plan.tagline && (
                  <div className="mt-2 text-xs text-muted-foreground">{plan.tagline}</div>
                )}
                <ul className="mt-5 flex-1 space-y-2">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                      <Check className="mt-[2px] h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  type="button"
                  disabled={isCurrent}
                  className={cn(
                    "mt-6 h-10 w-full rounded-xl text-sm font-semibold",
                    isCurrent
                      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                      : isPopular
                        ? "bg-slate-900 text-white hover:bg-slate-800"
                        : "bg-white text-slate-900 ring-1 ring-slate-300 hover:bg-slate-50"
                  )}
                >
                  {isCurrent ? "Current plan" : plan.price === 0 ? "Start free" : "Upgrade"}
                </Button>
              </Card>
            )
          })}
        </div>
      </div>

      {firmPlans.length > 0 && (
        <div>
          <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            For accounting firms
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {firmPlans.map((plan) => {
              const isCurrent = usage?.plan === plan.id
              return (
                <Card key={plan.id} className={cn("flex flex-col rounded-2xl border border-border bg-card p-6", isCurrent && "ring-2 ring-emerald-500")}>
                  <div className="text-sm font-medium text-muted-foreground">{plan.name}</div>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-foreground">{currencySymbol} {plan.price}</span>
                    <span className="text-sm text-muted-foreground">/mo</span>
                  </div>
                  {plan.tagline && <div className="mt-2 text-xs text-muted-foreground">{plan.tagline}</div>}
                  <ul className="mt-5 flex-1 space-y-2">
                    {plan.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                        <Check className="mt-[2px] h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    type="button"
                    disabled={isCurrent}
                    className={cn(
                      "mt-6 h-10 w-full rounded-xl text-sm font-semibold",
                      isCurrent ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-slate-900 text-white hover:bg-slate-800"
                    )}
                  >
                    {isCurrent ? "Current plan" : "Upgrade"}
                  </Button>
                </Card>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
