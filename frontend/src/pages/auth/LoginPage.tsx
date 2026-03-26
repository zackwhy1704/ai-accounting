import { useState, useEffect } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useAuth } from "../../lib/auth"
import { useTheme } from "../../lib/theme"
import { useForgotPassword, useResetPassword } from "../../lib/hooks"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Card } from "../../components/ui/card"
import { Loader2, ArrowLeft, CheckCircle2 } from "lucide-react"

type View = "login" | "register" | "forgot" | "reset"

export default function LoginPage() {
  const [searchParams] = useSearchParams()
  const resetToken = searchParams.get("reset_token")

  const [view, setView] = useState<View>(resetToken ? "reset" : "login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [phone, setPhone] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [loading, setLoading] = useState(false)
  const { login, register } = useAuth()
  const navigate = useNavigate()
  const { t } = useTheme()
  const forgotMutation = useForgotPassword()
  const resetMutation = useResetPassword()

  useEffect(() => {
    if (resetToken) setView("reset")
  }, [resetToken])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const result = await login(email, password)
      if (!result.onboarding_completed) {
        navigate("/onboarding")
      } else if (result.org_type === 'firm') {
        navigate("/firm/dashboard")
      } else {
        navigate("/dashboard")
      }
    } catch (err: any) {
      const status = err.response?.status
      if (status === 401) {
        setError("Incorrect email or password. Please double-check your credentials, or create a new account.")
      } else if (status === 403) {
        setError("Your account has been disabled. Please contact support.")
      } else {
        setError("Something went wrong. Please try again later.")
      }
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (password.length < 8) {
      setError("Password must be at least 8 characters.")
      return
    }
    setLoading(true)
    try {
      await register(email, password, fullName, companyName, phone)
      navigate("/onboarding")
    } catch (err: any) {
      setError(err.response?.data?.detail || "Registration failed. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccess("")
    forgotMutation.mutate(email, {
      onSuccess: () => {
        setSuccess("If an account with that email exists, a password reset link has been sent. Please check your inbox.")
      },
      onError: () => {
        setError("Failed to send reset email. Please try again later.")
      },
    })
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccess("")
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters.")
      return
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.")
      return
    }
    resetMutation.mutate(
      { token: resetToken!, new_password: newPassword },
      {
        onSuccess: () => {
          setSuccess("Password reset successfully! You can now sign in with your new password.")
          setTimeout(() => {
            setView("login")
            setSuccess("")
            navigate("/login", { replace: true })
          }, 3000)
        },
        onError: (err: any) => {
          const detail = err.response?.data?.detail
          if (detail?.includes("expired")) {
            setError("This reset link has expired. Please request a new one.")
          } else {
            setError("Invalid or expired reset link. Please request a new one.")
          }
        },
      }
    )
  }

  const switchView = (v: View) => {
    setView(v)
    setError("")
    setSuccess("")
  }

  const titles: Record<View, { heading: string; sub: string }> = {
    login: { heading: t("login.welcomeBack"), sub: t("login.signInDesc") },
    register: { heading: "Start a free trial", sub: "No credit card required. Cancel anytime." },
    forgot: { heading: "Reset password", sub: "Enter your email and we'll send you a reset link." },
    reset: { heading: "Set new password", sub: "Enter your new password below." },
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#1a0b2e] px-4">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(600px_circle_at_50%_30%,rgba(124,157,255,0.3),transparent_60%)]" />
      <Card className="relative w-full max-w-md rounded-2xl border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#7C9DFF] to-[#4D63FF] shadow-[0_0_0_1px_rgba(124,157,255,0.35),0_10px_30px_rgba(0,0,0,0.35)]" />
          <div>
            <div className="text-lg font-semibold text-white">{t("login.appName")}</div>
            <div className="text-xs text-white/50">{t("login.appDesc")}</div>
          </div>
        </div>

        {(view === "forgot" || view === "reset") && (
          <button
            type="button"
            onClick={() => switchView("login")}
            className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 mb-4 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
          </button>
        )}

        <div className="text-xl font-semibold text-white mb-1">{titles[view].heading}</div>
        <div className="text-sm text-white/50 mb-6">{titles[view].sub}</div>

        {error && (
          <div className="mb-4 rounded-xl bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-300">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-300 flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Login Form */}
        {view === "login" && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-white/70 mb-1.5 block">{t("login.email")}</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required className="h-10 rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/30" />
            </div>
            <div>
              <label className="text-xs font-medium text-white/70 mb-1.5 block">{t("login.password")}</label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required className="h-10 rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/30" />
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={() => switchView("forgot")} className="text-xs text-[#7C9DFF] hover:text-[#a5bfff] font-medium">
                Forgot password?
              </button>
            </div>
            <Button type="submit" disabled={loading} className="h-10 w-full rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(124,157,255,0.25),0_16px_40px_rgba(0,0,0,0.35)] hover:opacity-95">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("login.signIn")}
            </Button>
          </form>
        )}

        {/* Register Form - Xero style: name, email, phone, password */}
        {view === "register" && (
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-white/70 mb-1.5 block">First name</label>
                <Input
                  value={fullName.split(' ')[0] || ''}
                  onChange={(e) => {
                    const last = fullName.split(' ').slice(1).join(' ')
                    setFullName(e.target.value + (last ? ' ' + last : ''))
                  }}
                  placeholder="John"
                  required
                  className="h-10 rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/30"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-white/70 mb-1.5 block">Last name</label>
                <Input
                  value={fullName.split(' ').slice(1).join(' ') || ''}
                  onChange={(e) => {
                    const first = fullName.split(' ')[0] || ''
                    setFullName(first + (e.target.value ? ' ' + e.target.value : ''))
                  }}
                  placeholder="Doe"
                  required
                  className="h-10 rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/30"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-white/70 mb-1.5 block">Email</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required className="h-10 rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/30" />
            </div>
            <div>
              <label className="text-xs font-medium text-white/70 mb-1.5 block">Phone</label>
              <div className="flex gap-2">
                <div className="flex items-center gap-1.5 h-10 px-3 rounded-xl border border-white/10 bg-white/5 text-white/70 text-sm shrink-0">
                  <span className="text-base">🇸🇬</span> +65
                </div>
                <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="8123 4567" className="h-10 rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/30" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-white/70 mb-1.5 block">Company name</label>
              <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Pte Ltd" required className="h-10 rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/30" />
            </div>
            <div>
              <label className="text-xs font-medium text-white/70 mb-1.5 block">Password</label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 characters" required minLength={8} className="h-10 rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/30" />
            </div>

            <div className="flex items-start gap-2.5 pt-1">
              <input type="checkbox" required className="mt-1 h-4 w-4 rounded border-white/20 bg-white/5 accent-[#7C9DFF]" />
              <span className="text-xs text-white/50 leading-relaxed">
                I've read and agreed to the{" "}
                <span className="text-[#7C9DFF] cursor-pointer hover:underline">Terms of Use</span>,{" "}
                <span className="text-[#7C9DFF] cursor-pointer hover:underline">Privacy Notice</span>, and{" "}
                <span className="text-[#7C9DFF] cursor-pointer hover:underline">Offer Details</span>.
              </span>
            </div>

            <Button type="submit" disabled={loading} className="h-10 w-full rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(124,157,255,0.25),0_16px_40px_rgba(0,0,0,0.35)] hover:opacity-95">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Next: Set up your business"}
            </Button>
          </form>
        )}

        {/* Forgot Password Form */}
        {view === "forgot" && (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-white/70 mb-1.5 block">{t("login.email")}</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required className="h-10 rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/30" />
            </div>
            <Button type="submit" disabled={forgotMutation.isPending} className="h-10 w-full rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(124,157,255,0.25),0_16px_40px_rgba(0,0,0,0.35)] hover:opacity-95">
              {forgotMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send reset link"}
            </Button>
          </form>
        )}

        {/* Reset Password Form */}
        {view === "reset" && (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-white/70 mb-1.5 block">New password</label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" required minLength={6} className="h-10 rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/30" />
            </div>
            <div>
              <label className="text-xs font-medium text-white/70 mb-1.5 block">Confirm password</label>
              <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" required minLength={6} className="h-10 rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/30" />
            </div>
            <Button type="submit" disabled={resetMutation.isPending} className="h-10 w-full rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(124,157,255,0.25),0_16px_40px_rgba(0,0,0,0.35)] hover:opacity-95">
              {resetMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reset password"}
            </Button>
          </form>
        )}

        {/* Footer links */}
        {(view === "login" || view === "register") && (
          <div className="mt-6 text-center text-sm text-white/50">
            {view === "register" ? t("login.haveAccount") : t("login.noAccount")}{" "}
            <button
              type="button"
              onClick={() => switchView(view === "register" ? "login" : "register")}
              className="text-[#7C9DFF] hover:text-[#a5bfff] font-medium"
            >
              {view === "register" ? t("login.signInLink") : t("login.createLink")}
            </button>
          </div>
        )}
      </Card>
    </div>
  )
}
