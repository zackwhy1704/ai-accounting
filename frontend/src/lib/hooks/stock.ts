import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../api'

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
