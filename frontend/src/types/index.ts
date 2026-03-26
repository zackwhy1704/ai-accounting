export interface User {
  id: string
  email: string
  full_name: string
  role: string
  organization_id: string
}

export interface Contact {
  id: string
  name: string
  email: string | null
  phone: string | null
  type: string
  company: string | null
  address: string | null
  tax_number: string | null
  created_at: string
}

export interface Invoice {
  id: string
  invoice_number: string
  contact_id: string
  contact_name?: string
  status: string
  issue_date: string
  due_date: string
  subtotal: number
  tax_amount: number
  total: number
  amount_paid: number
  currency: string
  notes: string | null
  created_at: string
}

export interface Bill {
  id: string
  bill_number: string
  contact_id: string
  contact_name?: string
  status: string
  issue_date: string
  due_date: string
  subtotal: number
  tax_amount: number
  total: number
  amount_paid: number
  currency: string
  created_at: string
}

export interface Account {
  id: string
  code: string
  name: string
  type: string
  subtype: string | null
  currency: string
  is_system: boolean
  created_at: string
}

export interface Transaction {
  id: string
  date: string
  description: string
  reference: string | null
  source: string
  is_posted: boolean
  created_at: string
}

export interface Document {
  id: string
  filename: string
  file_url: string
  file_type: string
  file_size: number
  status: string
  category: string | null
  ai_extracted_data: Record<string, unknown> | null
  ai_confidence: number | null
  linked_bill_id: string | null
  linked_invoice_id: string | null
  uploaded_at: string
  processed_at: string | null
}

export interface DashboardData {
  total_revenue: number
  total_expenses: number
  net_income: number
  accounts_receivable: number
  accounts_payable: number
  cash_balance: number
  overdue_invoices: number
  pending_documents: number
}

export interface BillingPlan {
  id: string
  name: string
  price: number
  ai_scans: number | string
  max_users: number
  features: string[]
}

export interface BillingUsage {
  plan: string
  ai_scans_used: number
  ai_scans_limit: number
  users_count: number
}

export interface Organization {
  id: string
  name: string
  org_type: string
  country: string
  timezone: string
  currency: string
  fiscal_year_end_day: number
  fiscal_year_end_month: number
  has_employees: boolean
  industry: string | null
  plan: string
  onboarding_completed: boolean
  created_at: string
}

export interface UserOrgMembership {
  organization_id: string
  organization_name: string
  org_type: string
  role: string
  is_default: boolean
  currency: string
  country: string
  onboarding_completed: boolean
}

export interface OnboardingData {
  org_type: string
  business_name: string
  industry: string | null
  country: string
  timezone: string
  currency: string
  fiscal_year_end_day: number
  fiscal_year_end_month: number
  has_employees: boolean
  previous_tool: string | null
}
