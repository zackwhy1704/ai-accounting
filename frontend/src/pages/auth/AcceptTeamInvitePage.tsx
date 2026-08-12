import { useState } from "react"
import { Loader2, UserPlus } from "lucide-react"
import { useMutation } from "@tanstack/react-query"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import api from "../../lib/api"

export default function AcceptTeamInvitePage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get("token") ?? ""
  const [fullName, setFullName] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const accept = useMutation({
    mutationFn: () => api.post("/org/users/accept-invite", {
      token,
      full_name: fullName || null,
      password: password || null,
    }).then(r => r.data),
    onSuccess: () => setDone(true),
    onError: (e: any) => setError(e?.response?.data?.detail ?? "Failed to accept the invitation"),
  })

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md rounded-2xl border-border bg-card p-8 shadow-lg">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#4D63FF]/10">
            <UserPlus className="h-6 w-6 text-[#4D63FF]" />
          </div>
          <div className="text-xl font-semibold text-foreground">Join the team</div>
          <div className="mt-1 text-sm text-muted-foreground">
            You've been invited to an organization on Accruly
          </div>
        </div>

        {done ? (
          <div className="text-center">
            <div className="text-sm font-medium text-emerald-600 mb-4">You're in! Sign in to get started.</div>
            <Button className="w-full bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] text-white" onClick={() => navigate("/login")}>
              Go to Sign In
            </Button>
          </div>
        ) : !token ? (
          <div className="text-center text-sm text-rose-600">This invite link is missing its token. Ask for a new invitation.</div>
        ) : (
          <div className="space-y-4">
            <div className="text-xs text-muted-foreground">
              Already have an Accruly account with the invited email? Just accept below. New here? Set your name and a password.
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Full name (new accounts)</label>
              <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your name" className="h-10 text-sm" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Password (new accounts — 8+ chars incl. a digit)</label>
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className="h-10 text-sm" />
            </div>
            {error && <div className="text-sm text-rose-600">{error}</div>}
            <Button
              className="w-full bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] text-white"
              onClick={() => { setError(null); accept.mutate() }}
              disabled={accept.isPending}
            >
              {accept.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Accept Invitation
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}
