import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCompleteOnboarding } from '../../lib/hooks'
import type { OnboardingData } from '../../types'
import {
  Building2, Users, User, Briefcase,
  ChevronRight, ChevronLeft, Check, Loader2,
} from 'lucide-react'

const ORG_TYPES = [
  { id: 'sme', label: 'Small / Medium Business', desc: 'Full double-entry bookkeeping, invoicing, GST', icon: Building2 },
  { id: 'firm', label: 'Accounting Firm', desc: 'Manage multiple client organisations', icon: Users },
  { id: 'individual', label: 'Individual / Personal Tax', desc: 'Income tracking, deductions, tax prep', icon: User },
  { id: 'freelancer', label: 'Freelancer / Sole Trader', desc: 'Invoicing, expense tracking, simple P&L', icon: Briefcase },
]

const COUNTRIES = [
  { code: 'SG', name: 'Singapore', tz: 'Asia/Singapore', currency: 'SGD', taxRate: 9 },
  { code: 'MY', name: 'Malaysia', tz: 'Asia/Kuala_Lumpur', currency: 'MYR', taxRate: 6 },
  { code: 'HK', name: 'Hong Kong', tz: 'Asia/Hong_Kong', currency: 'HKD', taxRate: 0 },
  { code: 'US', name: 'United States', tz: 'America/New_York', currency: 'USD', taxRate: 0 },
  { code: 'GB', name: 'United Kingdom', tz: 'Europe/London', currency: 'GBP', taxRate: 20 },
  { code: 'AU', name: 'Australia', tz: 'Australia/Sydney', currency: 'AUD', taxRate: 10 },
]

const INDUSTRIES = [
  'Technology', 'Professional Services', 'Retail', 'Food & Beverage',
  'Construction', 'Healthcare', 'Education', 'Manufacturing',
  'Real Estate', 'Logistics', 'Creative & Media', 'Other',
]

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const PREVIOUS_TOOLS = [
  'None / Starting fresh', 'Excel / Spreadsheets', 'Xero', 'QuickBooks',
  'MYOB', 'Wave', 'FreshBooks', 'Zoho Books', 'AI Account', 'Other',
]

export default function OnboardingPage() {
  const navigate = useNavigate()
  const completeOnboarding = useCompleteOnboarding()
  const [step, setStep] = useState(1)
  const [error, setError] = useState('')

  const [data, setData] = useState<OnboardingData>({
    org_type: 'sme',
    business_name: '',
    industry: null,
    country: 'SG',
    timezone: 'Asia/Singapore',
    currency: 'SGD',
    fiscal_year_end_day: 31,
    fiscal_year_end_month: 12,
    has_employees: false,
    previous_tool: null,
  })

  const update = (fields: Partial<OnboardingData>) => setData(d => ({ ...d, ...fields }))

  const selectCountry = (code: string) => {
    const c = COUNTRIES.find(c => c.code === code)
    if (c) update({ country: c.code, timezone: c.tz, currency: c.currency })
  }

  const handleSubmit = async () => {
    if (!data.business_name.trim()) {
      setError('Please enter your business name')
      return
    }
    setError('')
    try {
      await completeOnboarding.mutateAsync(data)
      navigate('/dashboard', { replace: true })
    } catch {
      setError('Something went wrong. Please try again.')
    }
  }

  const canNext = () => {
    if (step === 1) return true
    if (step === 2) return data.business_name.trim().length > 0
    return true
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        {/* Progress bar */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex-1 flex items-center gap-2">
              <div className={`h-2 flex-1 rounded-full transition-colors ${s <= step ? 'bg-indigo-500' : 'bg-gray-200'}`} />
            </div>
          ))}
          <span className="text-sm text-gray-500 ml-2">Step {step} of 3</span>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8">
          {/* Step 1: User Type */}
          {step === 1 && (
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome to Accruly</h1>
              <p className="text-gray-500 mb-6">What best describes you?</p>
              <div className="space-y-3">
                {ORG_TYPES.map(t => {
                  const Icon = t.icon
                  const selected = data.org_type === t.id
                  return (
                    <button
                      key={t.id}
                      onClick={() => update({ org_type: t.id })}
                      className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                        selected
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className={`p-3 rounded-lg ${selected ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                        <Icon size={24} />
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900">{t.label}</div>
                        <div className="text-sm text-gray-500">{t.desc}</div>
                      </div>
                      {selected && <Check size={20} className="ml-auto text-indigo-500" />}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Step 2: Business Details */}
          {step === 2 && (
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                {data.org_type === 'individual' ? 'Set up your profile' :
                 data.org_type === 'firm' ? 'Set up your practice' :
                 'Add your business'}
              </h1>
              <p className="text-gray-500 mb-6">We'll use this to configure your account.</p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {data.org_type === 'individual' ? 'Full Name' :
                     data.org_type === 'firm' ? 'Firm name' :
                     'Business name'}
                  </label>
                  <input
                    type="text"
                    value={data.business_name}
                    onChange={e => update({ business_name: e.target.value })}
                    placeholder={data.org_type === 'firm' ? 'e.g. Smith & Partners' : 'e.g. Acme Pte Ltd'}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
                  <select
                    value={data.industry || ''}
                    onChange={e => update({ industry: e.target.value || null })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none bg-white"
                  >
                    <option value="">Select an industry</option>
                    {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                  <select
                    value={data.country}
                    onChange={e => selectCountry(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none bg-white"
                  >
                    {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                  </select>
                </div>

                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
                    <input
                      type="text"
                      value={data.timezone}
                      readOnly
                      className="w-full px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 text-gray-600"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                    <input
                      type="text"
                      value={data.currency}
                      readOnly
                      className="w-full px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 text-gray-600"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Additional Setup */}
          {step === 3 && (
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Almost done!</h1>
              <p className="text-gray-500 mb-6">A few more details to personalise your experience.</p>

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last day of your financial year</label>
                  <div className="flex gap-3">
                    <select
                      value={data.fiscal_year_end_day}
                      onChange={e => update({ fiscal_year_end_day: Number(e.target.value) })}
                      className="flex-[1] px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                    >
                      {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                    <select
                      value={data.fiscal_year_end_month}
                      onChange={e => update({ fiscal_year_end_month: Number(e.target.value) })}
                      className="flex-[2] px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                    >
                      {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Do you have employees?</label>
                  <div className="flex gap-3">
                    {[{ v: true, l: 'Yes' }, { v: false, l: "No, it's just me" }].map(opt => (
                      <button
                        key={String(opt.v)}
                        onClick={() => update({ has_employees: opt.v })}
                        className={`flex-1 py-3 px-4 rounded-lg border-2 font-medium transition-all ${
                          data.has_employees === opt.v
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        {opt.l}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">What accounting tool do you currently use?</label>
                  <select
                    value={data.previous_tool || ''}
                    onChange={e => update({ previous_tool: e.target.value || null })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                  >
                    <option value="">Select a tool</option>
                    {PREVIOUS_TOOLS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-8">
            {step > 1 ? (
              <button
                onClick={() => setStep(s => s - 1)}
                className="flex items-center gap-2 px-5 py-3 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <ChevronLeft size={18} /> Back
              </button>
            ) : <div />}

            {step < 3 ? (
              <button
                onClick={() => canNext() && setStep(s => s + 1)}
                disabled={!canNext()}
                className="flex items-center gap-2 px-6 py-3 rounded-lg bg-indigo-500 text-white font-semibold hover:bg-indigo-600 transition-colors disabled:opacity-50"
              >
                Next <ChevronRight size={18} />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={completeOnboarding.isPending}
                className="flex items-center gap-2 px-6 py-3 rounded-lg bg-indigo-500 text-white font-semibold hover:bg-indigo-600 transition-colors disabled:opacity-50"
              >
                {completeOnboarding.isPending ? (
                  <><Loader2 size={18} className="animate-spin" /> Setting up...</>
                ) : (
                  <><Check size={18} /> Start using Accruly</>
                )}
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-gray-400 text-sm mt-6">
          You can change these settings later in Control Panel.
        </p>
      </div>
    </div>
  )
}
