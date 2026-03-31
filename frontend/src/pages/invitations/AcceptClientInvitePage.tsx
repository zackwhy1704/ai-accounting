import { useEffect, useState } from "react"
import { useSearchParams, useNavigate } from "react-router-dom"
import { useQuery, useMutation } from "@tanstack/react-query"
import { Building2, CheckCircle2, XCircle, Loader2, LinkIcon } from "lucide-react"
import api from "../../lib/api"
import { useAuth } from "../../lib/auth"
import accrulyLogo from "../../assets/accruly-logo.svg"

interface InviteInfo {
  token: string
  firm_name: string
  firm_logo_url: string | null
  firm_email: string | null
  invited_email: string
  note: string | null
  status: string
}

export default function AcceptClientInvitePage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get("token")
  const navigate = useNavigate()
  const { user, token: authToken } = useAuth()
  const [done, setDone] = useState<"accepted" | "declined" | null>(null)
  const [error, setError] = useState("")

  const { data: invite, isLoading, isError } = useQuery<InviteInfo>({
    queryKey: ["invite-validate", token],
    queryFn: () => api.get(`/invitations/validate/${token}`).then((r) => r.data),
    enabled: !!token,
    retry: false,
  })

  const accept = useMutation({
    mutationFn: () => api.post(`/invitations/accept/${token}`),
    onSuccess: () => setDone("accepted"),
    onError: (e: any) => setError(e?.response?.data?.detail || "Failed to accept invitation"),
  })

  const decline = useMutation({
    mutationFn: () => api.post(`/invitations/decline/${token}`),
    onSuccess: () => setDone("declined"),
    onError: (e: any) => setError(e?.response?.data?.detail || "Failed to decline invitation"),
  })

  // If not logged in, redirect to login preserving this URL
  useEffect(() => {
    if (!authToken && !isLoading) {
      navigate(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`, { replace: true })
    }
  }, [authToken, isLoading, navigate])

  if (!token) {
    return <ErrorScreen message="No invitation token provided." />
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    )
  }

  if (isError || !invite) {
    return <ErrorScreen message="This invitation link is invalid or has expired." />
  }

  if (invite.status !== "pending") {
    return <ErrorScreen message="This invitation has already been used or revoked." />
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <header className="flex items-center gap-3 px-6 py-4 bg-[#0f172a]">
        <img src={accrulyLogo} alt="Accruly" className="h-8 w-8" />
        <span className="text-[17px] font-bold text-white">Accruly</span>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12">
        {done === "accepted" ? (
          <div className="w-full max-w-md text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">Linked successfully!</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              <strong>{invite.firm_name}</strong> can now see the documents you choose to share with them.
            </p>
            <button
              onClick={() => navigate("/shared-documents")}
              className="mt-6 w-full rounded-xl bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              Go to Shared Documents
            </button>
          </div>
        ) : done === "declined" ? (
          <div className="w-full max-w-md text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
              <XCircle className="h-8 w-8 text-slate-400" />
            </div>
            <h2 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">Invitation declined</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              You have declined the invitation from <strong>{invite.firm_name}</strong>.
            </p>
            <button
              onClick={() => navigate("/dashboard")}
              className="mt-6 w-full rounded-xl bg-slate-600 py-3 text-sm font-medium text-white hover:bg-slate-700 transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        ) : (
          <div className="w-full max-w-md rounded-2xl border border-border bg-white dark:bg-slate-800 shadow-lg p-6">
            {/* Firm identity */}
            <div className="flex items-center gap-4 mb-6">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                {invite.firm_logo_url ? (
                  <img src={invite.firm_logo_url} alt={invite.firm_name} className="h-10 w-10 rounded-xl object-contain" />
                ) : (
                  <Building2 className="h-7 w-7 text-blue-500" />
                )}
              </div>
              <div>
                <div className="text-lg font-bold text-slate-900 dark:text-white">{invite.firm_name}</div>
                {invite.firm_email && (
                  <div className="text-xs text-slate-500 dark:text-slate-400">{invite.firm_email}</div>
                )}
              </div>
            </div>

            <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-4 py-3 mb-5">
              <div className="flex items-start gap-2.5">
                <LinkIcon className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                    {invite.firm_name} wants to link with your account
                  </div>
                  <div className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
                    Sent to <strong>{invite.invited_email}</strong>
                  </div>
                  {invite.note && (
                    <div className="text-xs text-blue-600 dark:text-blue-400 mt-1.5 italic">"{invite.note}"</div>
                  )}
                </div>
              </div>
            </div>

            {/* Logged-in context */}
            {user && (
              <div className="rounded-xl bg-muted/40 px-3 py-2.5 mb-5 text-xs text-slate-500 dark:text-slate-400">
                You're signed in as <strong className="text-slate-700 dark:text-slate-200">{user.email}</strong>
                {user.email?.toLowerCase() !== invite.invited_email && (
                  <div className="mt-1 text-amber-600 font-medium">
                    ⚠ This invite was sent to {invite.invited_email}. Make sure you're signed into the right account.
                  </div>
                )}
              </div>
            )}

            <div className="text-xs text-slate-500 dark:text-slate-400 mb-5 leading-relaxed">
              By accepting, <strong>{invite.firm_name}</strong> will appear as a linked accountant. They will only see documents you explicitly choose to share with them.
            </div>

            {error && (
              <div className="mb-4 rounded-lg bg-red-50 px-3 py-2.5 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => decline.mutate()}
                disabled={decline.isPending || accept.isPending}
                className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
              >
                {decline.isPending ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Decline"}
              </button>
              <button
                onClick={() => accept.mutate()}
                disabled={accept.isPending || decline.isPending}
                className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {accept.isPending ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Accept & Link"}
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="py-4 text-center text-xs text-slate-400">
        Powered by <span className="font-medium">Accruly</span>
      </footer>
    </div>
  )
}

function ErrorScreen({ message }: { message: string }) {
  const navigate = useNavigate()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
      <XCircle className="h-12 w-12 text-slate-300" />
      <div className="mt-4 text-lg font-semibold text-slate-700 dark:text-slate-300">Invalid Invitation</div>
      <div className="mt-1 text-sm text-slate-500 dark:text-slate-400 text-center max-w-sm">{message}</div>
      <button onClick={() => navigate("/dashboard")} className="mt-6 text-sm text-blue-600 hover:underline">
        Back to Dashboard
      </button>
    </div>
  )
}
