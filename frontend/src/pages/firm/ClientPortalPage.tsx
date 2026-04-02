import { useState, useRef } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery, useMutation } from "@tanstack/react-query"
import axios from "axios"
import {
  Upload, Loader2, CheckCircle, FileText, LogIn,
  UserPlus, Mail, Lock, User, Phone, ArrowRight,
  Building2, Link2, Shield, FolderOpen, AlertCircle,
} from "lucide-react"
import type { PortalInfo } from "../../types"

const API_BASE = import.meta.env.VITE_API_URL || "/api/v1"

type Mode = "signup" | "login" | "link" | "link-success" | "signup-success"

export default function ClientPortalPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>("signup")
  const [form, setForm] = useState({
    email: "", password: "", full_name: "", company_name: "", phone: "",
  })
  const [error, setError] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([])

  const { data: portal, isLoading, isError } = useQuery<PortalInfo>({
    queryKey: ["portal", slug],
    queryFn: () => axios.get(`${API_BASE}/firm/portal/${slug}`).then((r) => r.data),
    enabled: !!slug,
  })

  // New account signup → Type 1 (firm has full admin access, no billing)
  const signup = useMutation({
    mutationFn: (data: typeof form) =>
      axios.post(`${API_BASE}/firm/portal/${slug}/signup`, data).then((r) => r.data),
    onSuccess: (data) => {
      localStorage.setItem("access_token", data.access_token)
      setMode("signup-success")
    },
    onError: (e: any) => {
      const detail: string = e?.response?.data?.detail || ""
      setError(detail || "Signup failed. Please try again.")
    },
  })

  // Existing user links their account → Type 1 (firm gets full admin access)
  const linkAccount = useMutation({
    mutationFn: (data: { email: string; password: string }) =>
      axios.post(`${API_BASE}/firm/portal/${slug}/login`, data).then((r) => r.data),
    onSuccess: (data) => {
      localStorage.setItem("access_token", data.access_token)
      setMode("link-success")
    },
    onError: (e: any) => {
      const status = e?.response?.status
      if (status === 401) {
        setError("Incorrect email or password.")
      } else {
        setError(e?.response?.data?.detail || "Authentication failed. Please try again.")
      }
    },
  })

  const handleSignup = (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (!form.email || !form.password || !form.full_name || !form.company_name) {
      setError("Please fill in all required fields")
      return
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters")
      return
    }
    signup.mutate(form)
  }

  const handleLink = (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (!form.email || !form.password) {
      setError("Please enter your email and password")
      return
    }
    linkAccount.mutate({ email: form.email, password: form.password })
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return
    const token = localStorage.getItem("access_token")
    if (!token) return
    setUploading(true)
    for (const file of Array.from(files)) {
      try {
        const formData = new FormData()
        formData.append("file", file)
        await axios.post(`${API_BASE}/documents`, formData, {
          headers: { Authorization: `Bearer ${token}` },
        })
        setUploadedFiles((prev) => [...prev, file.name])
      } catch {
        // silently skip
      }
    }
    setUploading(false)
  }

  const switchMode = (m: Mode) => {
    setMode(m)
    setError("")
  }

  const firmName = portal?.firm_name ?? "Your Accountant"

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    )
  }

  if (isError || !portal) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
        <Building2 className="h-12 w-12 text-slate-300" />
        <div className="mt-4 text-lg font-semibold text-slate-700">Portal Not Found</div>
        <div className="mt-1 text-sm text-slate-500">This firm portal doesn't exist or is not active.</div>
      </div>
    )
  }

  const inputClass =
    "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors"
  const labelClass = "block text-xs font-medium text-slate-600 mb-1.5"

  return (
    <div className="flex min-h-screen">
      {/* ── Left brand panel ── */}
      <div className="hidden lg:flex lg:w-[440px] xl:w-[480px] flex-col justify-between bg-[#0f172a] px-12 py-10 shrink-0">
        {/* Firm logo + name */}
        <div className="flex items-center gap-3">
          {portal.logo_url ? (
            <img
              src={portal.logo_url}
              alt={firmName}
              className="h-10 w-10 rounded-xl object-contain bg-white/10 p-1"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-white font-bold text-base">
              {firmName.charAt(0)}
            </div>
          )}
          <span className="text-xl font-bold text-white tracking-tight">{firmName}</span>
        </div>

        {/* Hero text */}
        <div className="space-y-8">
          <div>
            <h1 className="text-4xl font-bold text-white leading-snug">
              Your accounting,<br />handled professionally
            </h1>
            {portal.firm_description ? (
              <p className="mt-4 text-base text-slate-400 leading-relaxed">{portal.firm_description}</p>
            ) : (
              <p className="mt-4 text-base text-slate-400 leading-relaxed">
                Securely connect with {firmName} to streamline your bookkeeping and compliance.
              </p>
            )}
          </div>

          <div className="space-y-4">
            {[
              {
                icon: Shield,
                title: "Firm manages your account",
                desc: `${firmName} will be the admin — all bookkeeping is handled for you`,
              },
              {
                icon: FolderOpen,
                title: "Secure document sharing",
                desc: "Upload receipts, invoices, and statements — reviewed directly by your accountant",
              },
              {
                icon: Link2,
                title: "Already have an account?",
                desc: "Link your existing Accruly account to grant access",
              },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/15">
                  <Icon className="h-4 w-4 text-blue-400" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">{title}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          {portal.firm_website && (
            <a
              href={portal.firm_website}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-xs text-slate-600 hover:text-slate-400 transition-colors"
            >
              {portal.firm_website}
            </a>
          )}
          {portal.firm_support_email && (
            <a
              href={`mailto:${portal.firm_support_email}`}
              className="block text-xs text-slate-600 hover:text-slate-400 transition-colors"
            >
              {portal.firm_support_email}
            </a>
          )}
          <p className="text-xs text-slate-700 pt-2">Powered by <span className="font-medium text-slate-500">Accruly</span></p>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex flex-1 flex-col items-center justify-center bg-slate-50 px-6 py-12">
        {/* Mobile header */}
        <div className="flex items-center gap-2.5 mb-8 lg:hidden">
          {portal.logo_url ? (
            <img src={portal.logo_url} alt={firmName} className="h-8 w-8 rounded-lg object-contain" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-white text-sm font-bold">
              {firmName.charAt(0)}
            </div>
          )}
          <span className="text-lg font-bold text-slate-900">{firmName}</span>
        </div>

        <div className="w-full max-w-[400px]">

          {/* ── Signup (new account, Type 1) ── */}
          {mode === "signup" && (
            <>
              <div className="mb-7">
                <h2 className="text-2xl font-bold text-slate-900">Create your account</h2>
                <p className="mt-1.5 text-sm text-slate-500">
                  Join <span className="font-medium text-slate-700">{firmName}</span>'s client portal.{" "}
                  {firmName} will manage your bookkeeping.
                </p>
              </div>

              {error && (
                <div className="mb-5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  {error}
                </div>
              )}

              <form onSubmit={handleSignup} className="space-y-4">
                <div>
                  <label className={labelClass}>Full Name *</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      value={form.full_name}
                      onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                      className={`${inputClass} pl-9`}
                      placeholder="John Tan"
                      required
                      autoFocus
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Company Name *</label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      value={form.company_name}
                      onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                      className={`${inputClass} pl-9`}
                      placeholder="ABC Pte Ltd"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Email *</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className={`${inputClass} pl-9`}
                      placeholder="john@abc.com"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Password *</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      className={`${inputClass} pl-9`}
                      placeholder="Min. 8 characters"
                      required
                      minLength={8}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Phone (optional)</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      className={`${inputClass} pl-9`}
                      placeholder="+65 9123 4567"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={signup.isPending}
                  className="h-10 w-full rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {signup.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <><UserPlus className="h-4 w-4" /> Create Account</>
                  )}
                </button>
              </form>

              {/* Link existing account CTA */}
              <div className="mt-6 rounded-xl border border-slate-200 bg-white px-5 py-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                    <Link2 className="h-4 w-4 text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">Already have an Accruly account?</p>
                    <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">
                      Authenticate to link your existing account with <span className="font-medium">{firmName}</span>.
                      Once linked, {firmName} will have full access to manage your books.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => switchMode("link")}
                  className="mt-3 w-full rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition-colors flex items-center justify-center gap-2"
                >
                  <LogIn className="h-3.5 w-3.5" />
                  Authenticate & Link with {firmName}
                </button>
              </div>
            </>
          )}

          {/* ── Link existing account (Type 1) ── */}
          {mode === "link" && (
            <>
              <div className="mb-7">
                <h2 className="text-2xl font-bold text-slate-900">Link your account</h2>
                <p className="mt-1.5 text-sm text-slate-500">
                  Sign in to grant <span className="font-medium text-slate-700">{firmName}</span> access to your account.
                </p>
              </div>

              {/* What this means */}
              <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm">
                <p className="font-semibold text-amber-800 mb-1">What happens when you link</p>
                <ul className="space-y-1 text-xs text-amber-700">
                  <li className="flex items-start gap-1.5"><span className="mt-0.5">•</span><span><span className="font-medium">{firmName}</span> will become the admin of your account</span></li>
                  <li className="flex items-start gap-1.5"><span className="mt-0.5">•</span><span>You'll be able to share documents directly with them</span></li>
                  <li className="flex items-start gap-1.5"><span className="mt-0.5">•</span><span>Your billing will be managed by {firmName}</span></li>
                </ul>
              </div>

              {error && (
                <div className="mb-5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  {error}
                </div>
              )}

              <form onSubmit={handleLink} className="space-y-4">
                <div>
                  <label className={labelClass}>Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className={`${inputClass} pl-9`}
                      placeholder="you@company.com"
                      required
                      autoFocus
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      className={`${inputClass} pl-9`}
                      placeholder="••••••••"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={linkAccount.isPending}
                  className="h-10 w-full rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {linkAccount.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <><Link2 className="h-4 w-4" /> Authenticate & Link Account</>
                  )}
                </button>
              </form>

              <button
                onClick={() => switchMode("signup")}
                className="mt-4 w-full text-center text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >
                ← New to Accruly? Create an account instead
              </button>
            </>
          )}

          {/* ── Signup success ── */}
          {mode === "signup-success" && (
            <>
              <div className="text-center mb-6">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 mb-4">
                  <CheckCircle className="h-7 w-7 text-green-600" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900">Account Created!</h2>
                <p className="mt-1.5 text-sm text-slate-500">
                  You're now connected to <span className="font-medium text-slate-700">{firmName}</span>.
                  Upload your first documents to get started.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-sm font-semibold text-slate-700 mb-3">Upload Documents</p>
                <div
                  onClick={() => fileRef.current?.click()}
                  className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-8 cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
                >
                  <Upload className="h-7 w-7 text-slate-400" />
                  <div className="mt-2 text-sm text-slate-600 font-medium">Click to upload</div>
                  <div className="mt-0.5 text-xs text-slate-400">Invoices, receipts, statements — PDF, JPG, PNG</div>
                </div>
                <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" multiple className="hidden" onChange={handleFileUpload} />

                {uploading && (
                  <div className="mt-3 flex items-center justify-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
                  </div>
                )}

                {uploadedFiles.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {uploadedFiles.map((name, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
                        <FileText className="h-3.5 w-3.5 shrink-0" /> {name}
                        <CheckCircle className="ml-auto h-3.5 w-3.5" />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={() => navigate("/dashboard")}
                className="mt-4 h-10 w-full rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition-colors flex items-center justify-center gap-2"
              >
                Go to Dashboard <ArrowRight className="h-4 w-4" />
              </button>
            </>
          )}

          {/* ── Link success ── */}
          {mode === "link-success" && (
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 mb-4">
                <Link2 className="h-7 w-7 text-blue-600" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900">Account Linked!</h2>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed">
                Your account is now linked with <span className="font-medium text-slate-700">{firmName}</span>.
                You can share documents with them and they'll have access to manage your books.
              </p>

              <div className="mt-6 rounded-xl border border-slate-200 bg-white px-5 py-4 text-left space-y-2">
                {[
                  `${firmName} can now access your account`,
                  "Share documents from your Documents section",
                  "Your accountant will handle compliance and bookkeeping",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2.5 text-sm text-slate-600">
                    <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                    {item}
                  </div>
                ))}
              </div>

              <button
                onClick={() => navigate("/dashboard")}
                className="mt-5 h-10 w-full rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition-colors flex items-center justify-center gap-2"
              >
                Go to Dashboard <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
