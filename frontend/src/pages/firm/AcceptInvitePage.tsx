import { useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery, useMutation } from "@tanstack/react-query"
import axios from "axios"
import { Card } from "../../components/ui/card"
import {
  Building2, Lock, Loader2, CheckCircle, Phone,
  ArrowRight,
} from "lucide-react"

const API_BASE = import.meta.env.VITE_API_URL || "/api/v1"

export default function AcceptInvitePage() {
  const { token } = useParams<{ slug: string; token: string }>()
  const navigate = useNavigate()
  const [password, setPassword] = useState("")
  const [phone, setPhone] = useState("")
  const [error, setError] = useState("")
  const [accepted, setAccepted] = useState(false)

  // Validate token and get invite info
  const { data: invite, isLoading, isError } = useQuery<{
    contact_name: string
    business_name: string
    email: string
    firm_name: string
    brand_primary_color: string
    brand_secondary_color: string
    logo_url: string | null
  }>({
    queryKey: ["invite", token],
    queryFn: () => axios.get(`${API_BASE}/firm/invite/${token}`).then((r) => r.data),
    enabled: !!token,
    retry: false,
  })

  // Accept invitation
  const accept = useMutation({
    mutationFn: (data: { token: string; password: string; phone?: string }) =>
      axios.post(`${API_BASE}/firm/invite/accept`, data).then((r) => r.data),
    onSuccess: (data) => {
      localStorage.setItem("access_token", data.access_token)
      setAccepted(true)
    },
    onError: (e: any) => {
      setError(e?.response?.data?.detail || "Failed to accept invitation")
    },
  })

  const handleAccept = (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (password.length < 8) {
      setError("Password must be at least 8 characters")
      return
    }
    accept.mutate({ token: token!, password, phone: phone || undefined })
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    )
  }

  if (isError || !invite) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
        <Building2 className="h-12 w-12 text-slate-300" />
        <div className="mt-4 text-lg font-semibold text-slate-700">Invalid or Expired Invitation</div>
        <div className="mt-1 text-sm text-slate-500">This invitation link is no longer valid. Please ask your bookkeeper to send a new one.</div>
      </div>
    )
  }

  const primary = invite.brand_primary_color || "#4D63FF"
  const secondary = invite.brand_secondary_color || "#7C9DFF"

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {/* Header */}
      <header
        className="flex items-center px-6 py-4"
        style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}
      >
        <div className="flex items-center gap-3">
          {invite.logo_url ? (
            <img src={invite.logo_url} alt={invite.firm_name} className="h-9 w-9 rounded-lg object-contain bg-white/20 p-1" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/20 text-white font-bold text-sm">
              {invite.firm_name.charAt(0)}
            </div>
          )}
          <span className="text-lg font-semibold text-white">{invite.firm_name}</span>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-8">
        {!accepted ? (
          <Card className="w-full max-w-md rounded-2xl border-slate-200 bg-white p-6 shadow-lg">
            <div className="text-center mb-5">
              <div
                className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl text-white mb-4"
                style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}
              >
                <Building2 className="h-7 w-7" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">Welcome, {invite.contact_name}!</h2>
              <p className="mt-1 text-sm text-slate-500">
                <strong>{invite.firm_name}</strong> has invited you to set up your account for <strong>{invite.business_name}</strong>.
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 px-4 py-3 mb-4">
              <div className="text-xs text-slate-400">Your email</div>
              <div className="text-sm font-medium text-slate-700">{invite.email}</div>
            </div>

            <form onSubmit={handleAccept} className="space-y-3">
              <div>
                <label className="text-xs text-slate-500">Set Your Password *</label>
                <div className="relative mt-1">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm"
                    placeholder="Min 8 characters"
                    required
                    minLength={8}
                    autoFocus
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500">Phone (optional)</label>
                <div className="relative mt-1">
                  <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
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
                disabled={accept.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium text-white disabled:opacity-50 transition-colors"
                style={{ backgroundColor: primary }}
              >
                {accept.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                Accept & Create Account
              </button>
            </form>
          </Card>
        ) : (
          <div className="w-full max-w-lg text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="mt-4 text-xl font-bold text-slate-900">You're All Set!</h2>
            <p className="mt-1 text-sm text-slate-500">
              Your account for <strong>{invite.business_name}</strong> is ready. You can now upload documents for {invite.firm_name} to review.
            </p>

            <button
              onClick={() => navigate("/dashboard")}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium text-white transition-colors"
              style={{ backgroundColor: primary }}
            >
              Go to Dashboard <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </main>

      <footer className="py-4 text-center text-xs text-slate-400">
        Powered by <span className="font-medium">Accruly</span>
      </footer>
    </div>
  )
}
