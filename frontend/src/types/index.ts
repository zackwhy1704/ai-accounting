export interface User {
  id: string
  email: string
  full_name: string
  organization_id: string
  role: 'admin' | 'accountant' | 'viewer'
  avatar_url?: string
}

export interface Organization {
  id: string
  name: string
  uen?: string
  industry?: string
  currency: string
  tax_rate: number
  plan: 'starter' | 'essentials' | 'professional' | 'enterprise'
}

export interface Contact {
  id: string
  name: string
  email?: string
  phone?: string
  type: 'customer' | 'vendor' | 'both'
  company?: string
  address?: string
  tax_number?: string
  outstanding_balance: number
  created_at: string
}

export interface Invoice {
  id: string
  invoice_number: string
  contact_id: string
  contact_name: string
  status: 'draft' | 'sent' | 'viewed' | 'paid' | 'overdue' | 'cancelled'
  issue_date: string
  due_date: string
  subtotal: number
  tax_amount: number
  total: number
  currency: string
  line_items: LineItem[]
  notes?: string
  created_at: string
}

export interface LineItem {
  id: string
  description: string
  quantity: number
  unit_price: number
  tax_rate: number
  amount: number
  account_id?: string
}

export interface Bill {
  id: string
  bill_number: string
  contact_id: string
  contact_name: string
  status: 'draft' | 'received' | 'approved' | 'paid' | 'overdue'
  issue_date: string
  due_date: string
  subtotal: number
  tax_amount: number
  total: number
  currency: string
  line_items: LineItem[]
  created_at: string
}

export interface Account {
  id: string
  code: string
  name: string
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
  subtype: string
  balance: number
  currency: string
  is_system: boolean
}

export interface Transaction {
  id: string
  date: string
  description: string
  reference?: string
  entries: JournalEntry[]
  source: 'manual' | 'invoice' | 'bill' | 'bank' | 'ai'
  created_at: string
}

export interface JournalEntry {
  id: string
  account_id: string
  account_name: string
  debit: number
  credit: number
}

export interface Document {
  id: string
  filename: string
  file_url: string
  file_type: string
  file_size: number
  status: 'uploaded' | 'processing' | 'processed' | 'failed'
  ai_extracted_data?: Record<string, unknown>
  linked_invoice_id?: string
  linked_bill_id?: string
  uploaded_at: string
}

export interface BankTransaction {
  id: string
  date: string
  description: string
  amount: number
  type: 'credit' | 'debit'
  category?: string
  matched_transaction_id?: string
  is_reconciled: boolean
  ai_suggested_category?: string
  ai_confidence?: number
}

export interface DashboardMetrics {
  total_revenue: number
  total_expenses: number
  net_income: number
  accounts_receivable: number
  accounts_payable: number
  cash_balance: number
  revenue_trend: { month: string; amount: number }[]
  expense_trend: { month: string; amount: number }[]
  recent_transactions: Transaction[]
  overdue_invoices: number
  pending_documents: number
}
