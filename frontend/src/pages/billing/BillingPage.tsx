import { useBillingPlans, useBillingUsage } from "../../lib/hooks"
import { useTheme } from "../../lib/theme"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Check, Sparkles } from "lucide-react"
import { cn } from "../../lib/utils"

export default function BillingPage() {
  const { data: plans = [] } = useBillingPlans()
  const { data: usage } = useBillingUsage()
  const { t } = useTheme()

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">{t("billing.category")}</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{t("billing.title")}</div>
        <div className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("billing.desc")}</div>
      </div>

      {usage && (
        <Card className="rounded-2xl border-border bg-card p-5 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
          <div className="text-sm font-semibold text-foreground">{t("billing.currentUsage")}</div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-4"><div className="text-xs text-muted-foreground">{t("billing.plan")}</div><div className="mt-1 text-lg font-semibold text-foreground capitalize">{usage.plan}</div></div>
            <div className="rounded-xl border border-border bg-card p-4"><div className="text-xs text-muted-foreground">{t("billing.aiScans")}</div><div className="mt-1 text-lg font-semibold text-foreground">{usage.ai_scans_used} / {usage.ai_scans_limit}</div>
              <div className="mt-2 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF]" style={{ width: `${Math.min(100, (usage.ai_scans_used / usage.ai_scans_limit) * 100)}%` }} /></div>
            </div>
            <div className="rounded-xl border border-border bg-card p-4"><div className="text-xs text-muted-foreground">{t("billing.users")}</div><div className="mt-1 text-lg font-semibold text-foreground">{usage.users_count}</div></div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => (
          <Card key={plan.id} className={cn("rounded-2xl border-border bg-card p-5 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]", usage?.plan === plan.id && "ring-2 ring-[#4D63FF]")}>
            <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-[#7C9DFF]" /><div className="text-sm font-semibold text-foreground">{plan.name}</div></div>
            <div className="mt-3 text-2xl font-bold text-foreground">{plan.price === 0 ? "Free" : `$${plan.price}/mo`}</div>
            <div className="mt-1 text-xs text-muted-foreground">{typeof plan.ai_scans === "number" ? `${plan.ai_scans} ${t("billing.aiScans").toLowerCase()}` : plan.ai_scans} | {plan.max_users} {t("billing.users").toLowerCase()}</div>
            <ul className="mt-4 space-y-2">{plan.features.map((f, i) => (<li key={i} className="flex items-center gap-2 text-xs text-muted-foreground"><Check className="h-3.5 w-3.5 text-emerald-500" /> {f}</li>))}</ul>
            <Button type="button" disabled={usage?.plan === plan.id} className={cn("mt-4 h-9 w-full rounded-xl text-xs font-semibold", usage?.plan === plan.id ? "bg-muted text-muted-foreground" : "bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] text-white hover:opacity-95")}>{usage?.plan === plan.id ? t("billing.currentPlan") : t("billing.upgrade")}</Button>
          </Card>
        ))}
      </div>
    </div>
  )
}
