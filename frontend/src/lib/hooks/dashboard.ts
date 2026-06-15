import { useQuery } from '@tanstack/react-query'
import api from '../api'
import type { DashboardData } from '../../types'

// Dashboard
export function useDashboard() {
  return useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/dashboard').then(r => r.data),
  })
}

type DashboardSeriesPoint = { label: string; value: number }
type DashboardSeries = {
  income: DashboardSeriesPoint[]
  expenses: DashboardSeriesPoint[]
  profit_loss: DashboardSeriesPoint[]
  cash: DashboardSeriesPoint[]
}

export function useDashboardSeries(days: number) {
  return useQuery<DashboardSeries>({
    queryKey: ['dashboard-series', days],
    queryFn: () => api.get('/dashboard/series', { params: { days } }).then(r => r.data),
  })
}
