import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import api from '../api'
import type { Paginated, ListParams } from './_shared'

// ── Products ──
type Product = {
  id: string; organization_id: string; code: string | null; name: string;
  description: string | null; product_type: string; unit: string | null;
  unit_price: number; cost_price: number; currency: string;
  tax_rate_id: string | null; income_account_id: string | null;
  expense_account_id: string | null; inventory_account_id: string | null;
  track_inventory: boolean; qty_on_hand: number; reorder_point: number | null;
  is_active: boolean; image_url: string | null; created_at: string; updated_at: string;
}
// Paginated. Existing signature is (activeOnly: boolean) → active_only param,
// so a custom wrapper preserves that semantics. data stays Product[].
export function useProducts(activeOnly = true) {
  return useQuery<Paginated<Product>, Error, Product[]>({
    queryKey: ['products', activeOnly],
    queryFn: () => api.get('/products', { params: { active_only: activeOnly } }).then(r => r.data),
    select: (d: any) => (Array.isArray(d) ? d : d.items),
    placeholderData: keepPreviousData,
  })
}
// Server-side product search for line-item pickers — removes the "first 50" ceiling.
// Backend /products supports ?search= (name/code/description ilike).
export function useProductSearch(search: string) {
  return useQuery<Paginated<Product>, Error, Product[]>({
    queryKey: ['products', 'search', search],
    queryFn: () => api.get('/products', { params: { active_only: true, search: search || undefined, limit: 20 } }).then(r => r.data),
    select: (d: any) => (Array.isArray(d) ? d : d.items),
    placeholderData: keepPreviousData,
  })
}

export function useProductsPage(params?: ListParams & { active_only?: boolean }) {
  const p = params ?? {}
  return useQuery<Paginated<Product>>({
    queryKey: ['products', 'page', p],
    queryFn: () => api.get('/products', { params: p }).then(r => {
      const d = r.data
      return Array.isArray(d) ? { items: d, total: d.length, page: 1, limit: d.length || 1, pages: 1 } : d
    }),
    placeholderData: keepPreviousData,
  })
}

export function useCreateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/products', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })
}

export function useUpdateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      api.patch(`/products/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })
}

export function useProduct(id: string | undefined) {
  return useQuery({ queryKey: ['product', id], queryFn: () => api.get(`/products/${id}`).then(r => r.data), enabled: !!id })
}
