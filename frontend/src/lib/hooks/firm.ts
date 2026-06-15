import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../api'
import type { FirmSettings, FirmClientOrg, FirmDashboard, SlugCheck } from '../../types'

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
