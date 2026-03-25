import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../../lib/auth"
import { useTheme } from "../../lib/theme"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Card } from "../../components/ui/card"

export default function LoginPage() {
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const { login, register } = useAuth()
  const navigate = useNavigate()
  const { t } = useTheme()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      if (isRegister) {
        await register(email, password, fullName, companyName)
      } else {
        await login(email, password)
      }
      navigate("/dashboard")
    } catch (err: any) {
      setError(err.response?.data?.detail || "Something went wrong")
    } finally {
      setLoading(false)
    }
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

        <div className="text-xl font-semibold text-white mb-1">
          {isRegister ? t("login.createAccount") : t("login.welcomeBack")}
        </div>
        <div className="text-sm text-white/50 mb-6">
          {isRegister ? t("login.startTrial") : t("login.signInDesc")}
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <>
              <div>
                <label className="text-xs font-medium text-white/70 mb-1.5 block">{t("login.fullName")}</label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value.replace(/\b\w/g, c => c.toUpperCase()))} placeholder="John Doe" required className="h-10 rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/30" />
              </div>
              <div>
                <label className="text-xs font-medium text-white/70 mb-1.5 block">{t("login.companyName")}</label>
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value.replace(/\b\w/g, c => c.toUpperCase()))} placeholder="Acme Sdn Bhd" required className="h-10 rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/30" />
              </div>
            </>
          )}
          <div>
            <label className="text-xs font-medium text-white/70 mb-1.5 block">{t("login.email")}</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required className="h-10 rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/30" />
          </div>
          <div>
            <label className="text-xs font-medium text-white/70 mb-1.5 block">{t("login.password")}</label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required className="h-10 rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/30" />
          </div>
          <Button type="submit" disabled={loading} className="h-10 w-full rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(124,157,255,0.25),0_16px_40px_rgba(0,0,0,0.35)] hover:opacity-95">
            {loading ? t("common.loading") : isRegister ? t("login.create") : t("login.signIn")}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-white/50">
          {isRegister ? t("login.haveAccount") : t("login.noAccount")}{" "}
          <button type="button" onClick={() => { setIsRegister(!isRegister); setError("") }} className="text-[#7C9DFF] hover:text-[#a5bfff] font-medium">
            {isRegister ? t("login.signInLink") : t("login.createLink")}
          </button>
        </div>
      </Card>
    </div>
  )
}
