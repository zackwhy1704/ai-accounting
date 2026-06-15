import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import api from '../api'
import type { Document } from '../../types'
import type { Paginated, ListParams } from './_shared'

// Documents — paginated. Custom wrapper because of the auto-poll refetchInterval.
// data stays Document[] (via select); refetchInterval inspects the raw envelope.
export function useDocuments(params?: ListParams) {
  const p = params ?? {}
  return useQuery<Paginated<Document>, Error, Document[]>({
    queryKey: ['documents', p],
    queryFn: () => api.get('/documents', { params: p }).then(r => r.data),
    select: (d: any) => (Array.isArray(d) ? d : d.items),
    placeholderData: keepPreviousData,
    // Auto-poll every 3s while any document is still processing
    refetchInterval: (query) => {
      const d: any = query.state.data
      const docs: Document[] | undefined = Array.isArray(d) ? d : d?.items
      if (docs?.some(doc => doc.status === 'processing')) return 3000
      return false
    },
  })
}
export function useDocumentsPage(params?: ListParams) {
  const p = params ?? {}
  return useQuery<Paginated<Document>>({
    queryKey: ['documents', 'page', p],
    queryFn: () => api.get('/documents', { params: p }).then(r => {
      const d = r.data
      return Array.isArray(d) ? { items: d, total: d.length, page: 1, limit: d.length || 1, pages: 1 } : d
    }),
    placeholderData: keepPreviousData,
  })
}

export function useUploadDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      return api.post('/documents', formData, {
        headers: { 'Content-Type': undefined },
        timeout: 120000,
      }).then(r => r.data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
  })
}

export function useUpdateExtractedData() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.patch(`/documents/${id}/extracted-data`, { ai_extracted_data: data }).then(r => r.data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['documents'] })
      qc.invalidateQueries({ queryKey: ['suggest-journal', vars.id] })
    },
  })
}

export function useDeleteDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/documents/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
  })
}

export function useUpdateDocumentStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/documents/${id}/status`, { status }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
  })
}

export function useAttachDocumentToBill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ documentId, billId }: { documentId: string; billId: string }) =>
      api.post(`/documents/${documentId}/attach-to-bill`, { bill_id: billId }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] })
      qc.invalidateQueries({ queryKey: ['bills'] })
    },
  })
}

export function useCreateBillFromDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (documentId: string) =>
      api.post(`/documents/${documentId}/create-bill`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] })
      qc.invalidateQueries({ queryKey: ['bills'] })
    },
  })
}

export function useCategoriseDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (documentId: string) =>
      api.post(`/documents/${documentId}/categorise`).then(r => r.data),
    onSuccess: (_data, documentId) => {
      qc.invalidateQueries({ queryKey: ['documents'] })
      qc.invalidateQueries({ queryKey: ['suggest-journal', documentId] })
    },
  })
}
