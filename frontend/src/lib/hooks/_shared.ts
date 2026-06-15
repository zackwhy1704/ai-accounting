import { useQuery } from '@tanstack/react-query'
import api from '../api'

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
