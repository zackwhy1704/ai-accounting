import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import api from '../api'
import type { Account } from '../../types'
import { makeListHook, type Paginated, type ListParams } from './_shared'

// Accounts — paginated. Note: the existing call signature filters by `type`
// (not status), so a custom wrapper preserves that semantics. data is Account[].
export function useAccounts(type?: string) {
  return useQuery<Paginated<Account>, Error, Account[]>({
    queryKey: ['accounts', type],
    queryFn: () => api.get('/accounts', { params: type ? { type } : {} }).then(r => r.data),
    select: (d: any) => (Array.isArray(d) ? d : d.items),
    placeholderData: keepPreviousData,
  })
}
export function useAccountsPage(params?: ListParams & { type?: string }) {
  const p = params ?? {}
  return useQuery<Paginated<Account>>({
    queryKey: ['accounts', 'page', p],
    queryFn: () => api.get('/accounts', { params: p }).then(r => {
      const d = r.data
      return Array.isArray(d) ? { items: d, total: d.length, page: 1, limit: d.length || 1, pages: 1 } : d
    }),
    placeholderData: keepPreviousData,
  })
}

// ── Tax Rates ──
type TaxRate = {
  id: string; organization_id: string; name: string; code: string; rate: number;
  tax_type: string; is_default: boolean; is_active: boolean;
  sst_category: string | null; created_at: string;
}
const _taxRates = makeListHook<TaxRate>('/tax-rates', 'tax-rates')
export function useTaxRates(arg?: string | ListParams) { return _taxRates.useList(arg) }
export function useTaxRatesPage(params?: ListParams) { return _taxRates.usePage(params) }

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
type ExchangeRate = {
  id: string; organization_id: string; from_currency: string; to_currency: string;
  rate: number; rate_date: string; source: string; created_at: string;
}
const _exchangeRates = makeListHook<ExchangeRate>('/exchange-rates', 'exchange-rates')
export function useExchangeRates(arg?: string | ListParams) { return _exchangeRates.useList(arg) }
export function useExchangeRatesPage(params?: ListParams) { return _exchangeRates.usePage(params) }

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
type ManualJournal = {
  id: string; organization_id: string; journal_number: string; date: string;
  reference: string | null; description: string | null; status: string;
  currency: string; created_at: string;
  lines: Array<{ id: string; account_id: string; description: string | null; debit: number; credit: number; contact_id: string | null }>;
}
const _manualJournals = makeListHook<ManualJournal>('/manual-journals', 'manual-journals')
export function useManualJournals(arg?: string | ListParams) { return _manualJournals.useList(arg) }
export function useManualJournalsPage(params?: ListParams) { return _manualJournals.usePage(params) }

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
