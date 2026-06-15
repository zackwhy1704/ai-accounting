import { useQuery, keepPreviousData } from '@tanstack/react-query'
import api from '../api'

/** Paginated list response envelope returned by paginated backend endpoints. */
export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  limit: number
  pages: number
}

/** Params accepted by paginated list hooks. All optional. */
export interface ListParams {
  page?: number
  limit?: number
  search?: string
  status?: string
  contact_id?: string
  sort_by?: string
  sort_order?: 'asc' | 'desc'
  date_from?: string
  date_to?: string
}

/**
 * Build a list hook that is backward-compatible: the returned `data` is the
 * plain T[] array (via select on the envelope), so existing array consumers
 * keep working. Use useXxxPage() siblings when you need total/pages.
 */
export function makeListHook<T>(path: string, key: string) {
  function useList(arg?: string | ListParams) {
    const params: ListParams = typeof arg === 'string' ? { status: arg } : (arg ?? {})
    return useQuery<Paginated<T>, Error, T[]>({
      queryKey: [key, params],
      queryFn: () => api.get(path, { params }).then(r => r.data),
      // Backend may return a bare array (un-paginated endpoints) or an envelope.
      select: (d: any) => (Array.isArray(d) ? d : d.items),
      placeholderData: keepPreviousData,
    })
  }
  function usePage(arg?: ListParams) {
    const params: ListParams = arg ?? {}
    return useQuery<Paginated<T>>({
      queryKey: [key, 'page', params],
      queryFn: () => api.get(path, { params }).then(r => {
        const d = r.data
        return Array.isArray(d)
          ? { items: d, total: d.length, page: 1, limit: d.length || 1, pages: 1 }
          : d
      }),
      placeholderData: keepPreviousData,
    })
  }
  return { useList, usePage }
}

export interface InvoiceActivityEvent {
  ts: string | null
  type: 'issued' | 'credit_note' | 'debit_note' | 'payment' | 'refund' | 'journal'
  subtype?: string
  ref: string
  ref_id: string
  delta: number
  balance: number
  note: string
  status?: string
  lines?: Array<{ account_code: string; account_name: string; debit: number; credit: number }>
}

export interface AdjustmentLine {
  account_id: string
  debit: number
  credit: number
}

export function makeActivityHook(endpoint: string, key: string) {
  return function useActivity(id: string | undefined) {
    return useQuery<{ total: number; events: InvoiceActivityEvent[] }>({
      queryKey: [key, id],
      queryFn: () => api.get(`/${endpoint}/${id}/activity`).then(r => r.data),
      enabled: !!id,
    })
  }
}
