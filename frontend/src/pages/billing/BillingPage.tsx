import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'
import { Check, Sparkles, Zap, Crown } from 'lucide-react'

const plans = [
  {
    name: 'Starter',
    price: 0,
    period: 'Free forever',
    icon: Zap,
    features: ['5 invoices/month', '10 AI document scans', '1 user', 'Basic reports', 'GST tracking'],
    current: false,
  },
  {
    name: 'Essentials',
    price: 29,
    period: '/month',
    icon: Sparkles,
    features: ['Unlimited invoices', '100 AI document scans/mo', '3 users', 'Bank reconciliation', 'GST reports', 'Multi-currency'],
    current: true,
  },
  {
    name: 'Professional',
    price: 69,
    period: '/month',
    icon: Crown,
    features: ['Everything in Essentials', '500 AI document scans/mo', '10 users', 'Budgeting & forecasting', 'API access', 'Priority support'],
    current: false,
  },
  {
    name: 'Enterprise',
    price: 149,
    period: '/month',
    icon: Crown,
    features: ['Everything in Professional', 'Unlimited AI scans', '25+ users', 'Custom AI models', 'SSO / SAML', 'Dedicated support', 'Audit logs'],
    current: false,
  },
]

export function BillingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Billing & Plans</h1>
        <p className="text-muted-foreground">Manage your subscription and billing</p>
      </div>

      {/* Current usage */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">AI Document Scans</p>
            <p className="text-xl font-bold mt-1">27 <span className="text-sm font-normal text-muted-foreground">/ 100</span></p>
            <div className="mt-2 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: '27%' }} /></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Next Billing Date</p>
            <p className="text-xl font-bold mt-1">Apr 1, 2026</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Monthly Cost</p>
            <p className="text-xl font-bold mt-1">{formatCurrency(29)}</p>
            <p className="text-xs text-muted-foreground mt-1">+ $0.05/extra AI scan</p>
          </CardContent>
        </Card>
      </div>

      {/* Plans */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => (
          <Card key={plan.name} className={plan.current ? 'border-primary shadow-md' : ''}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <plan.icon className={`h-6 w-6 ${plan.current ? 'text-primary' : 'text-muted-foreground'}`} />
                {plan.current && <Badge>Current</Badge>}
              </div>
              <CardTitle>{plan.name}</CardTitle>
              <div>
                <span className="text-3xl font-bold">${plan.price}</span>
                <span className="text-sm text-muted-foreground">{plan.period}</span>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button className="w-full mt-6" variant={plan.current ? 'outline' : 'default'} disabled={plan.current}>
                {plan.current ? 'Current Plan' : plan.price === 0 ? 'Downgrade' : 'Upgrade'}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* AI Add-on */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-center justify-between p-6">
          <div>
            <h3 className="font-semibold flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> AI Document Processing Add-on</h3>
            <p className="text-sm text-muted-foreground mt-1">Need more AI scans? Purchase additional capacity at $0.05 per document.</p>
          </div>
          <Button>Buy Extra Scans</Button>
        </CardContent>
      </Card>
    </div>
  )
}
