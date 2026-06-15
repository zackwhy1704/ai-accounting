import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../api'
import type { BillingUsage, BillingPlan } from '../../types'

// Billing
export function useBillingPlans(currency?: string) {
  return useQuery<BillingPlan[]>({
    queryKey: ['billing-plans', currency],
    queryFn: () => api.get('/billing/plans', { params: currency ? { currency } : {} }).then(r => r.data),
  })
}

export interface BillingAddon {
  id: string
  name: string
  extra_scans: number | string
  price: number
  currency: string
}

export function useBillingAddons(currency?: string) {
  return useQuery<BillingAddon[]>({
    queryKey: ['billing-addons', currency],
    queryFn: () => api.get('/billing/addons', { params: currency ? { currency } : {} }).then(r => r.data),
  })
}

export function useCreateCheckout() {
  return useMutation({
    mutationFn: (body: { plan?: string; addon?: string; currency?: string }) =>
      api.post('/billing/checkout', null, { params: body }).then(r => r.data),
  })
}

export function useAddAddon() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { addon: string; currency: string }) =>
      api.post('/billing/addon', null, { params: body }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['billing-usage'] }),
  })
}

export function useBillingUsage() {
  return useQuery<BillingUsage>({
    queryKey: ['billing-usage'],
    queryFn: () => api.get('/billing/usage').then(r => r.data),
  })
}
