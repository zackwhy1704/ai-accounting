import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../api'

// ── Products ──
export function useProducts(activeOnly = true) {
  return useQuery<Array<{
    id: string; organization_id: string; code: string | null; name: string;
    description: string | null; product_type: string; unit: string | null;
    unit_price: number; cost_price: number; currency: string;
    tax_rate_id: string | null; income_account_id: string | null;
    expense_account_id: string | null; inventory_account_id: string | null;
    track_inventory: boolean; qty_on_hand: number; reorder_point: number | null;
    is_active: boolean; image_url: string | null; created_at: string; updated_at: string;
  }>>({
    queryKey: ['products', activeOnly],
    queryFn: () => api.get('/products', { params: { active_only: activeOnly } }).then(r => r.data),
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
