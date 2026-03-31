import { useState, useEffect } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useAuth } from "../../lib/auth"
import { useTheme } from "../../lib/theme"
import { useForgotPassword, useResetPassword } from "../../lib/hooks"
import { Button } from "../../components/ui/button"
import { Loader2, ArrowLeft, CheckCircle2, TrendingUp, Shield, Zap } from "lucide-react"
import accrulyLogo from "../../assets/accruly-logo.svg"

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
      } else if (result.org_type === "firm") {
        navigate("/firm/dashboard")
      } else {
        navigate("/dashboard")
      }
    } catch (err: any) {
      const status = err.response?.status
      if (status === 401) {
        setError("Incorrect email or password. Please double-check your credentials.")
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
        setSuccess("If an account with that email exists, a password reset link has been sent.")
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
          setSuccess("Password reset successfully! Redirecting to sign in…")
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

  const inputClass =
    "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-500 transition-colors"

  const labelClass = "block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5"

  return (
    <div className="flex min-h-screen">
      {/* ── Left brand panel ─────────────────────── */}
      <div className="hidden lg:flex lg:w-[480px] xl:w-[520px] flex-col justify-between bg-[#0f172a] px-12 py-10 shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <img src={accrulyLogo} alt="Accruly" className="h-9 w-9" />
          <span className="text-xl font-bold text-white tracking-tight">Accruly</span>
        </div>

        {/* Hero text */}
        <div className="space-y-8">
          <div>
            <h1 className="text-4xl font-bold text-white leading-snug">
              Smart accounting<br />for modern businesses
            </h1>
            <p className="mt-4 text-base text-slate-400 leading-relaxed">
              Invoices, expenses, payroll and compliance — all in one place. Built for Malaysia and Singapore.
            </p>
          </div>

          <div className="space-y-4">
            {[
              { icon: TrendingUp, title: "Real-time financial insights", desc: "Live P&L, cash flow and AR/AP dashboards" },
              { icon: Shield, title: "LHDN & IRAS compliant", desc: "MyInvois e-invoicing and GST ready" },
              { icon: Zap, title: "AI-powered document processing", desc: "Auto-extract data from receipts and invoices" },
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

        <p className="text-xs text-slate-600">© {new Date().getFullYear()} Accruly. All rights reserved.</p>
      </div>

      {/* ── Right form panel ─────────────────────── */}
      <div className="flex flex-1 flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 px-6 py-12">
        {/* Mobile logo */}
        <div className="flex items-center gap-2.5 mb-8 lg:hidden">
          <img src={accrulyLogo} alt="Accruly" className="h-8 w-8" />
          <span className="text-lg font-bold text-slate-900 dark:text-white">Accruly</span>
        </div>

        <div className="w-full max-w-[400px]">
          {(view === "forgot" || view === "reset") && (
            <button
              type="button"
              onClick={() => switchView("login")}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 mb-5 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
            </button>
          )}

          <div className="mb-7">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
              {view === "login" && "Sign in"}
              {view === "register" && "Create your account"}
              {view === "forgot" && "Forgot password?"}
              {view === "reset" && "Set new password"}
            </h2>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              {view === "login" && "Welcome back — sign in to continue"}
              {view === "register" && "No credit card required. Cancel anytime."}
              {view === "forgot" && "We'll send a reset link to your email."}
              {view === "reset" && "Enter your new password below."}
            </p>
          </div>

          {error && (
            <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-900/20 dark:text-emerald-400 flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {/* ── Login ── */}
          {view === "login" && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className={labelClass}>{t("login.email")}</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required className={inputClass} autoFocus />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className={labelClass.replace("mb-1.5", "")}>{t("login.password")}</label>
                  <button type="button" onClick={() => switchView("forgot")} className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium">
                    Forgot password?
                  </button>
                </div>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required className={inputClass} />
              </div>
              <Button type="submit" disabled={loading} className="h-10 w-full rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition-colors">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
              </Button>
            </form>
          )}

          {/* ── Register ── */}
          {view === "register" && (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>First name</label>
                  <input
                    value={fullName.split(" ")[0] || ""}
                    onChange={(e) => {
                      const last = fullName.split(" ").slice(1).join(" ")
                      setFullName(e.target.value + (last ? " " + last : ""))
                    }}
                    placeholder="John"
                    required
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Last name</label>
                  <input
                    value={fullName.split(" ").slice(1).join(" ") || ""}
                    onChange={(e) => {
                      const first = fullName.split(" ")[0] || ""
                      setFullName(first + (e.target.value ? " " + e.target.value : ""))
                    }}
                    placeholder="Doe"
                    required
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Phone</label>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+60 12-345 6789" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Company name</label>
                <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Sdn Bhd" required className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 characters" required minLength={8} className={inputClass} />
              </div>
              <div className="flex items-start gap-2.5">
                <input type="checkbox" required className="mt-1 h-4 w-4 rounded border-slate-300 accent-blue-600" />
                <span className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  I agree to the{" "}
                  <span className="text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">Terms of Use</span>
                  {" & "}
                  <span className="text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">Privacy Policy</span>
                </span>
              </div>
              <Button type="submit" disabled={loading} className="h-10 w-full rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition-colors">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
              </Button>
            </form>
          )}

          {/* ── Forgot password ── */}
          {view === "forgot" && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <label className={labelClass}>{t("login.email")}</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required className={inputClass} autoFocus />
              </div>
              <Button type="submit" disabled={forgotMutation.isPending} className="h-10 w-full rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition-colors">
                {forgotMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send reset link"}
              </Button>
            </form>
          )}

          {/* ── Reset password ── */}
          {view === "reset" && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className={labelClass}>New password</label>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" required minLength={6} className={inputClass} autoFocus />
              </div>
              <div>
                <label className={labelClass}>Confirm password</label>
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" required minLength={6} className={inputClass} />
              </div>
              <Button type="submit" disabled={resetMutation.isPending} className="h-10 w-full rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition-colors">
                {resetMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reset password"}
              </Button>
            </form>
          )}

          {/* Switch login ↔ register */}
          {(view === "login" || view === "register") && (
            <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
              {view === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
              <button
                type="button"
                onClick={() => switchView(view === "login" ? "register" : "login")}
                className="font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                {view === "login" ? "Create one" : "Sign in"}
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
