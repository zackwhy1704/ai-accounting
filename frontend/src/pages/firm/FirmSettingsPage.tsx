import { useState, useRef, useEffect } from "react"
import { Card } from "../../components/ui/card"
import { useToast } from "../../components/ui/toast"
import {
  useFirmSettings,
  useUpdateFirmSettings,
  useUploadFirmLogo,
  useUploadFirmFavicon,
  useCheckSlug,
} from "../../lib/hooks"
import {
  Building2, Upload, Globe, Palette, Link2, Mail, Phone,
  Check, X, Loader2, ExternalLink, Eye,
} from "lucide-react"
import { cn } from "../../lib/utils"

export default function FirmSettingsPage() {
  const { data: settings, isLoading } = useFirmSettings()
  const updateSettings = useUpdateFirmSettings()
  const uploadLogo = useUploadFirmLogo()
  const uploadFavicon = useUploadFirmFavicon()
  const { toast } = useToast()
  const logoRef = useRef<HTMLInputElement>(null)
  const faviconRef = useRef<HTMLInputElement>(null)

  const [slug, setSlug] = useState("")
  const [debouncedSlug, setDebouncedSlug] = useState("")
  const [primaryColor, setPrimaryColor] = useState("#4D63FF")
  const [secondaryColor, setSecondaryColor] = useState("#7C9DFF")
  const [portalEnabled, setPortalEnabled] = useState(false)
  const [description, setDescription] = useState("")
  const [contactEmail, setContactEmail] = useState("")
  const [website, setWebsite] = useState("")
  const [supportEmail, setSupportEmail] = useState("")
  const [customDomain, setCustomDomain] = useState("")

  // Sync state from server
  useEffect(() => {
    if (settings) {
      setSlug(settings.slug || "")
      setDebouncedSlug(settings.slug || "")
      setPrimaryColor(settings.brand_primary_color || "#4D63FF")
      setSecondaryColor(settings.brand_secondary_color || "#7C9DFF")
      setPortalEnabled(settings.client_portal_enabled)
      setDescription(settings.firm_description || "")
      setContactEmail(settings.firm_contact_email || "")
      setWebsite(settings.firm_website || "")
      setSupportEmail(settings.firm_support_email || "")
      setCustomDomain(settings.custom_domain || "")
    }
  }, [settings])

  // Debounce slug check
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSlug(slug), 500)
    return () => clearTimeout(timer)
  }, [slug])

  const { data: slugCheck } = useCheckSlug(debouncedSlug)

  const handleSave = () => {
    updateSettings.mutate(
      {
        slug: slug || null,
        brand_primary_color: primaryColor,
        brand_secondary_color: secondaryColor,
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

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    uploadLogo.mutate(file, {
      onSuccess: () => toast("Logo uploaded", "success"),
      onError: () => toast("Failed to upload logo", "warning"),
    })
  }

  const handleFaviconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    uploadFavicon.mutate(file, {
      onSuccess: () => toast("Favicon uploaded", "success"),
      onError: () => toast("Failed to upload favicon", "warning"),
    })
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading firm settings...
      </div>
    )
  }

  const slugAvailable = debouncedSlug.length >= 3 && slugCheck?.available === true
  const slugTaken = debouncedSlug.length >= 3 && slugCheck?.available === false && debouncedSlug !== settings?.slug

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-xs text-muted-foreground">Firm</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">White-Label Settings</div>
        <div className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Customize your client portal branding and firm profile
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Logo & Favicon */}
        <Card className="rounded-2xl border-border bg-card p-5 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <div className="text-sm font-semibold text-foreground">Logo & Favicon</div>
          </div>

          <div className="flex gap-6">
            {/* Logo */}
            <div className="flex flex-col items-center gap-2">
              <div
                className="flex h-20 w-20 items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/50 cursor-pointer hover:border-primary/50 transition-colors overflow-hidden"
                onClick={() => logoRef.current?.click()}
              >
                {settings?.logo_url ? (
                  <img src={settings.logo_url} alt="Logo" className="h-full w-full object-contain" />
                ) : (
                  <Upload className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <span className="text-xs text-muted-foreground">Logo</span>
              <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            </div>

            {/* Favicon */}
            <div className="flex flex-col items-center gap-2">
              <div
                className="flex h-20 w-20 items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/50 cursor-pointer hover:border-primary/50 transition-colors overflow-hidden"
                onClick={() => faviconRef.current?.click()}
              >
                {settings?.favicon_url ? (
                  <img src={settings.favicon_url} alt="Favicon" className="h-full w-full object-contain" />
                ) : (
                  <Upload className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <span className="text-xs text-muted-foreground">Favicon</span>
              <input ref={faviconRef} type="file" accept="image/*,.ico" className="hidden" onChange={handleFaviconUpload} />
            </div>
          </div>

          {(uploadLogo.isPending || uploadFavicon.isPending) && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Uploading...
            </div>
          )}
        </Card>

        {/* Brand Colors */}
        <Card className="rounded-2xl border-border bg-card p-5 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
          <div className="flex items-center gap-2 mb-4">
            <Palette className="h-4 w-4 text-muted-foreground" />
            <div className="text-sm font-semibold text-foreground">Brand Colors</div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Primary Color</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-9 w-9 cursor-pointer rounded border-0 bg-transparent"
                />
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  placeholder="#4D63FF"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Secondary Color</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="h-9 w-9 cursor-pointer rounded border-0 bg-transparent"
                />
                <input
                  type="text"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  placeholder="#7C9DFF"
                />
              </div>
            </div>

            {/* Preview */}
            <div className="mt-3 rounded-xl p-4" style={{ background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` }}>
              <div className="text-sm font-semibold text-white">{settings?.name || "Your Firm"}</div>
              <div className="text-xs text-white/70 mt-0.5">Brand preview</div>
            </div>
          </div>
        </Card>

        {/* Portal Slug & Domain */}
        <Card className="rounded-2xl border-border bg-card p-5 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
          <div className="flex items-center gap-2 mb-4">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <div className="text-sm font-semibold text-foreground">Portal URL</div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Portal Slug</label>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">accruly.io/p/</span>
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm pr-8"
                    placeholder="your-firm-name"
                  />
                  {slug.length >= 3 && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2">
                      {slugAvailable && <Check className="h-4 w-4 text-green-500" />}
                      {slugTaken && <X className="h-4 w-4 text-red-500" />}
                    </span>
                  )}
                </div>
              </div>
              {slugTaken && (
                <p className="mt-1 text-xs text-red-500">This slug is already taken</p>
              )}
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Custom Domain (optional)</label>
              <input
                type="text"
                value={customDomain}
                onChange={(e) => setCustomDomain(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                placeholder="app.yourfirm.com"
              />
            </div>

            <div className="flex items-center justify-between rounded-xl bg-muted/50 px-4 py-3">
              <span className="text-sm text-foreground">Enable Client Portal</span>
              <button
                type="button"
                onClick={() => setPortalEnabled(!portalEnabled)}
                className={cn(
                  "relative h-6 w-11 rounded-full transition-colors",
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
                className="flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                <Eye className="h-3 w-3" /> Preview portal
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </Card>

        {/* Firm Profile */}
        <Card className="rounded-2xl border-border bg-card p-5 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_18px_55px_rgba(2,6,23,0.08)]">
          <div className="flex items-center gap-2 mb-4">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <div className="text-sm font-semibold text-foreground">Firm Profile</div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none"
                placeholder="Tell clients about your firm..."
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Contact Email</label>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                placeholder="hello@yourfirm.com"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Website</label>
              <input
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                placeholder="https://yourfirm.com"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Support Email</label>
              <input
                type="email"
                value={supportEmail}
                onChange={(e) => setSupportEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                placeholder="support@yourfirm.com"
              />
            </div>
          </div>
        </Card>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={updateSettings.isPending || (slugTaken ?? false)}
          className="flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {updateSettings.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save Settings
        </button>
      </div>
    </div>
  )
}
