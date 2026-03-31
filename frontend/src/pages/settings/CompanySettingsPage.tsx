import { useState, useEffect } from "react"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"
import { useToast } from "../../components/ui/toast"
import api from "../../lib/api"

type Tab = "general" | "tax" | "currencies" | "number_formats" | "payment_terms" | "payment_methods" | "locations" | "tags"

const TABS: { value: Tab; label: string }[] = [
  { value: "general", label: "General" },
  { value: "tax", label: "Tax" },
  { value: "currencies", label: "Currencies" },
  { value: "number_formats", label: "Number Formats" },
  { value: "payment_terms", label: "Payment Terms" },
  { value: "payment_methods", label: "Payment Methods" },
  { value: "locations", label: "Locations" },
  { value: "tags", label: "Tags" },
]

const COUNTRIES = ["MY", "SG", "AU", "US", "UK", "HK"]
const CURRENCIES = ["MYR", "SGD", "USD", "AUD", "HKD", "EUR", "GBP"]
const TAX_REGIMES = [
  { value: "MY_SST", label: "Malaysia SST" },
  { value: "SG_GST", label: "Singapore GST" },
  { value: "AU_GST", label: "Australia GST" },
  { value: "EU_VAT", label: "EU VAT" },
  { value: "NONE", label: "No Tax" },
]

interface Organization {
  id: string
  name: string
  uen: string | null
  sst_registration_no: string | null
  address: string | null
  country: string
  currency: string
  tax_regime: string
  fiscal_year_start: string | null
  einvoice_enabled: boolean
  einvoice_supplier_tin: string | null
}

interface SimpleItem {
  id: string
  name: string
  [key: string]: unknown
}

interface TagItem {
  id: string
  name: string
  color: string | null
}

// Generic list tab component
function SimpleListTab({
  endpoint,
  queryKey,
  label,
  nameField = "name",
  placeholder,
  extraFields,
}: {
  endpoint: string
  queryKey: string
  label: string
  nameField?: string
  placeholder?: string
  extraFields?: { key: string; label: string; placeholder: string }[]
}) {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [newValues, setNewValues] = useState<Record<string, string>>({ [nameField]: "" })

  const { data: items = [], isLoading } = useQuery<SimpleItem[]>({
    queryKey: [queryKey],
    queryFn: () => api.get(endpoint).then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (data: Record<string, string>) => api.post(endpoint, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [queryKey] })
      setShowAdd(false)
      setNewValues({ [nameField]: "" })
      toast(`${label} added`, "success")
    },
    onError: () => toast(`Failed to add ${label.toLowerCase()}`, "warning"),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`${endpoint}/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [queryKey] }); toast(`${label} removed`, "success") },
    onError: () => toast(`Failed to remove ${label.toLowerCase()}`, "warning"),
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-foreground">{label}s</div>
        <Button type="button" variant="secondary" className="h-7 w-7 rounded-lg p-0" onClick={() => setShowAdd(v => !v)}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {showAdd && (
        <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-2">
          <div className={`grid gap-2 ${extraFields ? `grid-cols-${Math.min(extraFields.length + 1, 3)}` : "grid-cols-1"}`}>
            <div>
              <div className="text-xs text-muted-foreground mb-1">{label} Name</div>
              <Input
                className="h-8 text-xs"
                placeholder={placeholder ?? `Enter ${label.toLowerCase()} name`}
                value={newValues[nameField] ?? ""}
                onChange={e => setNewValues(p => ({ ...p, [nameField]: e.target.value }))}
              />
            </div>
            {extraFields?.map(f => (
              <div key={f.key}>
                <div className="text-xs text-muted-foreground mb-1">{f.label}</div>
                <Input
                  className="h-8 text-xs"
                  placeholder={f.placeholder}
                  value={newValues[f.key] ?? ""}
                  onChange={e => setNewValues(p => ({ ...p, [f.key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" className="h-7 text-xs" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button
              type="button"
              className="h-7 text-xs bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] text-white"
              disabled={createMutation.isPending || !newValues[nameField]?.trim()}
              onClick={() => createMutation.mutate(newValues)}
            >
              {createMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="py-6 text-center text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline" /></div>
      ) : items.length === 0 ? (
        <div className="py-6 text-center text-xs text-muted-foreground">No {label.toLowerCase()}s configured</div>
      ) : (
        <div className="space-y-1">
          {items.map(item => (
            <div key={item.id} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-muted/50">
              <span className="text-sm text-foreground">{String(item[nameField])}</span>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-rose-500" onClick={() => deleteMutation.mutate(item.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Tags tab
function TagsTab() {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState("")
  const [newColor, setNewColor] = useState("#6366F1")

  const { data: tags = [], isLoading } = useQuery<TagItem[]>({
    queryKey: ["settings-tags"],
    queryFn: () => api.get("/settings-data/tags").then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (data: { name: string; color: string }) => api.post("/settings-data/tags", data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings-tags"] })
      setShowAdd(false); setNewName(""); setNewColor("#6366F1")
      toast("Tag added", "success")
    },
    onError: () => toast("Failed to add tag", "warning"),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/settings-data/tags/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["settings-tags"] }); toast("Tag removed", "success") },
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-foreground">Tags</div>
        <Button type="button" variant="secondary" className="h-7 w-7 rounded-lg p-0" onClick={() => setShowAdd(v => !v)}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      {showAdd && (
        <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <div className="text-xs text-muted-foreground mb-1">Tag Name</div>
              <Input className="h-8 text-xs" placeholder="e.g. Priority" value={newName} onChange={e => setNewName(e.target.value)} />
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Colour</div>
              <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} className="h-8 w-full rounded-md border border-input cursor-pointer" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" className="h-7 text-xs" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button type="button" className="h-7 text-xs bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] text-white" disabled={createMutation.isPending || !newName.trim()} onClick={() => createMutation.mutate({ name: newName.trim(), color: newColor })}>
              {createMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
            </Button>
          </div>
        </div>
      )}
      {isLoading ? (
        <div className="py-6 text-center text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline" /></div>
      ) : tags.length === 0 ? (
        <div className="py-6 text-center text-xs text-muted-foreground">No tags configured</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.map(tag => (
            <div key={tag.id} className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color ?? "#6366F1" }} />
              <span className="text-xs font-medium text-foreground">{tag.name}</span>
              <button type="button" onClick={() => deleteMutation.mutate(tag.id)} className="ml-1 text-muted-foreground hover:text-rose-500">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function CompanySettingsPage() {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<Tab>("general")

  const { data: org, isLoading: orgLoading } = useQuery<Organization>({
    queryKey: ["organization"],
    queryFn: () => api.get("/auth/organizations").then(r => Array.isArray(r.data) ? r.data[0] : r.data),
  })

  const [form, setForm] = useState({
    name: "",
    uen: "",
    sst_registration_no: "",
    address: "",
    country: "MY",
    currency: "MYR",
    tax_regime: "MY_SST",
    fiscal_year_start: "01-01",
  })

  useEffect(() => {
    if (org) {
      setForm({
        name: org.name ?? "",
        uen: org.uen ?? "",
        sst_registration_no: org.sst_registration_no ?? "",
        address: org.address ?? "",
        country: org.country ?? "MY",
        currency: org.currency ?? "MYR",
        tax_regime: org.tax_regime ?? "MY_SST",
        fiscal_year_start: "01-01",
      })
    }
  }, [org])

  const updateMutation = useMutation({
    mutationFn: (data: typeof form) => api.patch(`/auth/organizations/${org?.id}`, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["organization"] })
      toast("Settings saved", "success")
    },
    onError: () => toast("Failed to save settings", "warning"),
  })

  const { data: currencies = [] } = useQuery<{ code: string; name: string; rate: number }[]>({
    queryKey: ["settings-currencies"],
    queryFn: () => api.get("/settings-data").then(r => r.data?.currencies ?? []),
    enabled: activeTab === "currencies",
  })

  const setField = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }))

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Settings</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Company Settings</div>
        <div className="mt-1 text-sm text-muted-foreground">Settings for your company</div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap">
        {TABS.map(tab => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActiveTab(tab.value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${activeTab === tab.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Card className="rounded-2xl border-border bg-card p-5 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
        {orgLoading && activeTab === "general" ? (
          <div className="py-8 text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline" /></div>
        ) : (
          <>
            {activeTab === "general" && (
              <div className="space-y-4">
                <div className="text-sm font-semibold text-foreground">General Information</div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Company Name</label>
                    <Input className="h-9 text-sm" value={form.name} onChange={setField("name")} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">UEN / Registration No.</label>
                    <Input className="h-9 text-sm" placeholder="e.g. 202012345K" value={form.uen} onChange={setField("uen")} />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Business Address</label>
                    <Input className="h-9 text-sm" placeholder="Full address" value={form.address} onChange={setField("address")} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Country</label>
                    <Select value={form.country} onValueChange={v => setForm(p => ({ ...p, country: v }))}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {COUNTRIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Default Currency</label>
                    <Select value={form.currency} onValueChange={v => setForm(p => ({ ...p, currency: v }))}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Fiscal Year Start (MM-DD)</label>
                    <Input className="h-9 text-sm" placeholder="01-01" value={form.fiscal_year_start} onChange={setField("fiscal_year_start")} />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    className="h-9 bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-4 text-sm text-white"
                    onClick={() => updateMutation.mutate(form)}
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                    Save Changes
                  </Button>
                </div>
              </div>
            )}

            {activeTab === "tax" && (
              <div className="space-y-4">
                <div className="text-sm font-semibold text-foreground">Tax Settings</div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Tax Regime</label>
                    <Select value={form.tax_regime} onValueChange={v => setForm(p => ({ ...p, tax_regime: v }))}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TAX_REGIMES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">SST Registration No.</label>
                    <Input className="h-9 text-sm" placeholder="e.g. W10-1234-56789012" value={form.sst_registration_no} onChange={setField("sst_registration_no")} />
                  </div>
                </div>
                <div className="rounded-xl bg-muted/40 border border-border p-4">
                  <div className="text-xs text-muted-foreground">
                    The tax regime controls which tax rates and reporting formats are used throughout the system. Changing tax regime may affect existing transactions. Contact support for assistance.
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    className="h-9 bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] px-4 text-sm text-white"
                    onClick={() => updateMutation.mutate(form)}
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                    Save Changes
                  </Button>
                </div>
              </div>
            )}

            {activeTab === "currencies" && (
              <div className="space-y-4">
                <div className="text-sm font-semibold text-foreground">Active Currencies</div>
                {currencies.length === 0 ? (
                  <div className="py-6 text-center text-xs text-muted-foreground">No currencies configured. Go to Settings to set up exchange rates.</div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/40">
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Code</th>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Name</th>
                          <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Exchange Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currencies.map((c) => (
                          <tr key={c.code} className="border-b border-border last:border-0">
                            <td className="px-4 py-2.5 text-sm font-mono font-medium text-foreground">{c.code}</td>
                            <td className="px-4 py-2.5 text-sm text-foreground">{c.name}</td>
                            <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{c.rate?.toFixed(4) ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="text-xs text-muted-foreground">
                  Manage exchange rates in the main Settings page under Exchange Rates.
                </div>
              </div>
            )}

            {activeTab === "number_formats" && (
              <div className="space-y-4">
                <div className="text-sm font-semibold text-foreground">Number Formats</div>
                <div className="overflow-hidden rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Document Type</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Format</th>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Example</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { type: "Invoice", format: "INV-{YYYY}-{NNNN}", example: "INV-2026-0001" },
                        { type: "Quotation", format: "QT-{YYYY}-{NNNN}", example: "QT-2026-0001" },
                        { type: "Bill", format: "BILL-{YYYY}-{NNNN}", example: "BILL-2026-0001" },
                        { type: "Purchase Order", format: "PO-{YYYY}-{NNNN}", example: "PO-2026-0001" },
                        { type: "Payment", format: "PAY-{YYYY}-{NNNN}", example: "PAY-2026-0001" },
                        { type: "Credit Note", format: "CN-{YYYY}-{NNNN}", example: "CN-2026-0001" },
                      ].map(row => (
                        <tr key={row.type} className="border-b border-border last:border-0">
                          <td className="px-4 py-2.5 text-sm font-medium text-foreground">{row.type}</td>
                          <td className="px-4 py-2.5 text-sm font-mono text-muted-foreground">{row.format}</td>
                          <td className="px-4 py-2.5 text-sm text-muted-foreground">{row.example}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="text-xs text-muted-foreground">
                  Number formats are automatically incremented. Contact support to customise the prefix or reset the sequence.
                </div>
              </div>
            )}

            {activeTab === "payment_terms" && (
              <SimpleListTab
                endpoint="/settings-data/payment-terms"
                queryKey="settings-payment-terms"
                label="Payment Term"
                placeholder="e.g. Net 30"
              />
            )}

            {activeTab === "payment_methods" && (
              <SimpleListTab
                endpoint="/settings-data/payment-methods"
                queryKey="settings-payment-methods"
                label="Payment Method"
                placeholder="e.g. Bank Transfer"
              />
            )}

            {activeTab === "locations" && (
              <SimpleListTab
                endpoint="/settings-data/locations"
                queryKey="settings-locations"
                label="Location"
                placeholder="e.g. Main Warehouse"
              />
            )}

            {activeTab === "tags" && <TagsTab />}
          </>
        )}
      </Card>
    </div>
  )
}
