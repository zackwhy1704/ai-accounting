import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCompleteOnboarding } from '../../lib/hooks'
import { useAuth } from '../../lib/auth'
import type { OnboardingData } from '../../types'
import {
  Building2, Users, User, Briefcase,
  ChevronRight, ChevronLeft, Check, Loader2,
  Search,
} from 'lucide-react'

/* ── Data ────────────────────────────────── */

const ORG_TYPES = [
  {
    id: 'sme',
    label: 'Small / Medium Business',
    desc: 'Full double-entry bookkeeping, invoicing, GST/VAT, bank reconciliation',
    icon: Building2,
  },
  {
    id: 'firm',
    label: 'Accounting Firm / Bookkeeper',
    desc: 'Practice dashboard, manage multiple client organisations, bulk actions',
    icon: Users,
  },
  {
    id: 'individual',
    label: 'Individual / Personal Tax',
    desc: 'Income tracking, deductions, tax estimate calculator, year-end filing',
    icon: User,
  },
  {
    id: 'freelancer',
    label: 'Freelancer / Sole Trader',
    desc: 'Invoicing, expense tracking, client management, simple P&L',
    icon: Briefcase,
  },
]

const COUNTRIES = [
  { code: 'SG', name: 'Singapore', tz: 'Asia/Singapore', currency: 'SGD', flag: '🇸🇬' },
  { code: 'MY', name: 'Malaysia', tz: 'Asia/Kuala_Lumpur', currency: 'MYR', flag: '🇲🇾' },
  { code: 'HK', name: 'Hong Kong', tz: 'Asia/Hong_Kong', currency: 'HKD', flag: '🇭🇰' },
  { code: 'US', name: 'United States', tz: 'America/New_York', currency: 'USD', flag: '🇺🇸' },
  { code: 'GB', name: 'United Kingdom', tz: 'Europe/London', currency: 'GBP', flag: '🇬🇧' },
  { code: 'AU', name: 'Australia', tz: 'Australia/Sydney', currency: 'AUD', flag: '🇦🇺' },
  { code: 'NZ', name: 'New Zealand', tz: 'Pacific/Auckland', currency: 'NZD', flag: '🇳🇿' },
  { code: 'IN', name: 'India', tz: 'Asia/Kolkata', currency: 'INR', flag: '🇮🇳' },
  { code: 'PH', name: 'Philippines', tz: 'Asia/Manila', currency: 'PHP', flag: '🇵🇭' },
  { code: 'ID', name: 'Indonesia', tz: 'Asia/Jakarta', currency: 'IDR', flag: '🇮🇩' },
  { code: 'TH', name: 'Thailand', tz: 'Asia/Bangkok', currency: 'THB', flag: '🇹🇭' },
  { code: 'VN', name: 'Vietnam', tz: 'Asia/Ho_Chi_Minh', currency: 'VND', flag: '🇻🇳' },
]

const CURRENCIES: Record<string, string> = {
  SGD: 'Singapore Dollar', MYR: 'Malaysian Ringgit', HKD: 'Hong Kong Dollar',
  USD: 'US Dollar', GBP: 'British Pound', AUD: 'Australian Dollar',
  NZD: 'New Zealand Dollar', INR: 'Indian Rupee', PHP: 'Philippine Peso',
  IDR: 'Indonesian Rupiah', THB: 'Thai Baht', VND: 'Vietnamese Dong', EUR: 'Euro',
}

const INDUSTRIES = [
  'Accounting & Financial Services', 'Agriculture', 'Art & Design',
  'Construction & Trades', 'Consulting', 'Education & Training',
  'Engineering', 'Food & Beverage', 'Healthcare & Medical',
  'Information Technology', 'Legal', 'Manufacturing',
  'Marketing & Advertising', 'Non-Profit', 'Professional Services',
  'Property & Real Estate', 'Retail & E-commerce', 'Tourism & Hospitality',
  'Transport & Logistics', 'Wholesale & Distribution', 'Other',
]

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const PREVIOUS_TOOLS = [
  'None / Starting fresh', 'Excel / Google Sheets', 'Xero', 'QuickBooks',
  'MYOB', 'Wave', 'FreshBooks', 'Zoho Books', 'AI Account', 'Sage', 'Other',
]

/* ── Shared Input Styles ────────────────── */

const inputClass = 'w-full h-11 px-4 rounded-xl border border-white/10 bg-white/5 text-white text-sm placeholder:text-white/30 outline-none focus:border-[#7C9DFF]/50 focus:ring-2 focus:ring-[#7C9DFF]/20 transition-all'
const selectClass = `${inputClass} appearance-none cursor-pointer bg-[url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23ffffff50' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")] bg-[length:1.25rem] bg-[right_0.75rem_center] bg-no-repeat pr-10`
const labelClass = 'block text-xs font-medium text-white/60 mb-2 tracking-wide uppercase'

/* ── Component ──────────────────────────── */

export default function OnboardingPage() {
  const navigate = useNavigate()
  const { user, setOnboardingCompleted } = useAuth()
  const completeOnboarding = useCompleteOnboarding()
  const [step, setStep] = useState(1)
  const TOTAL_STEPS = 4
  const [error, setError] = useState('')
  const [industrySearch, setIndustrySearch] = useState('')

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

  const selectedCountry = COUNTRIES.find(c => c.code === data.country)
  const filteredIndustries = industrySearch
    ? INDUSTRIES.filter(i => i.toLowerCase().includes(industrySearch.toLowerCase()))
    : INDUSTRIES

  const canNext = () => {
    if (step === 1) return true
    if (step === 2) return data.business_name.trim().length > 0
    if (step === 3) return true
    return true
  }

  const nextStep = () => {
    if (!canNext()) return
    setError('')
    if (step < TOTAL_STEPS) setStep(s => s + 1)
  }

  const handleSubmit = async () => {
    if (!data.business_name.trim()) {
      setStep(2)
      setError('Please enter your business name')
      return
    }
    setError('')
    try {
      await completeOnboarding.mutateAsync(data)
      setOnboardingCompleted(true)
      navigate('/dashboard', { replace: true })
    } catch {
      setError('Something went wrong. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-[#1a0b2e] flex flex-col">
      {/* Background glow */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(800px_circle_at_50%_20%,rgba(124,157,255,0.15),transparent_60%)]" />

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-[#7C9DFF] to-[#4D63FF] shadow-[0_0_0_1px_rgba(124,157,255,0.35)]" />
          <span className="text-sm font-semibold text-white/90">Accruly</span>
        </div>
        <div className="text-xs text-white/40">
          {user?.email && <span>Signed in as <span className="text-white/60">{user.email}</span></span>}
        </div>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex-1 flex items-start justify-center pt-8 pb-12 px-4 overflow-y-auto">
        <div className="w-full max-w-lg">
          {/* Progress */}
          <div className="flex items-center gap-3 mb-8">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map(s => (
              <div key={s} className="flex items-center gap-3 flex-1">
                <div className={`flex items-center justify-center h-8 w-8 rounded-full text-xs font-bold transition-all shrink-0 ${
                  s < step
                    ? 'bg-[#7C9DFF] text-white'
                    : s === step
                    ? 'bg-gradient-to-br from-[#7C9DFF] to-[#4D63FF] text-white shadow-[0_0_20px_rgba(124,157,255,0.4)]'
                    : 'bg-white/5 text-white/30 border border-white/10'
                }`}>
                  {s < step ? <Check size={14} /> : s}
                </div>
                {s < TOTAL_STEPS && (
                  <div className={`flex-1 h-0.5 rounded-full transition-colors ${s < step ? 'bg-[#7C9DFF]' : 'bg-white/10'}`} />
                )}
              </div>
            ))}
          </div>

          {/* Card */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-8 shadow-[0_16px_64px_rgba(0,0,0,0.4)]">

            {/* ──── Step 1: What brings you to Accruly? ──── */}
            {step === 1 && (
              <div>
                <h1 className="text-2xl font-bold text-white mb-1">What brings you to Accruly?</h1>
                <p className="text-sm text-white/40 mb-8">This helps us tailor the experience for you.</p>
                <div className="space-y-3">
                  {ORG_TYPES.map(t => {
                    const Icon = t.icon
                    const selected = data.org_type === t.id
                    return (
                      <button
                        key={t.id}
                        onClick={() => update({ org_type: t.id })}
                        className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all text-left group ${
                          selected
                            ? 'border-[#7C9DFF]/50 bg-[#7C9DFF]/10 shadow-[0_0_0_1px_rgba(124,157,255,0.25),inset_0_1px_0_rgba(124,157,255,0.1)]'
                            : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
                        }`}
                      >
                        <div className={`flex items-center justify-center h-11 w-11 rounded-xl transition-colors shrink-0 ${
                          selected
                            ? 'bg-gradient-to-br from-[#7C9DFF] to-[#4D63FF] text-white shadow-[0_4px_12px_rgba(77,99,255,0.4)]'
                            : 'bg-white/5 text-white/40 group-hover:text-white/60'
                        }`}>
                          <Icon size={22} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`font-semibold text-sm ${selected ? 'text-white' : 'text-white/80'}`}>{t.label}</div>
                          <div className="text-xs text-white/40 mt-0.5 leading-relaxed">{t.desc}</div>
                        </div>
                        <div className={`flex items-center justify-center h-5 w-5 rounded-full border transition-all shrink-0 ${
                          selected
                            ? 'border-[#7C9DFF] bg-[#7C9DFF]'
                            : 'border-white/20'
                        }`}>
                          {selected && <Check size={12} className="text-white" strokeWidth={3} />}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ──── Step 2: Add your business ──── */}
            {step === 2 && (
              <div>
                <h1 className="text-2xl font-bold text-white mb-1">
                  {data.org_type === 'individual' ? 'Set up your profile' :
                   data.org_type === 'firm' ? 'Set up your practice' :
                   'Add your business'}
                </h1>
                <p className="text-sm text-white/40 mb-8">We'll use this to configure your account.</p>

                <div className="space-y-5">
                  {/* Business name */}
                  <div>
                    <label className={labelClass}>
                      {data.org_type === 'individual' ? 'Display Name' :
                       data.org_type === 'firm' ? 'Firm Name' :
                       'Business Name'}
                    </label>
                    <input
                      type="text"
                      value={data.business_name}
                      onChange={e => update({ business_name: e.target.value })}
                      placeholder={
                        data.org_type === 'firm' ? 'e.g. Smith & Partners LLP' :
                        data.org_type === 'individual' ? 'e.g. John Doe' :
                        'e.g. Acme Pte Ltd'
                      }
                      className={inputClass}
                      autoFocus
                    />
                  </div>

                  {/* Industry */}
                  <div>
                    <label className={labelClass}>Industry</label>
                    <div className="relative">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30 pointer-events-none" />
                      <input
                        type="text"
                        value={data.industry || industrySearch}
                        onChange={e => {
                          setIndustrySearch(e.target.value)
                          if (data.industry) update({ industry: null })
                        }}
                        onFocus={() => { if (data.industry) { setIndustrySearch(data.industry); update({ industry: null }) } }}
                        placeholder="e.g. construction, retail, services"
                        className={`${inputClass} pl-10`}
                      />
                    </div>
                    {industrySearch && !data.industry && filteredIndustries.length > 0 && (
                      <div className="mt-1 rounded-xl border border-white/10 bg-[#1a0b2e] max-h-40 overflow-y-auto shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
                        {filteredIndustries.map(ind => (
                          <button
                            key={ind}
                            onClick={() => { update({ industry: ind }); setIndustrySearch('') }}
                            className="w-full text-left px-4 py-2.5 text-sm text-white/70 hover:bg-white/5 hover:text-white transition-colors"
                          >
                            {ind}
                          </button>
                        ))}
                      </div>
                    )}
                    {!industrySearch && !data.industry && (
                      <p className="mt-1.5 text-xs text-white/30">
                        If you can't find your industry, type to search or select "Other"
                      </p>
                    )}
                  </div>

                  {/* Country */}
                  <div>
                    <label className={labelClass}>Country</label>
                    <select
                      value={data.country}
                      onChange={e => selectCountry(e.target.value)}
                      className={selectClass}
                    >
                      {COUNTRIES.map(c => (
                        <option key={c.code} value={c.code}>{c.flag}  {c.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Auto-detected fields */}
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-white/40">Time zone</span>
                      <span className="text-sm text-white/70">{data.timezone.replace(/_/g, ' ')}</span>
                    </div>
                    <div className="h-px bg-white/5" />
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-white/40">Currency</span>
                      <span className="text-sm text-white/70">
                        {selectedCountry?.flag} {data.currency} — {CURRENCIES[data.currency] || data.currency}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ──── Step 3: Financial details ──── */}
            {step === 3 && (
              <div>
                <h1 className="text-2xl font-bold text-white mb-1">Financial details</h1>
                <p className="text-sm text-white/40 mb-8">Help us set up your chart of accounts correctly.</p>

                <div className="space-y-6">
                  {/* Fiscal year end */}
                  <div>
                    <label className={labelClass}>Last day of your financial year</label>
                    <div className="flex gap-3">
                      <select
                        value={data.fiscal_year_end_day}
                        onChange={e => update({ fiscal_year_end_day: Number(e.target.value) })}
                        className={`${selectClass} flex-[1]`}
                      >
                        {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                      <select
                        value={data.fiscal_year_end_month}
                        onChange={e => update({ fiscal_year_end_month: Number(e.target.value) })}
                        className={`${selectClass} flex-[2]`}
                      >
                        {MONTHS.map((m, i) => (
                          <option key={m} value={i + 1}>{m}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Employees */}
                  <div>
                    <label className={labelClass}>Do you have employees?</label>
                    <div className="space-y-2">
                      {[
                        { v: true, label: 'Yes' },
                        { v: false, label: "No, it's just me" },
                      ].map(opt => {
                        const selected = data.has_employees === opt.v
                        return (
                          <button
                            key={String(opt.v)}
                            onClick={() => update({ has_employees: opt.v })}
                            className={`w-full flex items-center gap-3 p-4 rounded-xl border text-left transition-all ${
                              selected
                                ? 'border-[#7C9DFF]/50 bg-[#7C9DFF]/10'
                                : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                            }`}
                          >
                            <div className={`flex items-center justify-center h-5 w-5 rounded-full border transition-all shrink-0 ${
                              selected ? 'border-[#7C9DFF] bg-[#7C9DFF]' : 'border-white/20'
                            }`}>
                              {selected && <Check size={12} className="text-white" strokeWidth={3} />}
                            </div>
                            <span className={`text-sm font-medium ${selected ? 'text-white' : 'text-white/60'}`}>{opt.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Previous tool */}
                  <div>
                    <label className={labelClass}>What accounting tool do you currently use?</label>
                    <select
                      value={data.previous_tool || ''}
                      onChange={e => update({ previous_tool: e.target.value || null })}
                      className={selectClass}
                    >
                      <option value="">Select a tool</option>
                      {PREVIOUS_TOOLS.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* ──── Step 4: Confirmation ──── */}
            {step === 4 && (
              <div>
                <div className="flex items-center justify-center mb-6">
                  <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-[#7C9DFF] to-[#4D63FF] flex items-center justify-center shadow-[0_8px_32px_rgba(77,99,255,0.4)]">
                    <Check size={32} className="text-white" strokeWidth={2.5} />
                  </div>
                </div>
                <h1 className="text-2xl font-bold text-white mb-1 text-center">
                  You're all set, {user?.full_name?.split(' ')[0] || 'there'}!
                </h1>
                <p className="text-sm text-white/40 mb-8 text-center">
                  Here's a summary of your setup. You can change these anytime in Settings.
                </p>

                <div className="rounded-xl border border-white/10 bg-white/[0.02] divide-y divide-white/5">
                  {[
                    ['Account Type', ORG_TYPES.find(t => t.id === data.org_type)?.label || data.org_type],
                    ['Business Name', data.business_name || '—'],
                    ['Industry', data.industry || '—'],
                    ['Country', selectedCountry ? `${selectedCountry.flag}  ${selectedCountry.name}` : data.country],
                    ['Currency', `${data.currency} — ${CURRENCIES[data.currency] || ''}`],
                    ['Financial Year End', `${data.fiscal_year_end_day} ${MONTHS[data.fiscal_year_end_month - 1]}`],
                    ['Employees', data.has_employees ? 'Yes' : 'No, just me'],
                    ['Previous Tool', data.previous_tool || '—'],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between px-5 py-3.5">
                      <span className="text-xs text-white/40 uppercase tracking-wide">{label}</span>
                      <span className="text-sm text-white/80 font-medium">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="mt-5 rounded-xl bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-300">
                {error}
              </div>
            )}

            {/* Navigation buttons */}
            <div className="flex justify-between mt-8">
              {step > 1 ? (
                <button
                  onClick={() => { setStep(s => s - 1); setError('') }}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium text-white/50 hover:text-white/80 hover:bg-white/5 transition-colors"
                >
                  <ChevronLeft size={16} /> Back
                </button>
              ) : <div />}

              {step < TOTAL_STEPS ? (
                <button
                  onClick={nextStep}
                  disabled={!canNext()}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(124,157,255,0.25),0_8px_24px_rgba(0,0,0,0.35)] hover:shadow-[0_0_0_1px_rgba(124,157,255,0.35),0_12px_32px_rgba(77,99,255,0.3)] transition-all disabled:opacity-40"
                >
                  {step === 1 ? 'Get started' : 'Continue'} <ChevronRight size={16} />
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={completeOnboarding.isPending}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-[#7C9DFF] to-[#4D63FF] text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(124,157,255,0.25),0_8px_24px_rgba(0,0,0,0.35)] hover:shadow-[0_0_0_1px_rgba(124,157,255,0.35),0_12px_32px_rgba(77,99,255,0.3)] transition-all disabled:opacity-40"
                >
                  {completeOnboarding.isPending ? (
                    <><Loader2 size={16} className="animate-spin" /> Setting up...</>
                  ) : (
                    <><Check size={16} /> Start using Accruly</>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Footer */}
          <p className="text-center text-white/20 text-xs mt-6">
            You can change these settings later in Control Panel &gt; Settings.
          </p>
        </div>
      </div>
    </div>
  )
}
