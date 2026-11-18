import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-client'
import { authFetch } from '@/lib/auth-fetch'

// =============================================================================
// DASHBOARD (classic overview at /overview, over GET /api/dashboard-stats)
// =============================================================================

export interface DashboardStatsResponse {
  totalCustomers: number
  totalOrders: number
  totalRevenue: number
  totalReceived: number
  outstandingBalance: number
  recentOrdersCount: number
  upcomingOrders: Array<{
    id: string
    order_number: string
    delivery_date: string
    status: string
    customers: { name: string; phone: string }
  }>
  chartData: Array<{ month: string; revenue: number }>
}

export function useDashboardStats() {
  return useQuery({
    queryKey: queryKeys.dashboard.stats,
    queryFn: async () => {
      const response = await authFetch('/api/dashboard-stats')
      if (!response.ok) throw new Error('Failed to fetch dashboard stats')
      return response.json() as Promise<DashboardStatsResponse>
    },
  })
}
