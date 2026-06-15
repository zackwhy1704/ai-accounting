import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../api'

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
