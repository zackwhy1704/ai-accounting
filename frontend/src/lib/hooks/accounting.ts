import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../api'
import type { Account } from '../../types'

// Accounts
export function useAccounts(type?: string) {
  return useQuery<Account[]>({
    queryKey: ['accounts', type],
    queryFn: () => api.get('/accounts', { params: type ? { type } : {} }).then(r => r.data),
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

// Fixed Assets
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
