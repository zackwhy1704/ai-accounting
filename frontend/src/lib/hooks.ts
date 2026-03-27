import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './api'
import type { Invoice, Bill, Contact, Document, DashboardData, Account, BillingUsage, BillingPlan, Organization, UserOrgMembership, OnboardingData, FirmSettings, FirmClientOrg, FirmDashboard, SlugCheck } from '../types'

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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
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
  return useQuery<{ currency: string; name: string }>({
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

export function useUserOrganizations() {
  return useQuery<UserOrgMembership[]>({
    queryKey: ['user-orgs'],
    queryFn: () => api.get('/auth/organizations').then(r => r.data),
  })
}

export function useSwitchOrg() {
  const qc = useQueryClient()
  return useMutation<{ access_token: string }, Error, string>({
    mutationFn: (organization_id) =>
      api.post('/auth/switch-org', { organization_id }).then(r => r.data),
    onSuccess: (data) => {
      localStorage.setItem('access_token', data.access_token)
      qc.invalidateQueries()
    },
  })
}

export function useCreateOrg() {
  const qc = useQueryClient()
  return useMutation<Organization, Error, { name: string; org_type?: string; country?: string; currency?: string; industry?: string }>({
    mutationFn: (data) => api.post('/auth/organizations', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-orgs'] }),
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

export function useUploadFirmFavicon() {
  const qc = useQueryClient()
  return useMutation<{ favicon_url: string }, Error, File>({
    mutationFn: (file) => {
      const formData = new FormData()
      formData.append('file', file)
      return api.post('/firm/favicon', formData, {
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
