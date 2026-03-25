import { Card } from "../components/ui/card"
import { Construction } from "lucide-react"
import { useTheme } from "../lib/theme"

export default function GenericPage({ title, category }: { title: string; category: string }) {
  const { t } = useTheme()
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">{category}</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{title}</div>
        <div className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("common.underDevelopment")}</div>
      </div>
      <Card className="rounded-2xl border-border bg-card p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted shadow-[0_0_0_1px_rgba(15,23,42,0.08)]"><Construction className="h-6 w-6 text-muted-foreground" /></div>
          <div className="mt-4 text-base font-semibold text-foreground">{t("common.comingSoon")}</div>
          <div className="mt-1 max-w-md text-sm text-muted-foreground">{t("common.comingSoonMsg", { title })}</div>
        </div>
      </Card>
    </div>
  )
}
