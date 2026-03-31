import { useState, useRef, useEffect } from "react"
import { Card } from "../../components/ui/card"
import { useToast } from "../../components/ui/toast"
import {
  useFirmSettings,
  useUpdateFirmSettings,
  useUploadFirmLogo,
  useCheckSlug,
} from "../../lib/hooks"
import {
  Building2, Upload, Globe, Mail,
  Check, X, Loader2, ExternalLink, Eye, Trash2,
} from "lucide-react"
import { cn } from "../../lib/utils"

export default function FirmSettingsPage() {
  const { data: settings, isLoading } = useFirmSettings()
  const updateSettings = useUpdateFirmSettings()
  const uploadLogo = useUploadFirmLogo()
  const { toast } = useToast()
  const logoRef = useRef<HTMLInputElement>(null)

  const [slug, setSlug] = useState("")
  const [debouncedSlug, setDebouncedSlug] = useState("")
  const [portalEnabled, setPortalEnabled] = useState(false)
  const [description, setDescription] = useState("")
  const [contactEmail, setContactEmail] = useState("")
  const [website, setWebsite] = useState("")
  const [supportEmail, setSupportEmail] = useState("")
  const [customDomain, setCustomDomain] = useState("")

  useEffect(() => {
    if (settings) {
      setSlug(settings.slug || "")
      setDebouncedSlug(settings.slug || "")
      setPortalEnabled(settings.client_portal_enabled)
      setDescription(settings.firm_description || "")
      setContactEmail(settings.firm_contact_email || "")
      setWebsite(settings.firm_website || "")
      setSupportEmail(settings.firm_support_email || "")
      setCustomDomain(settings.custom_domain || "")
    }
  }, [settings])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSlug(slug), 500)
    return () => clearTimeout(timer)
  }, [slug])

  const { data: slugCheck } = useCheckSlug(debouncedSlug)

  const slugAvailable = debouncedSlug.length >= 3 && slugCheck?.available === true
  const slugTaken = debouncedSlug.length >= 3 && slugCheck?.available === false && debouncedSlug !== settings?.slug

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    uploadLogo.mutate(file, {
      onSuccess: () => toast("Logo uploaded", "success"),
      onError: () => toast("Failed to upload logo", "warning"),
    })
    // reset so same file can be re-selected
    e.target.value = ""
  }

  const handleSave = () => {
    updateSettings.mutate(
      {
        slug: slug || null,
        client_portal_enabled: portalEnabled,
        firm_description: description || null,
        firm_contact_email: contactEmail || null,
        firm_website: website || null,
        firm_support_email: supportEmail || null,
        custom_domain: customDomain || null,
      },
      {
        onSuccess: () => toast("Settings saved", "success"),
        onError: (e: any) => toast(e?.response?.data?.detail || "Failed to save", "warning"),
      }
    )
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading settings...
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl flex flex-col gap-5">
      <div>
        <div className="text-xs text-muted-foreground">Settings</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Company Branding</div>
        <div className="mt-1 text-sm text-muted-foreground">
          Customise how your business appears to clients
        </div>
      </div>

      {/* Logo */}
      <Card className="rounded-2xl border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-5">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm font-semibold text-foreground">Company Logo</div>
        </div>

        <div className="flex items-start gap-6">
          {/* Preview box */}
          <div
            className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/40 cursor-pointer hover:border-primary/60 transition-colors overflow-hidden"
            onClick={() => logoRef.current?.click()}
          >
            {settings?.logo_url ? (
              <img src={settings.logo_url} alt="Company logo" className="h-full w-full object-contain p-1" />
            ) : (
              <div className="flex flex-col items-center gap-1 text-muted-foreground">
                <Upload className="h-6 w-6" />
                <span className="text-[11px]">Upload</span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => logoRef.current?.click()}
              disabled={uploadLogo.isPending}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
            >
              {uploadLogo.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {uploadLogo.isPending ? "Uploading…" : "Upload Logo"}
            </button>
            <p className="text-xs text-muted-foreground">
              JPEG, PNG, WebP or SVG · Max 2 MB
            </p>
            {settings?.logo_url && (
              <button
                type="button"
                onClick={() =>
                  updateSettings.mutate({ slug: settings.slug || null }, {
                    onSuccess: () => toast("Logo removed", "success"),
                  })
                }
                className="inline-flex items-center gap-1.5 text-xs text-destructive hover:underline w-fit"
              >
                <Trash2 className="h-3 w-3" /> Remove logo
              </button>
            )}
          </div>
        </div>
        <input ref={logoRef} type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml" className="hidden" onChange={handleLogoUpload} />
      </Card>

      {/* Portal URL */}
      <Card className="rounded-2xl border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-5">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm font-semibold text-foreground">Client Portal</div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Portal Slug</label>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">accruly.io/p/</span>
              <div className="relative flex-1">
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm pr-8 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="your-company-name"
                />
                {slug.length >= 3 && (
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
                    {slugAvailable && <Check className="h-4 w-4 text-green-500" />}
                    {slugTaken && <X className="h-4 w-4 text-red-500" />}
                  </span>
                )}
              </div>
            </div>
            {slugTaken && <p className="mt-1 text-xs text-red-500">This slug is already taken</p>}
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Custom Domain <span className="text-muted-foreground/60">(optional)</span></label>
            <input
              type="text"
              value={customDomain}
              onChange={(e) => setCustomDomain(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="portal.yourcompany.com"
            />
          </div>

          <div className="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-3">
            <div>
              <div className="text-sm font-medium text-foreground">Enable Client Portal</div>
              <div className="text-xs text-muted-foreground mt-0.5">Allow clients to access their portal via your slug URL</div>
            </div>
            <button
              type="button"
              onClick={() => setPortalEnabled(!portalEnabled)}
              className={cn(
                "relative h-6 w-11 rounded-full transition-colors shrink-0",
                portalEnabled ? "bg-primary" : "bg-border"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform shadow-sm",
                  portalEnabled && "translate-x-5"
                )}
              />
            </button>
          </div>

          {settings?.portal_url && portalEnabled && (
            <a
              href={settings.portal_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <Eye className="h-3 w-3" /> Preview portal
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </Card>

      {/* Firm Profile */}
      <Card className="rounded-2xl border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-5">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm font-semibold text-foreground">Company Profile</div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Tell clients about your business…"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Contact Email</label>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="hello@yourcompany.com"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Support Email</label>
              <input
                type="email"
                value={supportEmail}
                onChange={(e) => setSupportEmail(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="support@yourcompany.com"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Website</label>
            <input
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="https://yourcompany.com"
            />
          </div>
        </div>
      </Card>

      {/* Save */}
      <div className="flex justify-end pb-4">
        <button
          onClick={handleSave}
          disabled={updateSettings.isPending || (slugTaken ?? false)}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {updateSettings.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save Settings
        </button>
      </div>
    </div>
  )
}
