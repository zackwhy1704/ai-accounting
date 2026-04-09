import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './api'
import type { Invoice, Bill, Contact, Document, DashboardData, Account, BillingUsage, BillingPlan, OnboardingData, FirmSettings, FirmClientOrg, FirmDashboard, SlugCheck, Quotation, DeliveryOrder, CreditNote, DebitNote, SalesPayment, SalesRefund, Organization, PurchaseOrder, GoodsReceivedNote, PurchasePayment, PurchaseRefund } from '../types'

// Dashboard
export function useDashboard() {
  return useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/dashboard').then(r => r.data),
  })
}

// Invoices
export function useInvoices(status?: string) {
  return useQuery<Invoice[]>({
    queryKey: ['invoices', status],
    queryFn: () => api.get('/invoices', { params: status ? { status } : {} }).then(r => r.data),
  })
}

export function useCreateInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/invoices', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  })
}

// Quotations
export function useQuotations(status?: string) {
  return useQuery<Quotation[]>({
    queryKey: ['quotations', status],
    queryFn: () => api.get('/quotations', { params: status ? { status } : {} }).then(r => r.data),
  })
}

export function useQuotation(id: string | undefined) {
  return useQuery({
    queryKey: ['quotation', id],
    queryFn: () => api.get(`/quotations/${id}`).then(r => r.data),
    enabled: !!id,
  })
}

export function useCreateQuotation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/quotations', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quotations'] }),
  })
}

export function useUpdateQuotation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => api.patch(`/quotations/${id}`, data).then(r => r.data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['quotations'] })
      qc.invalidateQueries({ queryKey: ['quotation', vars.id] })
    },
  })
}

export function useConvertQuotation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, targets }: { id: string; targets: string[] }) => api.post(`/quotations/${id}/convert`, { targets }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotations'] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['delivery-orders'] })
    },
  })
}



// Delivery Orders
export function useDeliveryOrders(status?: string) {
  return useQuery<DeliveryOrder[]>({
    queryKey: ['delivery-orders', status],
    queryFn: () => api.get('/delivery-orders', { params: status ? { status } : {} }).then(r => r.data),
  })
}

export function useCreateDeliveryOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/delivery-orders', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['delivery-orders'] }),
  })
}

// Credit Notes
export function useCreditNotes(status?: string) {
  return useQuery<CreditNote[]>({
    queryKey: ['credit-notes', status],
    queryFn: () => api.get('/credit-notes', { params: status ? { status } : {} }).then(r => r.data),
  })
}

export function useCreateCreditNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/credit-notes', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credit-notes'] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
    },
  })
}

// Debit Notes
export function useDebitNotes(status?: string) {
  return useQuery<DebitNote[]>({
    queryKey: ['debit-notes', status],
    queryFn: () => api.get('/debit-notes', { params: status ? { status } : {} }).then(r => r.data),
  })
}

export function useCreateDebitNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/debit-notes', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['debit-notes'] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
    },
  })
}

// Sales Payments
export function useSalesPayments(status?: string) {
  return useQuery<SalesPayment[]>({
    queryKey: ['sales-payments', status],
    queryFn: () => api.get('/sales-payments', { params: status ? { status } : {} }).then(r => r.data),
  })
}

export function useCreateSalesPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/sales-payments', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-payments'] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
    },
  })
}

// Sales Refunds
export function useSalesRefunds(status?: string) {
  return useQuery<SalesRefund[]>({
    queryKey: ['sales-refunds', status],
    queryFn: () => api.get('/sales-refunds', { params: status ? { status } : {} }).then(r => r.data),
  })
}

export function useCreateSalesRefund() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/sales-refunds', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-refunds'] })
      qc.invalidateQueries({ queryKey: ['credit-notes'] })
    },
  })
}

// Bills
export function useBills(status?: string) {
  return useQuery<Bill[]>({
    queryKey: ['bills', status],
    queryFn: () => api.get('/bills', { params: status ? { status } : {} }).then(r => r.data),
  })
}

// Contacts
export function useContacts(type?: string) {
  return useQuery<Contact[]>({
    queryKey: ['contacts', type],
    queryFn: () => api.get('/contacts', { params: type ? { type } : {} }).then(r => r.data),
  })
}

export function useCreateContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/contacts', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  })
}

export function useContact(id: string | undefined) {
  return useQuery({
    queryKey: ['contact', id],
    queryFn: () => api.get(`/contacts/${id}`).then(r => r.data),
    enabled: !!id,
  })
}

export function useUpdateContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; [key: string]: unknown }) =>
      api.put(`/contacts/${id}`, data).then(r => r.data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['contacts'] })
      qc.invalidateQueries({ queryKey: ['contact', vars.id] })
    },
  })
}

// Documents
export function useDocuments() {
  return useQuery<Document[]>({
    queryKey: ['documents'],
    queryFn: () => api.get('/documents').then(r => r.data),
    // Auto-poll every 3s while any document is still processing
    refetchInterval: (query) => {
      const docs = query.state.data
      if (docs?.some(d => d.status === 'processing')) return 3000
      return false
    },
  })
}

export function useUploadDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      return api.post('/documents', formData, {
        headers: { 'Content-Type': undefined },
        timeout: 120000,
      }).then(r => r.data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
  })
}

export function useUpdateExtractedData() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.patch(`/documents/${id}/extracted-data`, { ai_extracted_data: data }).then(r => r.data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['documents'] })
      qc.invalidateQueries({ queryKey: ['suggest-journal', vars.id] })
    },
  })
}

export function useDeleteDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/documents/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
  })
}

export function useUpdateDocumentStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/documents/${id}/status`, { status }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
  })
}

export function useAttachDocumentToBill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ documentId, billId }: { documentId: string; billId: string }) =>
      api.post(`/documents/${documentId}/attach-to-bill`, { bill_id: billId }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] })
      qc.invalidateQueries({ queryKey: ['bills'] })
    },
  })
}

export function useCreateBillFromDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (documentId: string) =>
      api.post(`/documents/${documentId}/create-bill`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] })
      qc.invalidateQueries({ queryKey: ['bills'] })
    },
  })
}

export function useCategoriseDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (documentId: string) =>
      api.post(`/documents/${documentId}/categorise`).then(r => r.data),
    onSuccess: (_data, documentId) => {
      qc.invalidateQueries({ queryKey: ['documents'] })
      qc.invalidateQueries({ queryKey: ['suggest-journal', documentId] })
    },
  })
}

// Accounts
export function useAccounts(type?: string) {
  return useQuery<Account[]>({
    queryKey: ['accounts', type],
    queryFn: () => api.get('/accounts', { params: type ? { type } : {} }).then(r => r.data),
  })
}

// Password Reset
export function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string) => api.post('/auth/forgot-password', { email }).then(r => r.data),
  })
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (data: { token: string; new_password: string }) =>
      api.post('/auth/reset-password', data).then(r => r.data),
  })
}

// Org Settings
export function useOrgSettings() {
  return useQuery<{ currency: string; name: string; country: string; tax_regime: string; einvoice_enabled: boolean; einvoice_supplier_tin: string | null; einvoice_sandbox: boolean; sst_registration_no: string | null }>({
    queryKey: ['org-settings'],
    queryFn: () => api.get('/auth/org-settings').then(r => r.data),
  })
}

export function useUpdateCurrency() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (currency: string) => api.patch('/auth/org-settings/currency', { currency }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-settings'] }),
  })
}

// Billing
export function useBillingPlans() {
  return useQuery<BillingPlan[]>({
    queryKey: ['billing-plans'],
    queryFn: () => api.get('/billing/plans').then(r => r.data),
  })
}

export function useBillingUsage() {
  return useQuery<BillingUsage>({
    queryKey: ['billing-usage'],
    queryFn: () => api.get('/billing/usage').then(r => r.data),
  })
}

// ── Onboarding & Multi-org ──
export function useCompleteOnboarding() {
  const qc = useQueryClient()
  return useMutation<Organization, Error, OnboardingData>({
    mutationFn: (data) => api.post('/auth/onboarding', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-settings'] })
      qc.invalidateQueries({ queryKey: ['user-orgs'] })
    },
  })
}


// ── Firm / Practice ──
export function useFirmSettings() {
  return useQuery<FirmSettings>({
    queryKey: ['firm-settings'],
    queryFn: () => api.get('/firm/settings').then(r => r.data),
  })
}

export function useUpdateFirmSettings() {
  const qc = useQueryClient()
  return useMutation<FirmSettings, Error, Partial<FirmSettings>>({
    mutationFn: (data) => api.patch('/firm/settings', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['firm-settings'] }),
  })
}

export function useUploadFirmLogo() {
  const qc = useQueryClient()
  return useMutation<{ logo_url: string }, Error, File>({
    mutationFn: (file) => {
      const formData = new FormData()
      formData.append('file', file)
      return api.post('/firm/logo', formData, {
        headers: { 'Content-Type': undefined },
      }).then(r => r.data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['firm-settings'] }),
  })
}


export function useCheckSlug(slug: string) {
  return useQuery<SlugCheck>({
    queryKey: ['check-slug', slug],
    queryFn: () => api.get(`/firm/check-slug/${slug}`).then(r => r.data),
    enabled: slug.length >= 3,
  })
}

export function useFirmDashboard() {
  return useQuery<FirmDashboard>({
    queryKey: ['firm-dashboard'],
    queryFn: () => api.get('/firm/dashboard').then(r => r.data),
  })
}

export function useFirmClients(includeArchived?: boolean) {
  return useQuery<FirmClientOrg[]>({
    queryKey: ['firm-clients', includeArchived],
    queryFn: () => api.get('/firm/clients', { params: includeArchived ? { include_archived: true } : {} }).then(r => r.data),
  })
}

export function useInviteClient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { contact_name: string; business_name: string; email: string }) =>
      api.post('/firm/clients', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['firm-invitations'] })
      qc.invalidateQueries({ queryKey: ['firm-dashboard'] })
    },
  })
}

export function useFirmInvitations() {
  return useQuery<Array<{ id: string; email: string; contact_name: string; business_name: string; status: string; client_org_id: string | null; created_at: string; accepted_at: string | null }>>({
    queryKey: ['firm-invitations'],
    queryFn: () => api.get('/firm/invitations').then(r => r.data),
  })
}

export function useArchiveFirmClient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (clientId: string) => api.delete(`/firm/clients/${clientId}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['firm-clients'] })
      qc.invalidateQueries({ queryKey: ['firm-dashboard'] })
    },
  })
}

export function useRestoreFirmClient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (clientId: string) => api.post(`/firm/clients/${clientId}/restore`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['firm-clients'] })
      qc.invalidateQueries({ queryKey: ['firm-dashboard'] })
    },
  })
}

// ── Products ──
export function useProducts(activeOnly = true) {
  return useQuery<Array<{
    id: string; organization_id: string; code: string | null; name: string;
    description: string | null; product_type: string; unit: string | null;
    unit_price: number; cost_price: number; currency: string;
    tax_rate_id: string | null; income_account_id: string | null;
    expense_account_id: string | null; inventory_account_id: string | null;
    track_inventory: boolean; qty_on_hand: number; reorder_point: number | null;
    is_active: boolean; image_url: string | null; created_at: string; updated_at: string;
  }>>({
    queryKey: ['products', activeOnly],
    queryFn: () => api.get('/products', { params: { active_only: activeOnly } }).then(r => r.data),
  })
}

export function useCreateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/products', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })
}

export function useUpdateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      api.patch(`/products/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })
}

// ── Tax Rates ──
export function useTaxRates() {
  return useQuery<Array<{
    id: string; organization_id: string; name: string; code: string; rate: number;
    tax_type: string; is_default: boolean; is_active: boolean;
    sst_category: string | null; created_at: string;
  }>>({
    queryKey: ['tax-rates'],
    queryFn: () => api.get('/tax-rates').then(r => r.data),
  })
}

export function useCreateTaxRate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/tax-rates', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tax-rates'] }),
  })
}

export function useUpdateTaxRate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => api.patch(`/tax-rates/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tax-rates'] }),
  })
}

export function useDeleteTaxRate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/tax-rates/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tax-rates'] }),
  })
}

// ── Exchange Rates ──
export function useExchangeRates() {
  return useQuery<Array<{
    id: string; organization_id: string; from_currency: string; to_currency: string;
    rate: number; rate_date: string; source: string; created_at: string;
  }>>({
    queryKey: ['exchange-rates'],
    queryFn: () => api.get('/exchange-rates').then(r => r.data),
  })
}

export function useSyncExchangeRates() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('/exchange-rates/sync').then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exchange-rates'] }),
  })
}

export function useCreateExchangeRate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/exchange-rates', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exchange-rates'] }),
  })
}

// ── Manual Journals ──
export function useManualJournals(status?: string) {
  return useQuery<Array<{
    id: string; organization_id: string; journal_number: string; date: string;
    reference: string | null; description: string | null; status: string;
    currency: string; created_at: string;
    lines: Array<{ id: string; account_id: string; description: string | null; debit: number; credit: number; contact_id: string | null }>;
  }>>({
    queryKey: ['manual-journals', status],
    queryFn: () => api.get('/manual-journals', { params: status ? { status } : {} }).then(r => r.data),
  })
}

export function useCreateManualJournal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/manual-journals', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['manual-journals'] }),
  })
}

// ── Bank Rules ──
export function useBankRules() {
  return useQuery<Array<{
    id: string; organization_id: string; name: string; is_active: boolean; priority: number;
    conditions: Array<Record<string, string>>; condition_logic: string;
    action_account_id: string | null; action_contact_id: string | null;
    action_description: string | null; times_applied: number;
    last_applied_at: string | null; created_at: string;
  }>>({
    queryKey: ['bank-rules'],
    queryFn: () => api.get('/bank-rules').then(r => r.data),
  })
}

export function useCreateBankRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/bank-rules', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bank-rules'] }),
  })
}

// ── Vendor Credits ──
export function useVendorCredits(status?: string) {
  return useQuery<Array<{
    id: string; organization_id: string; vendor_credit_number: string; contact_id: string;
    bill_id: string | null; issue_date: string; status: string; currency: string;
    subtotal: number; tax_amount: number; total: number; amount_applied: number;
    notes: string | null; line_items: Array<Record<string, unknown>>; created_at: string;
  }>>({
    queryKey: ['vendor-credits', status],
    queryFn: () => api.get('/vendor-credits', { params: status ? { status } : {} }).then(r => r.data),
  })
}

export function useCreateVendorCredit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/vendor-credits', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendor-credits'] }),
  })
}

// ── Sale Receipts ──
export function useSaleReceipts(status?: string) {
  return useQuery<Array<{
    id: string; organization_id: string; receipt_number: string; contact_id: string | null;
    receipt_date: string; status: string; currency: string; subtotal: number;
    tax_amount: number; total: number; notes: string | null;
    line_items: Array<Record<string, unknown>>; payment_method: string;
    bank_account_id: string | null; created_at: string;
  }>>({
    queryKey: ['sale-receipts', status],
    queryFn: () => api.get('/sale-receipts', { params: status ? { status } : {} }).then(r => r.data),
  })
}

export function useCreateSaleReceipt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/sale-receipts', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sale-receipts'] }),
  })
}

// ── Recurring Invoices ──
export function useRecurringInvoices(status?: string) {
  return useQuery<Array<{
    id: string; organization_id: string; contact_id: string; status: string;
    frequency: string; frequency_interval: number; start_date: string;
    end_date: string | null; next_run_date: string; last_run_date: string | null;
    run_count: number; max_runs: number | null; currency: string; due_days: number;
    notes: string | null; line_items: Array<Record<string, unknown>>;
    tax_inclusive: boolean; auto_send: boolean; created_at: string;
  }>>({
    queryKey: ['recurring-invoices', status],
    queryFn: () => api.get('/recurring-invoices', { params: status ? { status } : {} }).then(r => r.data),
  })
}

export function useCreateRecurringInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/recurring-invoices', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring-invoices'] }),
  })
}

export function usePauseRecurringInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.patch(`/recurring-invoices/${id}/pause`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring-invoices'] }),
  })
}

export function useResumeRecurringInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.patch(`/recurring-invoices/${id}/resume`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring-invoices'] }),
  })
}

// Purchase Orders
export function usePurchaseOrders(status?: string) {
  return useQuery<PurchaseOrder[]>({
    queryKey: ['purchase-orders', status],
    queryFn: () => api.get('/purchase-orders', { params: status ? { status } : {} }).then(r => r.data),
  })
}

export function useCreatePurchaseOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/purchase-orders', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchase-orders'] }),
  })
}

// GRN
export function useGoodsReceivedNotes(status?: string) {
  return useQuery<GoodsReceivedNote[]>({
    queryKey: ['goods-received-notes', status],
    queryFn: () => api.get('/goods-received-notes', { params: status ? { status } : {} }).then(r => r.data),
  })
}

export function useCreateGoodsReceivedNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/goods-received-notes', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goods-received-notes'] }),
  })
}

// Bills
export function useCreateBill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/bills', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bills'] }),
  })
}

// Purchase Payments
export function usePurchasePayments() {
  return useQuery<PurchasePayment[]>({
    queryKey: ['purchase-payments'],
    queryFn: () => api.get('/purchase-payments').then(r => r.data),
  })
}

export function useCreatePurchasePayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/purchase-payments', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchase-payments'] }),
  })
}

// Purchase Refunds
export function usePurchaseRefunds() {
  return useQuery<PurchaseRefund[]>({
    queryKey: ['purchase-refunds'],
    queryFn: () => api.get('/purchase-refunds').then(r => r.data),
  })
}

export function useCreatePurchaseRefund() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/purchase-refunds', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchase-refunds'] }),
  })
}

// ── Single-entity fetch + update hooks for Edit pages ──

export function useInvoice(id: string | undefined) {
  return useQuery({ queryKey: ['invoice', id], queryFn: () => api.get(`/invoices/${id}`).then(r => r.data), enabled: !!id })
}
export function useUpdateInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => api.patch(`/invoices/${id}`, data).then(r => r.data),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['invoices'] }); qc.invalidateQueries({ queryKey: ['invoice', v.id] }) },
  })
}

export function useCreditNote(id: string | undefined) {
  return useQuery({ queryKey: ['credit-note', id], queryFn: () => api.get(`/credit-notes/${id}`).then(r => r.data), enabled: !!id })
}
export function useUpdateCreditNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => api.patch(`/credit-notes/${id}`, data).then(r => r.data),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['credit-notes'] }); qc.invalidateQueries({ queryKey: ['credit-note', v.id] }) },
  })
}

export function useDebitNote(id: string | undefined) {
  return useQuery({ queryKey: ['debit-note', id], queryFn: () => api.get(`/debit-notes/${id}`).then(r => r.data), enabled: !!id })
}
export function useUpdateDebitNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => api.patch(`/debit-notes/${id}`, data).then(r => r.data),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['debit-notes'] }); qc.invalidateQueries({ queryKey: ['debit-note', v.id] }) },
  })
}

export function useDeliveryOrder(id: string | undefined) {
  return useQuery({ queryKey: ['delivery-order', id], queryFn: () => api.get(`/delivery-orders/${id}`).then(r => r.data), enabled: !!id })
}
export function useUpdateDeliveryOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => api.patch(`/delivery-orders/${id}`, data).then(r => r.data),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['delivery-orders'] }); qc.invalidateQueries({ queryKey: ['delivery-order', v.id] }) },
  })
}

export function useSalesPayment(id: string | undefined) {
  return useQuery({ queryKey: ['sales-payment', id], queryFn: () => api.get(`/sales-payments/${id}`).then(r => r.data), enabled: !!id })
}
export function useUpdateSalesPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => api.patch(`/sales-payments/${id}`, data).then(r => r.data),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['sales-payments'] }); qc.invalidateQueries({ queryKey: ['sales-payment', v.id] }) },
  })
}

export function useSalesRefund(id: string | undefined) {
  return useQuery({ queryKey: ['sales-refund', id], queryFn: () => api.get(`/sales-refunds/${id}`).then(r => r.data), enabled: !!id })
}
export function useUpdateSalesRefund() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => api.patch(`/sales-refunds/${id}`, data).then(r => r.data),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['sales-refunds'] }); qc.invalidateQueries({ queryKey: ['sales-refund', v.id] }) },
  })
}

export function useRecurringInvoice(id: string | undefined) {
  return useQuery({ queryKey: ['recurring-invoice', id], queryFn: () => api.get(`/recurring-invoices/${id}`).then(r => r.data), enabled: !!id })
}
export function useUpdateRecurringInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => api.patch(`/recurring-invoices/${id}`, data).then(r => r.data),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['recurring-invoices'] }); qc.invalidateQueries({ queryKey: ['recurring-invoice', v.id] }) },
  })
}

export function useSaleReceipt(id: string | undefined) {
  return useQuery({ queryKey: ['sale-receipt', id], queryFn: () => api.get(`/sale-receipts/${id}`).then(r => r.data), enabled: !!id })
}
export function useUpdateSaleReceipt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => api.patch(`/sale-receipts/${id}`, data).then(r => r.data),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['sale-receipts'] }); qc.invalidateQueries({ queryKey: ['sale-receipt', v.id] }) },
  })
}

export function useBill(id: string | undefined) {
  return useQuery({ queryKey: ['bill', id], queryFn: () => api.get(`/bills/${id}`).then(r => r.data), enabled: !!id })
}
export function useUpdateBill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => api.patch(`/bills/${id}`, data).then(r => r.data),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['bills'] }); qc.invalidateQueries({ queryKey: ['bill', v.id] }) },
  })
}

export function usePurchaseOrder(id: string | undefined) {
  return useQuery({ queryKey: ['purchase-order', id], queryFn: () => api.get(`/purchase-orders/${id}`).then(r => r.data), enabled: !!id })
}
export function useUpdatePurchaseOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => api.patch(`/purchase-orders/${id}`, data).then(r => r.data),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['purchase-orders'] }); qc.invalidateQueries({ queryKey: ['purchase-order', v.id] }) },
  })
}

export function useGoodsReceivedNote(id: string | undefined) {
  return useQuery({ queryKey: ['goods-received-note', id], queryFn: () => api.get(`/goods-received-notes/${id}`).then(r => r.data), enabled: !!id })
}
export function useUpdateGoodsReceivedNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => api.patch(`/goods-received-notes/${id}`, data).then(r => r.data),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['goods-received-notes'] }); qc.invalidateQueries({ queryKey: ['goods-received-note', v.id] }) },
  })
}

export function useVendorCredit(id: string | undefined) {
  return useQuery({ queryKey: ['vendor-credit', id], queryFn: () => api.get(`/vendor-credits/${id}`).then(r => r.data), enabled: !!id })
}
export function useUpdateVendorCredit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => api.patch(`/vendor-credits/${id}`, data).then(r => r.data),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['vendor-credits'] }); qc.invalidateQueries({ queryKey: ['vendor-credit', v.id] }) },
  })
}

export function usePurchasePayment(id: string | undefined) {
  return useQuery({ queryKey: ['purchase-payment', id], queryFn: () => api.get(`/purchase-payments/${id}`).then(r => r.data), enabled: !!id })
}
export function useUpdatePurchasePayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => api.patch(`/purchase-payments/${id}`, data).then(r => r.data),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['purchase-payments'] }); qc.invalidateQueries({ queryKey: ['purchase-payment', v.id] }) },
  })
}

export function usePurchaseRefund(id: string | undefined) {
  return useQuery({ queryKey: ['purchase-refund', id], queryFn: () => api.get(`/purchase-refunds/${id}`).then(r => r.data), enabled: !!id })
}
export function useUpdatePurchaseRefund() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => api.patch(`/purchase-refunds/${id}`, data).then(r => r.data),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['purchase-refunds'] }); qc.invalidateQueries({ queryKey: ['purchase-refund', v.id] }) },
  })
}

export function useManualJournal(id: string | undefined) {
  return useQuery({ queryKey: ['manual-journal', id], queryFn: () => api.get(`/manual-journals/${id}`).then(r => r.data), enabled: !!id })
}
export function useUpdateManualJournal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => api.patch(`/manual-journals/${id}`, data).then(r => r.data),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['manual-journals'] }); qc.invalidateQueries({ queryKey: ['manual-journal', v.id] }) },
  })
}

export function useProduct(id: string | undefined) {
  return useQuery({ queryKey: ['product', id], queryFn: () => api.get(`/products/${id}`).then(r => r.data), enabled: !!id })
}

export function useBankAccounts() {
  return useQuery({ queryKey: ['bank-accounts'], queryFn: () => api.get('/bank-accounts').then(r => r.data) })
}
export function useBankAccount(id: string | undefined) {
  return useQuery({ queryKey: ['bank-account', id], queryFn: () => api.get(`/bank-accounts/${id}`).then(r => r.data), enabled: !!id })
}
export function useUpdateBankAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => api.patch(`/bank-accounts/${id}`, data).then(r => r.data),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['bank-accounts'] }); qc.invalidateQueries({ queryKey: ['bank-account', v.id] }) },
  })
}

export function useBankTransaction(id: string | undefined) {
  return useQuery({ queryKey: ['bank-transaction', id], queryFn: () => api.get(`/bank-transactions/${id}`).then(r => r.data), enabled: !!id })
}
export function useUpdateBankTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => api.patch(`/bank-transactions/${id}`, data).then(r => r.data),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['bank-transactions'] }); qc.invalidateQueries({ queryKey: ['bank-transaction', v.id] }) },
  })
}

export function useBankTransfer(id: string | undefined) {
  return useQuery({ queryKey: ['bank-transfer', id], queryFn: () => api.get(`/bank-transfers/${id}`).then(r => r.data), enabled: !!id })
}
export function useUpdateBankTransfer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => api.patch(`/bank-transfers/${id}`, data).then(r => r.data),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['bank-transfers'] }); qc.invalidateQueries({ queryKey: ['bank-transfer', v.id] }) },
  })
}

export function useStockAdjustment(id: string | undefined) {
  return useQuery({ queryKey: ['stock-adjustment', id], queryFn: () => api.get(`/stock-adjustments/${id}`).then(r => r.data), enabled: !!id })
}
export function useUpdateStockAdjustment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => api.patch(`/stock-adjustments/${id}`, data).then(r => r.data),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['stock-adjustments'] }); qc.invalidateQueries({ queryKey: ['stock-adjustment', v.id] }) },
  })
}

export function useStockTransfer(id: string | undefined) {
  return useQuery({ queryKey: ['stock-transfer', id], queryFn: () => api.get(`/stock-transfers/${id}`).then(r => r.data), enabled: !!id })
}
export function useUpdateStockTransfer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => api.patch(`/stock-transfers/${id}`, data).then(r => r.data),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['stock-transfers'] }); qc.invalidateQueries({ queryKey: ['stock-transfer', v.id] }) },
  })
}

export function useFixedAsset(id: string | undefined) {
  return useQuery({ queryKey: ['fixed-asset', id], queryFn: () => api.get(`/fixed-assets/${id}`).then(r => r.data), enabled: !!id })
}
export function useUpdateFixedAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => api.patch(`/fixed-assets/${id}`, data).then(r => r.data),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['fixed-assets'] }); qc.invalidateQueries({ queryKey: ['fixed-asset', v.id] }) },
  })
}

// Status-only update hooks for sales modules
export function useUpdateQuotationStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/quotations/${id}/status`, null, { params: { status } }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['quotations'] }) },
  })
}
export function useDeleteQuotation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/quotations/${id}`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['quotations'] }) },
  })
}
export function useUpdateSalesOrderStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/sales-orders/${id}/status`, null, { params: { status } }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sales-orders'] }) },
  })
}
export function useDeleteSalesOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/sales-orders/${id}`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sales-orders'] }) },
  })
}
export function useUpdateDeliveryOrderStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/delivery-orders/${id}/status`, null, { params: { status } }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['delivery-orders'] }) },
  })
}
export function useDeleteDeliveryOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/delivery-orders/${id}`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['delivery-orders'] }) },
  })
}
export function useUpdateCreditNoteStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/credit-notes/${id}/status`, null, { params: { status } }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['credit-notes'] }) },
  })
}
export function useDeleteCreditNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/credit-notes/${id}`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['credit-notes'] }) },
  })
}
export function useUpdateDebitNoteStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/debit-notes/${id}/status`, null, { params: { status } }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['debit-notes'] }) },
  })
}
export function useDeleteDebitNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/debit-notes/${id}`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['debit-notes'] }) },
  })
}
export function useUpdateSalesPaymentStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/sales-payments/${id}/status`, null, { params: { status } }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sales-payments'] }) },
  })
}
export function useDeleteSalesPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/sales-payments/${id}`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sales-payments'] }) },
  })
}
export function useUpdateSalesRefundStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/sales-refunds/${id}/status`, null, { params: { status } }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sales-refunds'] }) },
  })
}
export function useDeleteSalesRefund() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/sales-refunds/${id}`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sales-refunds'] }) },
  })
}
export function useUpdateInvoiceStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/invoices/${id}/status`, null, { params: { status } }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoices'] }) },
  })
}
export function useDeleteInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/invoices/${id}`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoices'] }) },
  })
}
export function useUpdateBillStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/bills/${id}/status`, null, { params: { status } }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bills'] }) },
  })
}
export function useDeleteBill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/bills/${id}`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bills'] }) },
  })
}
export function useDeleteGRN() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/goods-received-notes/${id}`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['goods-received-notes'] }) },
  })
}
export function useDeleteVendorCredit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/vendor-credits/${id}`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vendor-credits'] }) },
  })
}
export function useDeleteRecurringInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/recurring-invoices/${id}`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recurring-invoices'] }) },
  })
}
