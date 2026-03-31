import { useState } from "react"
import { Card } from "../../components/ui/card"
import { useToast } from "../../components/ui/toast"
import {
  useFirmDashboard,
  useInviteClient,
  useFirmInvitations,
  useArchiveFirmClient,
} from "../../lib/hooks"
import { formatCurrency } from "../../lib/utils"
import {
  Building2, Users, FileText, Archive, Mail,
  ArrowRight, Loader2, Search, TrendingUp,
  AlertCircle, Clock, Send,
} from "lucide-react"

const COUNTRY_FLAGS: Record<string, string> = {
  SG: "🇸🇬", MY: "🇲🇾", HK: "🇭🇰", US: "🇺🇸", GB: "🇬🇧", AU: "🇦🇺",
}

export default function PracticeDashboardPage() {
  const { data: dashboard, isLoading } = useFirmDashboard()
  const { data: invitations } = useFirmInvitations()
  const inviteClient = useInviteClient()
  const archiveClient = useArchiveFirmClient()
  const { toast } = useToast()

  const [search, setSearch] = useState("")
  const [showInvite, setShowInvite] = useState(false)
  const [invite, setInvite] = useState({ contact_name: "", business_name: "", email: "" })

  const handleInvite = () => {
    if (!invite.contact_name.trim() || !invite.business_name.trim() || !invite.email.trim()) return
    inviteClient.mutate(invite, {
      onSuccess: () => {
        toast("Invitation sent", "success")
        setShowInvite(false)
        setInvite({ contact_name: "", business_name: "", email: "" })
      },
      onError: (e: any) => toast(e?.response?.data?.detail || "Failed to send invitation", "warning"),
    })
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading client dashboard...
      </div>
    )
  }

  const filteredClients = (dashboard?.clients || []).filter(
    (c) => c.name.toLowerCase().includes(search.toLowerCase())
  )
  const pendingInvites = (invitations || []).filter(i => i.status === "pending")

  // Aggregate metrics
  const totalRevenue = filteredClients.reduce((s, c) => s + c.metrics.total_revenue, 0)
  const totalInvoices = filteredClients.reduce((s, c) => s + c.metrics.invoices, 0)
  const totalPendingDocs = filteredClients.reduce((s, c) => s + c.metrics.pending_documents, 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Firm</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            {dashboard?.firm_name || "Client Dashboard"}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {dashboard?.total_clients || 0} client{(dashboard?.total_clients || 0) !== 1 ? "s" : ""}
            {pendingInvites.length > 0 && (
              <span className="ml-2 text-amber-500">
                ({pendingInvites.length} pending invite{pendingInvites.length !== 1 ? "s" : ""})
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Send className="h-4 w-4" /> Invite Client
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

      {/* Pending Invitations */}
      {pendingInvites.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-2">Pending Invitations</div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {pendingInvites.map((inv) => (
              <Card key={inv.id} className="rounded-2xl border-dashed border-amber-300/50 bg-amber-50/50 dark:bg-amber-900/10 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
                    <Clock className="h-4 w-4 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{inv.business_name}</div>
                    <div className="text-xs text-muted-foreground truncate">{inv.contact_name} · {inv.email}</div>
                  </div>
                  <span className="text-[10px] text-amber-600 bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">Pending</span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

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
          <div className="mt-1 text-xs text-muted-foreground">Invite your first client to get started</div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredClients.map((client) => (
            <Card
              key={client.id}
              className="group rounded-2xl border-border bg-card p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => {}}
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

      {/* Invite Client Modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowInvite(false)}>
          <Card className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Send className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="text-lg font-semibold text-foreground">Invite Client</div>
                <div className="text-xs text-muted-foreground">Send a branded invitation email</div>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Contact Name *</label>
                <input
                  type="text"
                  value={invite.contact_name}
                  onChange={(e) => setInvite({ ...invite, contact_name: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  placeholder="John Tan"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Business Name *</label>
                <input
                  type="text"
                  value={invite.business_name}
                  onChange={(e) => setInvite({ ...invite, business_name: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  placeholder="ABC Pte Ltd"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Email Address *</label>
                <input
                  type="email"
                  value={invite.email}
                  onChange={(e) => setInvite({ ...invite, email: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  placeholder="john@abcltd.com"
                />
              </div>
            </div>
            <div className="mt-1 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              <Mail className="inline h-3 w-3 mr-1" />
              A branded invitation email will be sent to this address. The client will set their own password.
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowInvite(false)}
                className="rounded-xl px-4 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleInvite}
                disabled={!invite.contact_name.trim() || !invite.business_name.trim() || !invite.email.trim() || inviteClient.isPending}
                className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {inviteClient.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Send Invitation
              </button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
