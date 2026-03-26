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

// Firm / Practice
export interface FirmSettings {
  slug: string | null
  name: string
  logo_url: string | null
  favicon_url: string | null
  brand_primary_color: string | null
  brand_secondary_color: string | null
  client_portal_enabled: boolean
  custom_domain: string | null
  firm_description: string | null
  firm_contact_email: string | null
  firm_website: string | null
  firm_support_email: string | null
  portal_url: string | null
}

export interface FirmClientOrg {
  id: string
  name: string
  org_type: string
  country: string
  currency: string
  industry: string | null
  onboarding_completed: boolean
  is_archived: boolean
  created_at: string
}

export interface FirmClientMetrics {
  invoices: number
  bills: number
  documents: number
  pending_documents: number
  users: number
  total_revenue: number
  total_expenses: number
}

export interface FirmDashboardClient {
  id: string
  name: string
  org_type: string
  country: string
  currency: string
  industry: string | null
  logo_url: string | null
  onboarding_completed: boolean
  created_at: string
  metrics: FirmClientMetrics
}

export interface FirmDashboard {
  firm_name: string
  firm_slug: string | null
  total_clients: number
  clients: FirmDashboardClient[]
}

export interface PortalInfo {
  firm_name: string
  logo_url: string | null
  favicon_url: string | null
  brand_primary_color: string
  brand_secondary_color: string
  slug: string
  firm_description: string | null
  firm_website: string | null
  firm_support_email: string | null
}

export interface SlugCheck {
  slug: string
  available: boolean
  reason?: string
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
