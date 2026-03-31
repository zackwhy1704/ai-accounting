import { useState } from "react"
import { useTheme, LANG_LABELS, type Language } from "../../lib/theme"
import { useOrgSettings, useUpdateCurrency, useTaxRates, useCreateTaxRate, useExchangeRates, useSyncExchangeRates, useCreateExchangeRate } from "../../lib/hooks"
import { useToast } from "../../components/ui/toast"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Check, Globe, DollarSign, Loader2, RefreshCw, Receipt, Plus } from "lucide-react"
import { cn, formatDate } from "../../lib/utils"

const CURRENCIES = [
  { code: "MYR", label: "MYR — Malaysian Ringgit", symbol: "RM" },
  { code: "SGD", label: "SGD — Singapore Dollar", symbol: "S$" },
  { code: "USD", label: "USD — US Dollar", symbol: "$" },
  { code: "HKD", label: "HKD — Hong Kong Dollar", symbol: "HK$" },
  { code: "AUD", label: "AUD — Australian Dollar", symbol: "A$" },
  { code: "EUR", label: "EUR — Euro", symbol: "€" },
]

const TAX_REGIMES = [
  { value: "MY_SST", label: "Malaysia SST", desc: "Service & Sales Tax (6% / 10%)", flag: "🇲🇾" },
  { value: "SG_GST", label: "Singapore GST", desc: "Goods & Services Tax (9%)", flag: "🇸🇬" },
  { value: "AU_GST", label: "Australia GST", desc: "Goods & Services Tax (10%)", flag: "🇦🇺" },
  { value: "EU_VAT", label: "EU VAT", desc: "Value Added Tax", flag: "🇪🇺" },
  { value: "NONE", label: "No Tax", desc: "Tax-exempt or not applicable", flag: "🌐" },
]

const DEFAULT_TAX_RATES: Record<string, Array<{ name: string; code: string; rate: number; tax_type: string; sst_category?: string }>> = {
  MY_SST: [
    { name: "Service Tax 6%", code: "SST6", rate: 6, tax_type: "SST", sst_category: "service_tax" },
    { name: "Sales Tax 10%", code: "SST10", rate: 10, tax_type: "SST", sst_category: "sales_tax" },
    { name: "Zero-rated", code: "ZR", rate: 0, tax_type: "SST" },
    { name: "Exempt", code: "EX", rate: 0, tax_type: "SST" },
  ],
  SG_GST: [
    { name: "GST 9%", code: "GST9", rate: 9, tax_type: "GST" },
    { name: "Zero-rated GST", code: "ZR", rate: 0, tax_type: "GST" },
    { name: "Exempt GST", code: "EX", rate: 0, tax_type: "GST" },
  ],
}

export default function SettingsPage() {
  const { language, setLanguage, t } = useTheme()
  const { data: orgSettings } = useOrgSettings()
  const updateCurrency = useUpdateCurrency()
  const { toast } = useToast()
  const [pendingCurrency, setPendingCurrency] = useState<string | null>(null)

  const { data: taxRates = [], isLoading: taxRatesLoading } = useTaxRates()
  const createTaxRate = useCreateTaxRate()
  const { data: exchangeRates = [], isLoading: fxLoading } = useExchangeRates()
  const syncFx = useSyncExchangeRates()
  const createFx = useCreateExchangeRate()

  const [showAddTax, setShowAddTax] = useState(false)
  const [newTaxName, setNewTaxName] = useState("")
  const [newTaxCode, setNewTaxCode] = useState("")
  const [newTaxRate, setNewTaxRate] = useState("")
  const [newTaxType, setNewTaxType] = useState("SST")

  const [showAddFx, setShowAddFx] = useState(false)
  const [fxFrom, setFxFrom] = useState("USD")
  const [fxTo, setFxTo] = useState("MYR")
  const [fxRate, setFxRate] = useState("")

  const currentCurrency = pendingCurrency ?? orgSettings?.currency ?? "MYR"
  const currentRegime = orgSettings?.tax_regime ?? "MY_SST"

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

  const handleAddDefaultRates = () => {
    const defaults = DEFAULT_TAX_RATES[currentRegime] ?? []
    Promise.all(
      defaults.map(r => createTaxRate.mutateAsync(r))
    ).then(() => toast("Default tax rates added", "success"))
     .catch(() => toast("Some rates already exist", "warning"))
  }

  const handleSaveTaxRate = () => {
    if (!newTaxName || !newTaxCode || !newTaxRate) return
    createTaxRate.mutate(
      { name: newTaxName, code: newTaxCode, rate: parseFloat(newTaxRate), tax_type: newTaxType },
      {
        onSuccess: () => {
          toast("Tax rate added", "success")
          setShowAddTax(false)
          setNewTaxName(""); setNewTaxCode(""); setNewTaxRate("")
        },
        onError: () => toast("Failed to add tax rate (code may already exist)", "warning"),
      }
    )
  }

  const handleSaveFx = () => {
    if (!fxFrom || !fxTo || !fxRate) return
    createFx.mutate(
      { from_currency: fxFrom.toUpperCase(), to_currency: fxTo.toUpperCase(), rate: parseFloat(fxRate), rate_date: new Date().toISOString(), source: "manual" },
      {
        onSuccess: () => { toast("Exchange rate saved", "success"); setShowAddFx(false); setFxRate("") },
        onError: () => toast("Failed to save exchange rate", "warning"),
      }
    )
  }

  const languages: Language[] = ["en", "zh", "ms"]

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Settings</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{t("nav.controlPanel")}</div>
        <div className="mt-1 max-w-2xl text-sm text-muted-foreground">Manage your organization preferences, tax regime, and exchange rates</div>
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

        {/* Tax Regime */}
        <Card className="rounded-2xl border-border bg-card p-5 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
          <div className="flex items-center gap-2 mb-4">
            <Receipt className="h-4 w-4 text-muted-foreground" />
            <div className="text-sm font-semibold text-foreground">Tax Regime</div>
          </div>
          <div className="space-y-1.5">
            {TAX_REGIMES.map((r) => (
              <div
                key={r.value}
                className={cn(
                  "flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm",
                  currentRegime === r.value ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground"
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="text-base">{r.flag}</span>
                  <div>
                    <div className="font-medium">{r.label}</div>
                    <div className="text-xs text-muted-foreground">{r.desc}</div>
                  </div>
                </div>
                {currentRegime === r.value && <Check className="h-4 w-4" />}
              </div>
            ))}
          </div>
          <div className="mt-3 text-xs text-muted-foreground">Tax regime is set during onboarding. Contact support to change it.</div>
        </Card>

        {/* Tax Rates */}
        <Card className="rounded-2xl border-border bg-card p-5 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              <div className="text-sm font-semibold text-foreground">Tax Rates</div>
              {taxRatesLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>
            <div className="flex items-center gap-2">
              {DEFAULT_TAX_RATES[currentRegime] && taxRates.length === 0 && (
                <Button type="button" variant="secondary" className="h-7 rounded-lg px-2 text-xs" onClick={handleAddDefaultRates}>
                  Load Defaults
                </Button>
              )}
              <Button type="button" variant="secondary" className="h-7 w-7 rounded-lg p-0" onClick={() => setShowAddTax(v => !v)}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          {showAddTax && (
            <div className="mb-3 space-y-2 rounded-xl border border-border bg-muted/40 p-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Name</div>
                  <Input value={newTaxName} onChange={e => setNewTaxName(e.target.value)} placeholder="SST 6%" className="h-8 text-xs" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Code</div>
                  <Input value={newTaxCode} onChange={e => setNewTaxCode(e.target.value)} placeholder="SST6" className="h-8 text-xs" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Rate %</div>
                  <Input type="number" value={newTaxRate} onChange={e => setNewTaxRate(e.target.value)} placeholder="6" className="h-8 text-xs" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Type</div>
                  <Input value={newTaxType} onChange={e => setNewTaxType(e.target.value)} placeholder="SST" className="h-8 text-xs" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" className="h-7 text-xs" onClick={() => setShowAddTax(false)}>Cancel</Button>
                <Button type="button" className="h-7 text-xs" onClick={handleSaveTaxRate} disabled={createTaxRate.isPending}>Save</Button>
              </div>
            </div>
          )}
          <div className="space-y-1">
            {taxRates.length === 0 && !taxRatesLoading && (
              <div className="py-4 text-center text-xs text-muted-foreground">No tax rates configured</div>
            )}
            {taxRates.map(r => (
              <div key={r.id} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-muted/50">
                <div>
                  <span className="text-sm font-medium text-foreground">{r.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{r.code}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-foreground">{Number(r.rate).toFixed(1)}%</span>
                  {r.is_active ? (
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-700">Active</span>
                  ) : (
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-muted text-muted-foreground">Inactive</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Exchange Rates */}
      <Card className="rounded-2xl border-border bg-card p-5 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
            <div className="text-sm font-semibold text-foreground">Exchange Rates</div>
            {fxLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              className="h-7 rounded-lg px-2 text-xs"
              onClick={() => syncFx.mutate(undefined, {
                onSuccess: () => toast("Exchange rates synced", "success"),
                onError: () => toast("Sync failed — only supported for MY and SG", "warning"),
              })}
              disabled={syncFx.isPending}
            >
              {syncFx.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              <span className="ml-1">Sync from {orgSettings?.country === "SG" ? "MAS" : "BNM"}</span>
            </Button>
            <Button type="button" variant="secondary" className="h-7 w-7 rounded-lg p-0" onClick={() => setShowAddFx(v => !v)}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        {showAddFx && (
          <div className="mb-4 grid grid-cols-3 gap-2 rounded-xl border border-border bg-muted/40 p-3">
            <div>
              <div className="text-xs text-muted-foreground mb-1">From</div>
              <Input value={fxFrom} onChange={e => setFxFrom(e.target.value)} placeholder="USD" className="h-8 text-xs uppercase" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">To</div>
              <Input value={fxTo} onChange={e => setFxTo(e.target.value)} placeholder="MYR" className="h-8 text-xs uppercase" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Rate</div>
              <Input type="number" value={fxRate} onChange={e => setFxRate(e.target.value)} placeholder="4.70" step="0.0001" className="h-8 text-xs" />
            </div>
            <div className="col-span-3 flex justify-end gap-2">
              <Button type="button" variant="secondary" className="h-7 text-xs" onClick={() => setShowAddFx(false)}>Cancel</Button>
              <Button type="button" className="h-7 text-xs" onClick={handleSaveFx} disabled={createFx.isPending}>Save</Button>
            </div>
          </div>
        )}
        {exchangeRates.length === 0 && !fxLoading ? (
          <div className="py-4 text-center text-xs text-muted-foreground">
            No exchange rates. Click "Sync from {orgSettings?.country === "SG" ? "MAS" : "BNM"}" to fetch live rates, or add manually.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Pair</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Rate</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Date</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Source</th>
                </tr>
              </thead>
              <tbody>
                {exchangeRates.slice(0, 20).map(r => (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2 font-medium text-foreground">{r.from_currency} → {r.to_currency}</td>
                    <td className="px-4 py-2 text-right text-foreground">{Number(r.rate).toFixed(4)}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{formatDate(r.rate_date)}</td>
                    <td className="px-4 py-2 text-right">
                      <span className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                        r.source === "bnm" ? "bg-blue-100 text-blue-700" :
                        r.source === "mas" ? "bg-purple-100 text-purple-700" :
                        "bg-muted text-muted-foreground"
                      )}>{r.source}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* e-Invoice / Compliance */}
      {(currentRegime === "MY_SST" || currentRegime === "SG_GST") && (
        <Card className="rounded-2xl border-border bg-card p-5 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-base">{currentRegime === "MY_SST" ? "🇲🇾" : "🇸🇬"}</span>
            <div className="text-sm font-semibold text-foreground">
              {currentRegime === "MY_SST" ? "MyInvois (LHDN) e-Invoice" : "IRAS GST Compliance"}
            </div>
          </div>
          {currentRegime === "MY_SST" ? (
            <div className="space-y-3">
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800">
                <strong>Malaysia MyInvois:</strong> LHDN mandates e-invoice submission for businesses above RM100M (from Aug 2024), RM25M (Jan 2025), and all businesses (Jul 2025). Configure your Supplier TIN below to enable.
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Supplier TIN</div>
                  <div className="font-medium text-foreground">{orgSettings?.einvoice_supplier_tin ?? "Not configured"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">e-Invoice Status</div>
                  <div className={`font-medium ${orgSettings?.einvoice_enabled ? "text-emerald-700" : "text-muted-foreground"}`}>
                    {orgSettings?.einvoice_enabled ? "Enabled" : "Disabled"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Environment</div>
                  <div className="font-medium text-foreground">{orgSettings?.einvoice_sandbox !== false ? "Sandbox (Preprod)" : "Production"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">SST Registration No.</div>
                  <div className="font-medium text-foreground">{orgSettings?.sst_registration_no ?? "Not configured"}</div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">To configure e-invoice credentials, contact your administrator or update via API.</div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl bg-purple-50 border border-purple-200 px-4 py-3 text-xs text-purple-800">
                <strong>Singapore IRAS GST:</strong> GST-registered businesses must file GST returns quarterly (F5/F7). Current rate is 9% (from Jan 2024). Ensure your tax rates are configured correctly.
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">GST Rate</div>
                  <div className="font-medium text-foreground">9%</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Filing Frequency</div>
                  <div className="font-medium text-foreground">Quarterly</div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">GST F5 return generation and IRAS API submission coming soon.</div>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
