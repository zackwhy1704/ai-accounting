import { useState } from "react"
import { Card } from "../../components/ui/card"
import { useToast } from "../../components/ui/toast"
import {
  useFirmDashboard,
  useFirmClients,
  useCreateFirmClient,
  useArchiveFirmClient,
  useRestoreFirmClient,
  useSwitchOrg,
} from "../../lib/hooks"
import { formatCurrency } from "../../lib/utils"
import {
  Building2, Users, FileText, Receipt, FolderOpen, Plus, Archive,
  RotateCcw, ArrowRight, Loader2, Search, Globe, TrendingUp,
  AlertCircle,
} from "lucide-react"
import { cn } from "../../lib/utils"

const COUNTRY_FLAGS: Record<string, string> = {
  SG: "🇸🇬", MY: "🇲🇾", HK: "🇭🇰", US: "🇺🇸", GB: "🇬🇧", AU: "🇦🇺",
}

export default function PracticeDashboardPage() {
  const { data: dashboard, isLoading } = useFirmDashboard()
  const { data: clients } = useFirmClients()
  const createClient = useCreateFirmClient()
  const archiveClient = useArchiveFirmClient()
  const restoreClient = useRestoreFirmClient()
  const switchOrg = useSwitchOrg()
  const { toast } = useToast()

  const [search, setSearch] = useState("")
  const [showCreate, setShowCreate] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [newClient, setNewClient] = useState({ name: "", org_type: "sme", country: "SG", currency: "SGD", industry: "" })

  const handleCreate = () => {
    if (!newClient.name.trim()) return
    createClient.mutate(
      { ...newClient, industry: newClient.industry || undefined },
      {
        onSuccess: () => {
          toast("Client created", "success")
          setShowCreate(false)
          setNewClient({ name: "", org_type: "sme", country: "SG", currency: "SGD", industry: "" })
        },
        onError: (e: any) => toast(e?.response?.data?.detail || "Failed to create client", "warning"),
      }
    )
  }

  const handleSwitch = (orgId: string) => {
    switchOrg.mutate(orgId, {
      onSuccess: () => {
        window.location.href = "/dashboard"
      },
      onError: () => toast("Failed to switch", "warning"),
    })
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading practice dashboard...
      </div>
    )
  }

  const filteredClients = (dashboard?.clients || []).filter(
    (c) => c.name.toLowerCase().includes(search.toLowerCase())
  )

  // Aggregate metrics
  const totalRevenue = filteredClients.reduce((s, c) => s + c.metrics.total_revenue, 0)
  const totalExpenses = filteredClients.reduce((s, c) => s + c.metrics.total_expenses, 0)
  const totalInvoices = filteredClients.reduce((s, c) => s + c.metrics.invoices, 0)
  const totalPendingDocs = filteredClients.reduce((s, c) => s + c.metrics.pending_documents, 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Practice</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            {dashboard?.firm_name || "Practice Dashboard"}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {dashboard?.total_clients || 0} client{(dashboard?.total_clients || 0) !== 1 ? "s" : ""}
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" /> Add Client
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="rounded-2xl border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Building2 className="h-3.5 w-3.5" /> Total Clients
          </div>
          <div className="mt-1 text-xl font-semibold">{dashboard?.total_clients || 0}</div>
        </Card>
        <Card className="rounded-2xl border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" /> Total Revenue
          </div>
          <div className="mt-1 text-xl font-semibold">{formatCurrency(totalRevenue, "SGD")}</div>
        </Card>
        <Card className="rounded-2xl border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <FileText className="h-3.5 w-3.5" /> Total Invoices
          </div>
          <div className="mt-1 text-xl font-semibold">{totalInvoices}</div>
        </Card>
        <Card className="rounded-2xl border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <AlertCircle className="h-3.5 w-3.5" /> Pending Docs
          </div>
          <div className="mt-1 text-xl font-semibold">{totalPendingDocs}</div>
        </Card>
      </div>

      {/* Search & Filter */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients..."
            className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-2.5 text-sm"
          />
        </div>
      </div>

      {/* Client Cards Grid */}
      {filteredClients.length === 0 ? (
        <Card className="rounded-2xl border-border bg-card p-8 text-center shadow-sm">
          <Building2 className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <div className="mt-3 text-sm font-medium text-foreground">No clients yet</div>
          <div className="mt-1 text-xs text-muted-foreground">Add your first client to get started</div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredClients.map((client) => (
            <Card
              key={client.id}
              className="group rounded-2xl border-border bg-card p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => handleSwitch(client.id)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary font-semibold text-sm">
                    {client.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">{client.name}</div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span>{COUNTRY_FLAGS[client.country] || "🌍"}</span>
                      <span>{client.org_type.toUpperCase()}</span>
                      {client.industry && <span>· {client.industry}</span>}
                    </div>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-muted/50 px-2.5 py-1.5">
                  <div className="text-[10px] text-muted-foreground">Revenue</div>
                  <div className="text-xs font-semibold">{formatCurrency(client.metrics.total_revenue, client.currency)}</div>
                </div>
                <div className="rounded-lg bg-muted/50 px-2.5 py-1.5">
                  <div className="text-[10px] text-muted-foreground">Invoices</div>
                  <div className="text-xs font-semibold">{client.metrics.invoices}</div>
                </div>
                <div className="rounded-lg bg-muted/50 px-2.5 py-1.5">
                  <div className="text-[10px] text-muted-foreground">Docs</div>
                  <div className="text-xs font-semibold">
                    {client.metrics.documents}
                    {client.metrics.pending_documents > 0 && (
                      <span className="ml-1 text-amber-500">({client.metrics.pending_documents})</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between">
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Users className="h-3 w-3" /> {client.metrics.users} user{client.metrics.users !== 1 ? "s" : ""}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    archiveClient.mutate(client.id, {
                      onSuccess: () => toast(`${client.name} archived`, "success"),
                    })
                  }}
                  className="text-[10px] text-muted-foreground hover:text-red-500 transition-colors"
                >
                  <Archive className="h-3 w-3" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create Client Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowCreate(false)}>
          <Card className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-lg font-semibold text-foreground mb-4">Add Client Organisation</div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Company Name *</label>
                <input
                  type="text"
                  value={newClient.name}
                  onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  placeholder="ABC Pte Ltd"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Type</label>
                  <select
                    value={newClient.org_type}
                    onChange={(e) => setNewClient({ ...newClient, org_type: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    <option value="sme">SME</option>
                    <option value="individual">Individual</option>
                    <option value="freelancer">Freelancer</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Country</label>
                  <select
                    value={newClient.country}
                    onChange={(e) => setNewClient({ ...newClient, country: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    <option value="SG">Singapore</option>
                    <option value="MY">Malaysia</option>
                    <option value="HK">Hong Kong</option>
                    <option value="US">United States</option>
                    <option value="GB">United Kingdom</option>
                    <option value="AU">Australia</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Currency</label>
                  <select
                    value={newClient.currency}
                    onChange={(e) => setNewClient({ ...newClient, currency: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    <option value="SGD">SGD</option>
                    <option value="MYR">MYR</option>
                    <option value="HKD">HKD</option>
                    <option value="USD">USD</option>
                    <option value="GBP">GBP</option>
                    <option value="AUD">AUD</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Industry</label>
                  <input
                    type="text"
                    value={newClient.industry}
                    onChange={(e) => setNewClient({ ...newClient, industry: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    placeholder="e.g. Technology"
                  />
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-xl px-4 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newClient.name.trim() || createClient.isPending}
                className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {createClient.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Create
              </button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
