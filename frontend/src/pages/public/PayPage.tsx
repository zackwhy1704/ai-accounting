import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { CreditCard, Loader2, CheckCircle2, XCircle } from "lucide-react"
import { Button } from "../../components/ui/button"
import { Card } from "../../components/ui/card"
import axios from "axios"

interface PaymentLinkData {
  token: string
  amount: number
  currency: string
  description: string | null
  gateway: string
  expires_at: string | null
  organization_name: string
  is_active: boolean
}

const API_BASE = import.meta.env.VITE_API_URL ?? ""

export default function PayPage() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<PaymentLinkData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)

  useEffect(() => {
    if (!token) return
    axios.get(`${API_BASE}/api/v1/payment-links/${token}/public`)
      .then(r => setData(r.data))
      .catch(e => {
        const msg = e.response?.data?.detail ?? "Payment link not found or expired"
        setError(msg)
      })
      .finally(() => setLoading(false))
  }, [token])

  const handlePay = async () => {
    if (!token) return
    setPaying(true)
    try {
      const resp = await axios.post(`${API_BASE}/api/v1/payment-links/${token}/checkout`)
      if (resp.data.checkout_url) {
        window.location.href = resp.data.checkout_url
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setError(err.response?.data?.detail ?? "Failed to start checkout")
      setPaying(false)
    }
  }

  const currencySymbol: Record<string, string> = {
    MYR: "RM", SGD: "S$", USD: "$", EUR: "€", AUD: "A$"
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-sm rounded-2xl border-border bg-card p-8 text-center shadow-xl">
          <XCircle className="mx-auto h-12 w-12 text-rose-500 mb-4" />
          <div className="text-lg font-semibold text-foreground">Payment Unavailable</div>
          <div className="mt-2 text-sm text-muted-foreground">{error}</div>
        </Card>
      </div>
    )
  }

  if (!data) return null

  const symbol = currencySymbol[data.currency] ?? data.currency

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 px-4">
      <div className="w-full max-w-md space-y-4">
        {/* Header */}
        <div className="text-center">
          <div className="text-2xl font-bold text-foreground">{data.organization_name}</div>
          <div className="mt-1 text-sm text-muted-foreground">Secure Payment</div>
        </div>

        <Card className="rounded-2xl border-border bg-card p-6 shadow-xl">
          {/* Amount */}
          <div className="text-center mb-6">
            <div className="text-4xl font-bold text-foreground">
              {symbol}{data.amount.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">{data.currency}</div>
            {data.description && (
              <div className="mt-2 text-sm text-foreground">{data.description}</div>
            )}
          </div>

          {/* Payment Method */}
          <div className="mb-4 rounded-xl border border-border bg-muted/30 px-4 py-3">
            <div className="flex items-center gap-3">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium text-foreground">
                  {data.gateway === "fpx" ? "FPX Online Banking" :
                   data.gateway === "stripe" ? "Credit / Debit Card" : "Online Payment"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {data.gateway === "fpx" ? "Malaysia online banking (Maybank, CIMB, etc.)" : "Visa, Mastercard, and more"}
                </div>
              </div>
            </div>
          </div>

          <Button
            type="button"
            className="w-full h-12 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] text-white text-sm font-semibold shadow-lg hover:opacity-95"
            onClick={handlePay}
            disabled={paying}
          >
            {paying ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Redirecting...</>
            ) : (
              <>Pay {symbol}{data.amount.toLocaleString("en-MY", { minimumFractionDigits: 2 })}</>
            )}
          </Button>

          {data.expires_at && (
            <div className="mt-3 text-center text-xs text-muted-foreground">
              Expires {new Date(data.expires_at).toLocaleDateString()}
            </div>
          )}
        </Card>

        <div className="text-center text-xs text-muted-foreground">
          Payments are processed securely via Stripe. Your card details are never stored.
        </div>
      </div>
    </div>
  )
}
