import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import api from '../api'
import type { Contact } from '../../types'
import type { Paginated, ListParams } from './_shared'

// Contacts — paginated. Existing signature filters by `type` (not status),
// so a custom wrapper preserves that semantics. data stays Contact[].
export function useContacts(type?: string) {
  return useQuery<Paginated<Contact>, Error, Contact[]>({
    queryKey: ['contacts', type],
    queryFn: () => api.get('/contacts', { params: type ? { type } : {} }).then(r => r.data),
    select: (d: any) => (Array.isArray(d) ? d : d.items),
    placeholderData: keepPreviousData,
  })
}
export function useContactsPage(params?: ListParams & { type?: string }) {
  const p = params ?? {}
  return useQuery<Paginated<Contact>>({
    queryKey: ['contacts', 'page', p],
    queryFn: () => api.get('/contacts', { params: p }).then(r => {
      const d = r.data
      return Array.isArray(d) ? { items: d, total: d.length, page: 1, limit: d.length || 1, pages: 1 } : d
    }),
    placeholderData: keepPreviousData,
  })
}

export function useCreateContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/contacts', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  })
}

export function useContact(id: string | undefined) {
  return useQuery({
    queryKey: ['contact', id],
    queryFn: () => api.get(`/contacts/${id}`).then(r => r.data),
    enabled: !!id,
  })
}

export function useUpdateContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; [key: string]: unknown }) =>
      api.patch(`/contacts/${id}`, data).then(r => r.data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['contacts'] })
      qc.invalidateQueries({ queryKey: ['contact', vars.id] })
    },
  })
}
