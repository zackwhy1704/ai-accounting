import { useState, useRef } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery, useMutation } from "@tanstack/react-query"
import axios from "axios"
import { Card } from "../../components/ui/card"
import {
  Building2, Upload, Loader2, CheckCircle, FileText, LogIn,
  UserPlus, Mail, Lock, User, Phone, ArrowRight,
} from "lucide-react"
import type { PortalInfo } from "../../types"

const API_BASE = import.meta.env.VITE_API_URL || "/api/v1"

export default function ClientPortalPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [mode, setMode] = useState<"landing" | "login" | "signup" | "success">("landing")
  const [form, setForm] = useState({
    email: "", password: "", full_name: "", company_name: "", phone: "",
  })
  const [error, setError] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([])

  // Fetch portal info (public, no auth)
  const { data: portal, isLoading, isError } = useQuery<PortalInfo>({
    queryKey: ["portal", slug],
    queryFn: () => axios.get(`${API_BASE}/firm/portal/${slug}`).then((r) => r.data),
    enabled: !!slug,
  })

  // Signup mutation
  const signup = useMutation({
    mutationFn: (data: typeof form) =>
      axios.post(`${API_BASE}/firm/portal/${slug}/signup`, data).then((r) => r.data),
    onSuccess: (data) => {
      localStorage.setItem("access_token", data.access_token)
      setMode("success")
    },
    onError: (e: any) => {
      const detail: string = e?.response?.data?.detail || ""
      // Existing user hit the signup form — pivot them to login with email pre-filled
      if (e?.response?.status === 400 && detail.toLowerCase().includes("already registered")) {
        setError("You already have an account. Signing you in…")
        setMode("login")
        return
      }
      setError(detail || "Signup failed. Please try again.")
    },
  })

  // Login mutation — uses the firm-aware portal endpoint so existing users get linked
  const login = useMutation({
    mutationFn: (data: { email: string; password: string }) =>
      axios.post(`${API_BASE}/firm/portal/${slug}/login`, data).then((r) => r.data),
    onSuccess: (data) => {
      localStorage.setItem("access_token", data.access_token)
      navigate("/dashboard", { replace: true })
    },
    onError: (e: any) => {
      const status = e?.response?.status
      if (status === 401) {
        setError("Incorrect email or password.")
      } else {
        setError(e?.response?.data?.detail || "Login failed. Please try again.")
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

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (!form.email || !form.password) {
      setError("Please enter your email and password")
      return
    }
    login.mutate({ email: form.email, password: form.password })
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
        // silently skip failed uploads
      }
    }
    setUploading(false)
  }

  const switchMode = (newMode: "landing" | "login" | "signup") => {
    setMode(newMode)
    setError("")
  }

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

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {/* Header with firm branding */}
      <header
        className="flex items-center justify-between px-6 py-4 bg-primary"
      >
        <div className="flex items-center gap-3">
          {portal.logo_url ? (
            <img src={portal.logo_url} alt={portal.firm_name} className="h-9 w-9 rounded-lg object-contain bg-white/20 p-1" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/20 text-white font-bold text-sm">
              {portal.firm_name.charAt(0)}
            </div>
          )}
          <span className="text-lg font-semibold text-white">{portal.firm_name}</span>
        </div>
        {mode !== "login" && mode !== "signup" && (
          <button
            onClick={() => switchMode("login")}
            className="flex items-center gap-1.5 rounded-lg bg-white/20 px-3 py-1.5 text-sm text-white hover:bg-white/30 transition-colors"
          >
            <LogIn className="h-3.5 w-3.5" /> Sign In
          </button>
        )}
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-8">
        {mode === "landing" && (
          <div className="w-full max-w-lg text-center">
            <div
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-white"
            >
              <Building2 className="h-8 w-8" />
            </div>
            <h1 className="mt-5 text-2xl font-bold text-slate-900">
              Welcome to {portal.firm_name}
            </h1>
            {portal.firm_description && (
              <p className="mt-2 text-sm text-slate-500">{portal.firm_description}</p>
            )}
            <div className="mt-6 space-y-3">
              <button
                onClick={() => switchMode("signup")}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-medium text-white transition-colors hover:bg-primary/90"
              >
                <UserPlus className="h-4 w-4" /> Create Account & Get Started
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => switchMode("login")}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <LogIn className="h-4 w-4" /> Already have an account? Sign in
              </button>
            </div>
            {(portal.firm_website || portal.firm_support_email) && (
              <div className="mt-8 flex items-center justify-center gap-4 text-xs text-slate-400">
                {portal.firm_website && (
                  <a href={portal.firm_website} target="_blank" rel="noopener noreferrer" className="hover:text-slate-600">
                    Website
                  </a>
                )}
                {portal.firm_support_email && (
                  <a href={`mailto:${portal.firm_support_email}`} className="hover:text-slate-600">
                    Contact Support
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {mode === "login" && (
          <Card className="w-full max-w-md rounded-2xl border-slate-200 bg-white p-6 shadow-lg">
            <div className="text-center mb-5">
              <h2 className="text-xl font-bold text-slate-900">Sign In</h2>
              <p className="mt-1 text-sm text-slate-500">
                Sign in to your {portal.firm_name} account
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-3">
              <div>
                <label className="text-xs text-slate-500">Email</label>
                <div className="relative mt-1">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm"
                    placeholder="john@abc.com"
                    required
                    autoFocus
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500">Password</label>
                <div className="relative mt-1">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm"
                    placeholder="Enter your password"
                    required
                  />
                </div>
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>
              )}

              <button
                type="submit"
                disabled={login.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-medium text-white disabled:opacity-50 transition-colors hover:bg-primary/90"
              >
                {login.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                Sign In
              </button>
            </form>

            <div className="mt-4 text-center text-xs text-slate-400">
              Don't have an account?{" "}
              <button onClick={() => switchMode("signup")} className="text-slate-600 hover:underline font-medium">
                Create one
              </button>
            </div>

            <button
              onClick={() => switchMode("landing")}
              className="mt-2 w-full text-center text-xs text-slate-400 hover:text-slate-600"
            >
              Back
            </button>
          </Card>
        )}

        {mode === "signup" && (
          <Card className="w-full max-w-md rounded-2xl border-slate-200 bg-white p-6 shadow-lg">
            <div className="text-center mb-5">
              <h2 className="text-xl font-bold text-slate-900">Create Your Account</h2>
              <p className="mt-1 text-sm text-slate-500">
                Sign up to {portal.firm_name}'s client portal
              </p>
            </div>

            <form onSubmit={handleSignup} className="space-y-3">
              <div>
                <label className="text-xs text-slate-500">Full Name *</label>
                <div className="relative mt-1">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm"
                    placeholder="John Tan"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500">Company Name *</label>
                <div className="relative mt-1">
                  <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={form.company_name}
                    onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm"
                    placeholder="ABC Pte Ltd"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500">Email *</label>
                <div className="relative mt-1">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm"
                    placeholder="john@abc.com"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500">Password *</label>
                <div className="relative mt-1">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm"
                    placeholder="Min 8 characters"
                    required
                    minLength={8}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500">Phone (optional)</label>
                <div className="relative mt-1">
                  <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm"
                    placeholder="+65 9123 4567"
                  />
                </div>
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>
              )}

              <button
                type="submit"
                disabled={signup.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-medium text-white disabled:opacity-50 transition-colors hover:bg-primary/90"
              >
                {signup.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Create Account
              </button>
            </form>

            <div className="mt-4 text-center text-xs text-slate-400">
              Already have an account?{" "}
              <button onClick={() => switchMode("login")} className="text-slate-600 hover:underline font-medium">
                Sign in
              </button>
            </div>

            <button
              onClick={() => switchMode("landing")}
              className="mt-2 w-full text-center text-xs text-slate-400 hover:text-slate-600"
            >
              Back
            </button>
          </Card>
        )}

        {mode === "success" && (
          <div className="w-full max-w-lg text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="mt-4 text-xl font-bold text-slate-900">Account Created!</h2>
            <p className="mt-1 text-sm text-slate-500">
              You can now upload documents for {portal.firm_name} to review.
            </p>

            {/* Document Upload Area */}
            <Card className="mt-6 rounded-2xl border-slate-200 bg-white p-6 shadow-sm">
              <div className="text-sm font-semibold text-slate-700 mb-3">Upload Documents</div>
              <div
                onClick={() => fileRef.current?.click()}
                className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-8 cursor-pointer hover:border-slate-300 transition-colors"
              >
                <Upload className="h-8 w-8 text-slate-400" />
                <div className="mt-2 text-sm text-slate-600">Click to upload invoices, receipts, or statements</div>
                <div className="mt-1 text-xs text-slate-400">PDF, JPG, PNG, WEBP (max 10MB)</div>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                multiple
                className="hidden"
                onChange={handleFileUpload}
              />

              {uploading && (
                <div className="mt-3 flex items-center justify-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Uploading...
                </div>
              )}

              {uploadedFiles.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {uploadedFiles.map((name, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
                      <FileText className="h-3.5 w-3.5" /> {name}
                      <CheckCircle className="ml-auto h-3.5 w-3.5" />
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <button
              onClick={() => navigate("/dashboard")}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-medium text-white transition-colors hover:bg-primary/90"
            >
              Go to Dashboard <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-slate-400">
        Powered by <span className="font-medium">Accruly</span>
      </footer>
    </div>
  )
}
