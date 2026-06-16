import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../api'
import type { Invoice, Quotation, DeliveryOrder, CreditNote, DebitNote, SalesPayment, SalesRefund } from '../../types'
import { makeActivityHook, makeListHook, type InvoiceActivityEvent, type AdjustmentLine, type ListParams, type JournalEntryGroup } from './_shared'

// Invoices — paginated + searchable. useInvoices() returns Invoice[] (back-compat,
// accepts a status string or a ListParams object); useInvoicesPage() returns the
// {items,total,page,pages} envelope for pagination UI.
const _invoices = makeListHook<Invoice>('/invoices', 'invoices')
export function useInvoices(arg?: string | ListParams) { return _invoices.useList(arg) }
export function useInvoicesPage(params?: ListParams) { return _invoices.usePage(params) }

export function useCreateInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/invoices', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  })
}

// Quotations
const _quotations = makeListHook<Quotation>('/quotations', 'quotations')
export function useQuotations(arg?: string | ListParams) { return _quotations.useList(arg) }
export function useQuotationsPage(params?: ListParams) { return _quotations.usePage(params) }

export function useQuotation(id: string | undefined) {
  return useQuery({
    queryKey: ['quotation', id],
    queryFn: () => api.get(`/quotations/${id}`).then(r => r.data),
    enabled: !!id,
  })
}

export function useCreateQuotation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/quotations', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quotations'] }),
  })
}

export function useUpdateQuotation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => api.patch(`/quotations/${id}`, data).then(r => r.data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['quotations'] })
      qc.invalidateQueries({ queryKey: ['quotation', vars.id] })
    },
  })
}

export function useConvertQuotation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, targets }: { id: string; targets: string[] }) => api.post(`/quotations/${id}/convert`, { targets }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotations'] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['delivery-orders'] })
    },
  })
}

// Delivery Orders
const _deliveryOrders = makeListHook<DeliveryOrder>('/delivery-orders', 'delivery-orders')
export function useDeliveryOrders(arg?: string | ListParams) { return _deliveryOrders.useList(arg) }
export function useDeliveryOrdersPage(params?: ListParams) { return _deliveryOrders.usePage(params) }

export function useCreateDeliveryOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/delivery-orders', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['delivery-orders'] }),
  })
}

// Credit Notes
const _creditNotes = makeListHook<CreditNote>('/credit-notes', 'credit-notes')
export function useCreditNotes(arg?: string | ListParams) { return _creditNotes.useList(arg) }
export function useCreditNotesPage(params?: ListParams) { return _creditNotes.usePage(params) }

export function useCreateCreditNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/credit-notes', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credit-notes'] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
    },
  })
}

// Debit Notes
const _debitNotes = makeListHook<DebitNote>('/debit-notes', 'debit-notes')
export function useDebitNotes(arg?: string | ListParams) { return _debitNotes.useList(arg) }
export function useDebitNotesPage(params?: ListParams) { return _debitNotes.usePage(params) }

export function useCreateDebitNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/debit-notes', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['debit-notes'] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
    },
  })
}

// Sales Payments
const _salesPayments = makeListHook<SalesPayment>('/sales-payments', 'sales-payments')
export function useSalesPayments(arg?: string | ListParams) { return _salesPayments.useList(arg) }
export function useSalesPaymentsPage(params?: ListParams) { return _salesPayments.usePage(params) }

export function useCreateSalesPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/sales-payments', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-payments'] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
    },
  })
}

// Sales Refunds
const _salesRefunds = makeListHook<SalesRefund>('/sales-refunds', 'sales-refunds')
export function useSalesRefunds(arg?: string | ListParams) { return _salesRefunds.useList(arg) }
export function useSalesRefundsPage(params?: ListParams) { return _salesRefunds.usePage(params) }

export function useCreateSalesRefund() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/sales-refunds', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-refunds'] })
      qc.invalidateQueries({ queryKey: ['credit-notes'] })
    },
  })
}

// ── Sale Receipts ──
type SaleReceipt = {
  id: string; organization_id: string; receipt_number: string; contact_id: string | null;
  receipt_date: string; status: string; currency: string; subtotal: number;
  tax_amount: number; total: number; notes: string | null;
  line_items: Array<Record<string, unknown>>; payment_method: string;
  bank_account_id: string | null; created_at: string;
}
const _saleReceipts = makeListHook<SaleReceipt>('/sale-receipts', 'sale-receipts')
export function useSaleReceipts(arg?: string | ListParams) { return _saleReceipts.useList(arg) }
export function useSaleReceiptsPage(params?: ListParams) { return _saleReceipts.usePage(params) }

export function useCreateSaleReceipt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/sale-receipts', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sale-receipts'] }),
  })
}

// ── Recurring Invoices ──
type RecurringInvoice = {
  id: string; organization_id: string; contact_id: string; status: string;
  frequency: string; frequency_interval: number; start_date: string;
  end_date: string | null; next_run_date: string; last_run_date: string | null;
  run_count: number; max_runs: number | null; currency: string; due_days: number;
  notes: string | null; line_items: Array<Record<string, unknown>>;
  tax_inclusive: boolean; auto_send: boolean; created_at: string;
}
const _recurringInvoices = makeListHook<RecurringInvoice>('/recurring-invoices', 'recurring-invoices')
export function useRecurringInvoices(arg?: string | ListParams) { return _recurringInvoices.useList(arg) }
export function useRecurringInvoicesPage(params?: ListParams) { return _recurringInvoices.usePage(params) }

export function useCreateRecurringInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/recurring-invoices', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring-invoices'] }),
  })
}

export function usePauseRecurringInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.patch(`/recurring-invoices/${id}/pause`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring-invoices'] }),
  })
}

export function useResumeRecurringInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.patch(`/recurring-invoices/${id}/resume`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring-invoices'] }),
  })
}

export function useRunRecurringInvoiceNow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post(`/recurring-invoices/${id}/run-now`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring-invoices'] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
    },
  })
}

export function useRunDueRecurringInvoices() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post(`/recurring-invoices/run-due`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring-invoices'] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
    },
  })
}

// ── Single-entity fetch + update hooks for Edit pages ──
export function useInvoice(id: string | undefined) {
  return useQuery({ queryKey: ['invoice', id], queryFn: () => api.get(`/invoices/${id}`).then(r => r.data), enabled: !!id })
}

export function useCreateAdjustment(entity: 'invoices' | 'bills') {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ parent_id, ...body }: { parent_id: string; date: string; description: string; reference?: string; lines: AdjustmentLine[] }) =>
      api.post(`/${entity}/${parent_id}/adjustments`, body).then(r => r.data),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: [entity === 'invoices' ? 'invoice-activity' : 'bill-activity', v.parent_id] })
    },
  })
}

export function useDeleteAdjustment(entity: 'invoices' | 'bills') {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (txn_id: string) => api.delete(`/adjustments/${txn_id}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [entity === 'invoices' ? 'invoice-activity' : 'bill-activity'] })
    },
  })
}

export function useInvoiceActivity(id: string | undefined) {
  return useQuery<{
    invoice_id: string
    invoice_number: string
    total: number
    outstanding: number
    events: InvoiceActivityEvent[]
  }>({
    queryKey: ['invoice-activity', id],
    queryFn: () => api.get(`/invoices/${id}/activity`).then(r => r.data),
    enabled: !!id,
  })
}

export function useInvoiceJournalEntries(id: string | undefined) {
  return useQuery<{ invoice_id: string; journal_entries: JournalEntryGroup[] }>({
    queryKey: ['invoice-journal-entries', id],
    queryFn: () => api.get(`/invoices/${id}/journal-entries`).then(r => r.data),
    enabled: !!id,
  })
}

export function useCreditNoteJournalEntries(id: string | undefined) {
  return useQuery<{ credit_note_id: string; journal_entries: JournalEntryGroup[] }>({
    queryKey: ['credit-note-journal-entries', id],
    queryFn: () => api.get(`/credit-notes/${id}/journal-entries`).then(r => r.data),
    enabled: !!id,
  })
}

export const useQuotationActivity = makeActivityHook('quotations', 'quotation-activity')
export const useDeliveryOrderActivity = makeActivityHook('delivery-orders', 'delivery-order-activity')
export const useCreditNoteActivity = makeActivityHook('credit-notes', 'credit-note-activity')
export const useDebitNoteActivity = makeActivityHook('debit-notes', 'debit-note-activity')
export const useSalesPaymentActivity = makeActivityHook('sales-payments', 'sales-payment-activity')
export const useSalesRefundActivity = makeActivityHook('sales-refunds', 'sales-refund-activity')
export const useRecurringInvoiceActivity = makeActivityHook('recurring-invoices', 'recurring-invoice-activity')
export const useSaleReceiptActivity = makeActivityHook('sale-receipts', 'sale-receipt-activity')

export function useUpdateInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => api.patch(`/invoices/${id}`, data).then(r => r.data),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['invoices'] }); qc.invalidateQueries({ queryKey: ['invoice', v.id] }) },
  })
}

export function useCreditNote(id: string | undefined) {
  return useQuery({ queryKey: ['credit-note', id], queryFn: () => api.get(`/credit-notes/${id}`).then(r => r.data), enabled: !!id })
}
export function useUpdateCreditNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => api.patch(`/credit-notes/${id}`, data).then(r => r.data),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['credit-notes'] }); qc.invalidateQueries({ queryKey: ['credit-note', v.id] }) },
  })
}

export function useDebitNote(id: string | undefined) {
  return useQuery({ queryKey: ['debit-note', id], queryFn: () => api.get(`/debit-notes/${id}`).then(r => r.data), enabled: !!id })
}
export function useUpdateDebitNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => api.patch(`/debit-notes/${id}`, data).then(r => r.data),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['debit-notes'] }); qc.invalidateQueries({ queryKey: ['debit-note', v.id] }) },
  })
}

export function useDeliveryOrder(id: string | undefined) {
  return useQuery({ queryKey: ['delivery-order', id], queryFn: () => api.get(`/delivery-orders/${id}`).then(r => r.data), enabled: !!id })
}
export function useUpdateDeliveryOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => api.patch(`/delivery-orders/${id}`, data).then(r => r.data),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['delivery-orders'] }); qc.invalidateQueries({ queryKey: ['delivery-order', v.id] }) },
  })
}

export function useSalesPayment(id: string | undefined) {
  return useQuery({ queryKey: ['sales-payment', id], queryFn: () => api.get(`/sales-payments/${id}`).then(r => r.data), enabled: !!id })
}
export function useUpdateSalesPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => api.patch(`/sales-payments/${id}`, data).then(r => r.data),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['sales-payments'] }); qc.invalidateQueries({ queryKey: ['sales-payment', v.id] }) },
  })
}

export function useSalesRefund(id: string | undefined) {
  return useQuery({ queryKey: ['sales-refund', id], queryFn: () => api.get(`/sales-refunds/${id}`).then(r => r.data), enabled: !!id })
}
export function useUpdateSalesRefund() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => api.patch(`/sales-refunds/${id}`, data).then(r => r.data),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['sales-refunds'] }); qc.invalidateQueries({ queryKey: ['sales-refund', v.id] }) },
  })
}

export function useRecurringInvoice(id: string | undefined) {
  return useQuery({ queryKey: ['recurring-invoice', id], queryFn: () => api.get(`/recurring-invoices/${id}`).then(r => r.data), enabled: !!id })
}
export function useUpdateRecurringInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => api.patch(`/recurring-invoices/${id}`, data).then(r => r.data),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['recurring-invoices'] }); qc.invalidateQueries({ queryKey: ['recurring-invoice', v.id] }) },
  })
}

export function useSaleReceipt(id: string | undefined) {
  return useQuery({ queryKey: ['sale-receipt', id], queryFn: () => api.get(`/sale-receipts/${id}`).then(r => r.data), enabled: !!id })
}
export function useUpdateSaleReceipt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => api.patch(`/sale-receipts/${id}`, data).then(r => r.data),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['sale-receipts'] }); qc.invalidateQueries({ queryKey: ['sale-receipt', v.id] }) },
  })
}

// Status-only update + delete hooks for sales modules
export function useUpdateQuotationStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/quotations/${id}/status`, null, { params: { status } }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['quotations'] }) },
  })
}
export function useDeleteQuotation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/quotations/${id}`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['quotations'] }) },
  })
}
export function useUpdateSalesOrderStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/sales-orders/${id}/status`, null, { params: { status } }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sales-orders'] }) },
  })
}
export function useDeleteSalesOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/sales-orders/${id}`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sales-orders'] }) },
  })
}
export function useUpdateDeliveryOrderStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/delivery-orders/${id}/status`, null, { params: { status } }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['delivery-orders'] }) },
  })
}
export function useDeleteDeliveryOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/delivery-orders/${id}`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['delivery-orders'] }) },
  })
}
export function useUpdateCreditNoteStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/credit-notes/${id}/status`, null, { params: { status } }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['credit-notes'] }) },
  })
}
export function useDeleteCreditNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/credit-notes/${id}`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['credit-notes'] }); qc.invalidateQueries({ queryKey: ['invoices'] }) },
  })
}
export function useRemoveCreditApplications() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/credit-notes/${id}/applications`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['credit-notes'] }); qc.invalidateQueries({ queryKey: ['invoices'] }) },
  })
}
export function useRemoveSingleCreditApplication() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ cnId, appId }: { cnId: string; appId: string }) =>
      api.delete(`/credit-notes/${cnId}/applications/${appId}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credit-notes'] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
    },
  })
}
export function useUpdateDebitNoteStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/debit-notes/${id}/status`, null, { params: { status } }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['debit-notes'] }) },
  })
}
export function useDeleteDebitNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/debit-notes/${id}`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['debit-notes'] }) },
  })
}
export function useUpdateSalesPaymentStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/sales-payments/${id}/status`, null, { params: { status } }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-payments'] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
    },
  })
}
export function useDeleteSalesPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/sales-payments/${id}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-payments'] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
    },
  })
}
export function useUpdateSalesRefundStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/sales-refunds/${id}/status`, null, { params: { status } }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sales-refunds'] }) },
  })
}
export function useDeleteSalesRefund() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/sales-refunds/${id}`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sales-refunds'] }) },
  })
}
export function useUpdateInvoiceStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/invoices/${id}/status`, null, { params: { status } }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoices'] }) },
  })
}
export function useDeleteInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/invoices/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoices'] }) },
  })
}
export function useDeleteRecurringInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/recurring-invoices/${id}`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recurring-invoices'] }) },
  })
}
export function useDeleteSaleReceipt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/sale-receipts/${id}`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sale-receipts'] }) },
  })
}
