import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-client'
import type { 
  Customer, 
  OrderWithCustomer, 
  GeneralLedgerWithRelations,
  Vendor,
  VendorWithLedger,
  VendorCategory,
  VendorWithCategory
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
}

export function useDashboardStats() {
  return useQuery({
    queryKey: queryKeys.dashboard.stats,
    queryFn: async () => {
      const response = await fetch('/api/dashboard-stats')
      if (!response.ok) throw new Error('Failed to fetch dashboard stats')
      return response.json() as Promise<DashboardStatsResponse>
    },
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
  vendorCategoryId?: string
}

export function useLedgerEntries(params: LedgerQueryParams = {}) {
  const { page = 1, pageSize = 20, search, startDate, endDate, vendorCategoryId } = params
  return useQuery({
    queryKey: queryKeys.ledger.entries({ page, pageSize, search, startDate, endDate, vendorCategoryId }),
    queryFn: async () => {
      const searchParams = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      })
      if (search?.trim()) searchParams.set('search', search.trim())
      if (startDate) searchParams.set('start_date', startDate)
      if (endDate) searchParams.set('end_date', endDate)
      // Filters by the LEDGER SNAPSHOT category (vendor_category_id stored on
      // the row itself), not the vendor's current category -- see
      // supabase/migrations/20260827000000_vendor_categories.sql.
      if (vendorCategoryId) searchParams.set('vendor_category_id', vendorCategoryId)
      
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
      return response.json() as Promise<VendorWithCategory[]>
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

// =============================================================================
// VENDOR CATEGORIES
// =============================================================================

export function useVendorCategories(includeArchived = false) {
  return useQuery({
    queryKey: queryKeys.vendorCategories.list(includeArchived),
    queryFn: async () => {
      const response = await fetch(
        `/api/vendor-categories${includeArchived ? '?include_archived=1' : ''}`
      )
      if (!response.ok) throw new Error('Failed to fetch vendor categories')
      return response.json() as Promise<VendorCategory[]>
    },
  })
}

export function useCreateVendorCategory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (name: string) => {
      const response = await fetch('/api/vendor-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create category')
      }
      return response.json() as Promise<VendorCategory>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vendorCategories.all })
      toast.success('Category created successfully')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

// Covers both rename ({ id, name }) and archive/unarchive ({ id, archived }).
export function useUpdateVendorCategory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, name, archived }: { id: string; name?: string; archived?: boolean }) => {
      const response = await fetch(`/api/vendor-categories/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, archived }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update category')
      }
      return response.json() as Promise<VendorCategory>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vendorCategories.all })
      // A rename/archive can change what vendors/ledger rows display.
      queryClient.invalidateQueries({ queryKey: queryKeys.vendors.all })
      toast.success('Category updated successfully')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function useDeleteVendorCategory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/vendor-categories/${id}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete category')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vendorCategories.all })
      toast.success('Category deleted successfully')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}
