import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './api'
import type { Invoice, Bill, Contact, Document, DashboardData, Account, BillingUsage, BillingPlan } from '../types'

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
