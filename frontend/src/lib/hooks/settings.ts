import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../api'
import type { OnboardingData, Organization } from '../../types'

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
