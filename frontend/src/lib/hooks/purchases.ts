import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../api'
import type { Bill, PurchaseOrder, GoodsReceivedNote, PurchasePayment, PurchaseRefund } from '../../types'
import { makeActivityHook, type InvoiceActivityEvent } from './_shared'

// Bills
export function useBills(status?: string) {
  return useQuery<Bill[]>({
    queryKey: ['bills', status],
    queryFn: () => api.get('/bills', { params: status ? { status } : {} }).then(r => r.data),
  })
}

export function useCreateBill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/bills', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bills'] }),
  })
}

// ── Purchase Credit Notes ──
export function usePurchaseCreditNotes(status?: string) {
  return useQuery<Array<{
    id: string; organization_id: string; pcn_number: string; contact_id: string;
    bill_id: string | null; issue_date: string; reference: string | null; status: string; currency: string;
    subtotal: number; discount_amount: number; tax_amount: number; total: number; credit_applied: number;
    notes: string | null; line_items: Array<Record<string, unknown>>; created_at: string;
  }>>({
    queryKey: ['purchase-credit-notes', status],
    queryFn: () => api.get('/purchase-credit-notes', { params: status ? { status } : {} }).then(r => r.data),
  })
}
export const useVendorCredits = usePurchaseCreditNotes

export function useCreatePurchaseCreditNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/purchase-credit-notes', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchase-credit-notes'] }),
  })
}

// Purchase Orders
export function usePurchaseOrders(status?: string) {
  return useQuery<PurchaseOrder[]>({
    queryKey: ['purchase-orders', status],
    queryFn: () => api.get('/purchase-orders', { params: status ? { status } : {} }).then(r => r.data),
  })
}

export function useCreatePurchaseOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/purchase-orders', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchase-orders'] }),
  })
}

// GRN
export function useGoodsReceivedNotes(status?: string) {
  return useQuery<GoodsReceivedNote[]>({
    queryKey: ['goods-received-notes', status],
    queryFn: () => api.get('/goods-received-notes', { params: status ? { status } : {} }).then(r => r.data),
  })
}

export function useCreateGoodsReceivedNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/goods-received-notes', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goods-received-notes'] }),
  })
}

// Purchase Payments
export function usePurchasePayments() {
  return useQuery<PurchasePayment[]>({
    queryKey: ['purchase-payments'],
    queryFn: () => api.get('/purchase-payments').then(r => r.data),
  })
}

export function useCreatePurchasePayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/purchase-payments', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-payments'] })
      qc.invalidateQueries({ queryKey: ['bills'] })
      qc.invalidateQueries({ queryKey: ['purchase-debit-notes'] })
    },
  })
}

// Purchase Refunds
export function usePurchaseRefunds() {
  return useQuery<PurchaseRefund[]>({
    queryKey: ['purchase-refunds'],
    queryFn: () => api.get('/purchase-refunds').then(r => r.data),
  })
}

export function useCreatePurchaseRefund() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/purchase-refunds', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-refunds'] })
      qc.invalidateQueries({ queryKey: ['purchase-credit-notes'] })
      qc.invalidateQueries({ queryKey: ['bills'] })
    },
  })
}

// Bill activity
export function useBillActivity(id: string | undefined) {
  return useQuery<{
    bill_id: string
    bill_number: string
    total: number
    outstanding: number
    events: InvoiceActivityEvent[]
  }>({
    queryKey: ['bill-activity', id],
    queryFn: () => api.get(`/bills/${id}/activity`).then(r => r.data),
    enabled: !!id,
  })
}

export const usePurchaseOrderActivity = makeActivityHook('purchase-orders', 'purchase-order-activity')
export const usePurchasePaymentActivity = makeActivityHook('purchase-payments', 'purchase-payment-activity')
export const usePurchaseRefundActivity = makeActivityHook('purchase-refunds', 'purchase-refund-activity')
export const usePurchaseDebitNoteActivity = makeActivityHook('purchase-debit-notes', 'purchase-debit-note-activity')
export const useGRNActivity = makeActivityHook('goods-received-notes', 'grn-activity')

// ── Single-entity fetch + update hooks ──
export function useBill(id: string | undefined) {
  return useQuery({ queryKey: ['bill', id], queryFn: () => api.get(`/bills/${id}`).then(r => r.data), enabled: !!id })
}
export function useUpdateBill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => api.patch(`/bills/${id}`, data).then(r => r.data),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['bills'] }); qc.invalidateQueries({ queryKey: ['bill', v.id] }) },
  })
}

export function usePurchaseOrder(id: string | undefined) {
  return useQuery({ queryKey: ['purchase-order', id], queryFn: () => api.get(`/purchase-orders/${id}`).then(r => r.data), enabled: !!id })
}
export function useUpdatePurchaseOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => api.patch(`/purchase-orders/${id}`, data).then(r => r.data),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['purchase-orders'] }); qc.invalidateQueries({ queryKey: ['purchase-order', v.id] }) },
  })
}

export function useGoodsReceivedNote(id: string | undefined) {
  return useQuery({ queryKey: ['goods-received-note', id], queryFn: () => api.get(`/goods-received-notes/${id}`).then(r => r.data), enabled: !!id })
}
export function useUpdateGoodsReceivedNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => api.patch(`/goods-received-notes/${id}`, data).then(r => r.data),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['goods-received-notes'] }); qc.invalidateQueries({ queryKey: ['goods-received-note', v.id] }) },
  })
}

export function usePurchaseCreditNote(id: string | undefined) {
  return useQuery({ queryKey: ['purchase-credit-note', id], queryFn: () => api.get(`/purchase-credit-notes/${id}`).then(r => r.data), enabled: !!id })
}
export const useVendorCredit = usePurchaseCreditNote

export function useUpdatePurchaseCreditNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => api.patch(`/purchase-credit-notes/${id}`, data).then(r => r.data),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['purchase-credit-notes'] }); qc.invalidateQueries({ queryKey: ['purchase-credit-note', v.id] }) },
  })
}
export const useUpdateVendorCredit = useUpdatePurchaseCreditNote

export function usePurchasePayment(id: string | undefined) {
  return useQuery({ queryKey: ['purchase-payment', id], queryFn: () => api.get(`/purchase-payments/${id}`).then(r => r.data), enabled: !!id })
}
export function useUpdatePurchasePayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => api.patch(`/purchase-payments/${id}`, data).then(r => r.data),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['purchase-payments'] }); qc.invalidateQueries({ queryKey: ['purchase-payment', v.id] }) },
  })
}

export function usePurchaseRefund(id: string | undefined) {
  return useQuery({ queryKey: ['purchase-refund', id], queryFn: () => api.get(`/purchase-refunds/${id}`).then(r => r.data), enabled: !!id })
}
export function useUpdatePurchaseRefund() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => api.patch(`/purchase-refunds/${id}`, data).then(r => r.data),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['purchase-refunds'] }); qc.invalidateQueries({ queryKey: ['purchase-refund', v.id] }) },
  })
}

// Purchase Debit Notes
export function usePurchaseDebitNotes(status?: string) {
  return useQuery<any[]>({
    queryKey: ['purchase-debit-notes', status],
    queryFn: () => api.get('/purchase-debit-notes', { params: status ? { status } : {} }).then(r => r.data),
  })
}
export function usePurchaseDebitNote(id: string | undefined) {
  return useQuery({ queryKey: ['purchase-debit-note', id], queryFn: () => api.get(`/purchase-debit-notes/${id}`).then(r => r.data), enabled: !!id })
}
export function useCreatePurchaseDebitNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/purchase-debit-notes', data).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase-debit-notes'] }) },
  })
}
export function useUpdatePurchaseDebitNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => api.patch(`/purchase-debit-notes/${id}`, data).then(r => r.data),
    onSuccess: (_d: any, v: any) => { qc.invalidateQueries({ queryKey: ['purchase-debit-notes'] }); qc.invalidateQueries({ queryKey: ['purchase-debit-note', v.id] }) },
  })
}
export function useUpdatePurchaseDebitNoteStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/purchase-debit-notes/${id}/status`, null, { params: { status } }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase-debit-notes'] }) },
  })
}
export function useDeletePurchaseDebitNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/purchase-debit-notes/${id}`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase-debit-notes'] }) },
  })
}

// Bill / GRN status + delete
export function useUpdateBillStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/bills/${id}/status`, null, { params: { status } }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bills'] }) },
  })
}
export function useDeleteBill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/bills/${id}`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bills'] }) },
  })
}
export function useDeleteGRN() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/goods-received-notes/${id}`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['goods-received-notes'] }) },
  })
}

// Purchase credit note: delete, applications, status
export function useDeletePurchaseCreditNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/purchase-credit-notes/${id}`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase-credit-notes'] }) },
  })
}
export const useDeleteVendorCredit = useDeletePurchaseCreditNote

export function useApplyPurchaseCredit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ pcnId, billId, amount }: { pcnId: string; billId: string; amount: number }) =>
      api.post(`/purchase-credit-notes/${pcnId}/applications`, null, { params: { bill_id: billId, amount } }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-credit-notes'] })
      qc.invalidateQueries({ queryKey: ['bills'] })
    },
  })
}

export function useRemovePurchaseCreditApplications() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (pcnId: string) => api.delete(`/purchase-credit-notes/${pcnId}/applications`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-credit-notes'] })
      qc.invalidateQueries({ queryKey: ['bills'] })
    },
  })
}

export function useRemoveSinglePurchaseCreditApplication() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ pcnId, appId }: { pcnId: string; appId: string }) =>
      api.delete(`/purchase-credit-notes/${pcnId}/applications/${appId}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-credit-notes'] })
      qc.invalidateQueries({ queryKey: ['bills'] })
    },
  })
}

export function useUpdatePurchaseCreditNoteStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/purchase-credit-notes/${id}/status`, null, { params: { status } }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase-credit-notes'] }) },
  })
}
