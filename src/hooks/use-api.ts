import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-client'
import { useAuth } from '@/contexts/auth-context'
import type { DateRange } from '@/lib/date-range'
import type { 
  Customer, 
  OrderWithCustomer, 
  GeneralLedgerWithRelations,
  Vendor,
  VendorWithLedger 
} from '@/lib/supabase-client'
import { toast } from 'sonner'

// =============================================================================
// DASHBOARD
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
  /** The range the server actually used, after validation. */
  range: DateRange
}

/**
 * GET /api/dashboard-stats is withAdmin, so staff are refused by design. The
 * refusal is correct but the request should never be made: RoleGuard sends
 * staff to /customers from an effect, which cannot run until after the first
 * render has already fired this query, so a staff sign-in landed on / and
 * logged two console errors -- the 403 plus React Query's retry -- before the
 * redirect took effect.
 *
 * Gating on the resolved role removes the request rather than the symptom. The
 * API guard is untouched and just as strict; this only stops the client asking
 * a question it already knows the answer to.
 *
 * `enabled` waits on `loading` as well as the role. Treating a not-yet-resolved
 * user as "not admin" would be a permanent false negative -- the query is
 * disabled on first render and nothing re-enables it -- so an admin would get
 * an empty dashboard. Parking it until auth resolves keeps admin behaviour as
 * it was.
 *
 * `range` selects the booking-date window. It is part of the query key, so each
 * range is cached separately and switching back to a previously viewed range is
 * instant. The role gate above is unchanged -- the range is folded into it, not
 * substituted for it.
 */
export function useDashboardStats(range: DateRange) {
  const { user, loading } = useAuth()

  return useQuery({
    queryKey: [...queryKeys.dashboard.stats, range.start, range.end],
    queryFn: async () => {
      const params = new URLSearchParams({ start: range.start, end: range.end })
      const response = await fetch(`/api/dashboard-stats?${params.toString()}`)
      if (!response.ok) throw new Error('Failed to fetch dashboard stats')
      return response.json() as Promise<DashboardStatsResponse>
    },
    enabled: !loading && user?.role === 'admin',
  })
}

// =============================================================================
// CUSTOMERS
// =============================================================================

interface CustomerQueryParams {
  page?: number
  pageSize?: number
  q?: string
}

interface PaginatedResponse<T> {
  data: T[]
  pagination: { page: number; pageSize: number; total: number; pages: number }
}

export function useCustomers(params: CustomerQueryParams = {}) {
  const { page = 1, pageSize = 20, q } = params
  return useQuery({
    queryKey: queryKeys.customers.list({ page, pageSize, q }),
    queryFn: async () => {
      const searchParams = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      })
      if (q?.trim()) searchParams.set('q', q.trim())
      
      const response = await fetch(`/api/customers?${searchParams}`)
      if (!response.ok) throw new Error('Failed to fetch customers')
      return response.json() as Promise<PaginatedResponse<Customer>>
    },
  })
}

export function useCustomer(id: string) {
  return useQuery({
    queryKey: queryKeys.customers.detail(id),
    queryFn: async () => {
      const response = await fetch(`/api/customers/${id}`)
      if (!response.ok) throw new Error('Failed to fetch customer')
      return response.json()
    },
    enabled: !!id, // Only run if id exists
  })
}

export function useCreateCustomer() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create customer')
      }
      return response.json()
    },
    onSuccess: () => {
      // Invalidate all customer queries to refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all })
      toast.success('Customer created successfully')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await fetch(`/api/customers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update customer')
      }
      return response.json()
    },
    onSuccess: (_, variables) => {
      // Invalidate all customer queries
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all })
      // Invalidate specific customer detail
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.detail(variables.id) })
      toast.success('Customer updated successfully')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function useDeleteCustomer() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/customers/${id}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete customer')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all })
      toast.success('Customer deleted successfully')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

// =============================================================================
// ORDERS
// =============================================================================

interface OrderQueryParams {
  page?: number
  pageSize?: number
  status?: string
  q?: string
  sortBy?: string
  sortDir?: 'asc' | 'desc'
}

export function useOrders(params: OrderQueryParams = {}) {
  const { page = 1, pageSize = 20, status, q, sortBy = 'delivery_date', sortDir = 'asc' } = params
  return useQuery({
    queryKey: queryKeys.orders.list({ page, pageSize, status, q, sortDir }),
    queryFn: async () => {
      const searchParams = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
        sortBy,
        sortDir,
      })
      if (status && status !== 'all') searchParams.set('status', status)
      if (q?.trim()) searchParams.set('q', q.trim())
      
      const response = await fetch(`/api/orders?${searchParams}`)
      if (!response.ok) throw new Error('Failed to fetch orders')
      return response.json() as Promise<PaginatedResponse<OrderWithCustomer>>
    },
  })
}

export function useCreateOrder() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create order')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
      // Also invalidate ledger if order has payment
      queryClient.invalidateQueries({ queryKey: queryKeys.ledger.all })
      toast.success('Order created successfully')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function useUpdateOrder() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await fetch(`/api/orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update order')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.ledger.all })
      toast.success('Order updated successfully')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function useDeleteOrder() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/orders/${id}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete order')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
      toast.success('Order deleted successfully')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

// =============================================================================
// LEDGER
// =============================================================================

interface LedgerQueryParams {
  page?: number
  pageSize?: number
  search?: string
  startDate?: string
  endDate?: string
}

export function useLedgerEntries(params: LedgerQueryParams = {}) {
  const { page = 1, pageSize = 20, search, startDate, endDate } = params
  return useQuery({
    queryKey: queryKeys.ledger.entries({ page, pageSize, search, startDate, endDate }),
    queryFn: async () => {
      const searchParams = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      })
      if (search?.trim()) searchParams.set('search', search.trim())
      if (startDate) searchParams.set('start_date', startDate)
      if (endDate) searchParams.set('end_date', endDate)
      
      const response = await fetch(`/api/general-ledger?${searchParams}`)
      if (!response.ok) throw new Error('Failed to fetch ledger entries')
      return response.json() as Promise<{ data: GeneralLedgerWithRelations[]; pagination: { page: number; pageSize: number; total: number; pages: number } }>
    },
  })
}

export function useLedgerStats() {
  return useQuery({
    queryKey: queryKeys.ledger.stats,
    queryFn: async () => {
      const response = await fetch('/api/general-ledger/stats')
      if (!response.ok) throw new Error('Failed to fetch ledger stats')
      return response.json() as Promise<{
        totalDebit: number
        totalCredit: number
        currentBalance: number
        entryCount: number
      }>
    },
  })
}

export function useCreateLedgerEntry() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/general-ledger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create ledger entry')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ledger.all })
      toast.success('Ledger entry created successfully')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function useUpdateLedgerEntry() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await fetch(`/api/general-ledger/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update ledger entry')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ledger.all })
      toast.success('Ledger entry updated successfully')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function useDeleteLedgerEntry() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/general-ledger/${id}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete ledger entry')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ledger.all })
      toast.success('Ledger entry deleted successfully')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function useSyncOrderPayments() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/general-ledger/sync-payments', {
        method: 'POST',
      })
      if (!response.ok) throw new Error('Failed to sync payments')
      return response.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ledger.all })
      toast.success(`Synced ${data.synced} order payments to ledger`)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

// =============================================================================
// VENDORS
// =============================================================================

export function useVendors() {
  return useQuery({
    queryKey: queryKeys.vendors.list,
    queryFn: async () => {
      const response = await fetch('/api/vendors')
      if (!response.ok) throw new Error('Failed to fetch vendors')
      return response.json() as Promise<Vendor[]>
    },
  })
}

export function useVendorLedger(vendorId: string) {
  return useQuery({
    queryKey: queryKeys.vendors.ledger(vendorId),
    queryFn: async () => {
      const response = await fetch(`/api/vendor-ledger?vendor_id=${vendorId}`)
      if (!response.ok) throw new Error('Failed to fetch vendor ledger')
      return response.json()
    },
    enabled: !!vendorId,
  })
}

export function useCreateVendor() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create vendor')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vendors.all })
      toast.success('Vendor created successfully')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function useUpdateVendor() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await fetch(`/api/vendors/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update vendor')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vendors.all })
      toast.success('Vendor updated successfully')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function useDeleteVendor() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/vendors/${id}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete vendor')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vendors.all })
      toast.success('Vendor deleted successfully')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}
