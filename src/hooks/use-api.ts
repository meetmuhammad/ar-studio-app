import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-client'
import type { DateRange } from '@/lib/date-range'
import { useAuth } from '@/contexts/auth-context'
import { ledgerFiltersToSearchParams } from '@/lib/ledger-query'
import type {
  Customer,
  OrderWithCustomer,
  GeneralLedgerWithRelations,
  LedgerEntryType,
  Vendor,
  VendorWithLedger,
  VendorCategory,
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

/**
 * The filter half of these params is defined once in @/lib/ledger-query and
 * serialised by `ledgerFiltersToSearchParams`, so the table query and the CSV
 * export cannot disagree about parameter names or about which rows match.
 */
export interface LedgerQueryParams extends Partial<LedgerFilterInput> {
  page?: number
  pageSize?: number
}

type LedgerFilterInput = {
  search: string
  startDate: string
  endDate: string
  entryType: LedgerEntryType
  vendorId: string
  /** Filters on the ledger's category SNAPSHOT, not the vendor's category now. */
  vendorCategoryId: string
}

function ledgerFilterParams(params: LedgerQueryParams): URLSearchParams {
  return ledgerFiltersToSearchParams({
    search: params.search,
    startDate: params.startDate,
    endDate: params.endDate,
    entryType: params.entryType,
    vendorId: params.vendorId,
    vendorCategoryId: params.vendorCategoryId,
  })
}

export function useLedgerEntries(params: LedgerQueryParams = {}) {
  const { page = 1, pageSize = 20, search, startDate, endDate, entryType, vendorId, vendorCategoryId } = params
  return useQuery({
    queryKey: queryKeys.ledger.entries({ page, pageSize, search, startDate, endDate, entryType, vendorId, vendorCategoryId }),
    queryFn: async () => {
      const searchParams = ledgerFilterParams({ search, startDate, endDate, entryType, vendorId, vendorCategoryId })
      searchParams.set('page', page.toString())
      searchParams.set('pageSize', pageSize.toString())

      const response = await fetch(`/api/general-ledger?${searchParams}`)
      if (!response.ok) throw new Error('Failed to fetch ledger entries')
      return response.json() as Promise<{ data: GeneralLedgerWithRelations[]; pagination: { page: number; pageSize: number; total: number; pages: number } }>
    },
  })
}

/**
 * Download every row matching the current filters as CSV.
 *
 * The server builds the file. The old export serialised the 20 rows React
 * Query happened to be holding, so "Export CSV" produced the current page and
 * called it the ledger. Fetching (rather than pointing an <a> at the route)
 * keeps the failure visible: an expired session returns 401 and the user gets a
 * toast instead of a downloaded file containing an error page.
 */
export function useExportLedgerCsv() {
  return useMutation({
    mutationFn: async (filters: Omit<LedgerQueryParams, 'page' | 'pageSize'> = {}) => {
      const searchParams = ledgerFilterParams(filters)
      const query = searchParams.toString()
      const response = await fetch(`/api/general-ledger/export${query ? `?${query}` : ''}`)
      if (!response.ok) throw new Error('Failed to export ledger entries')

      const blob = await response.blob()
      const total = Number(response.headers.get('X-Total-Rows') ?? '0')
      const disposition = response.headers.get('Content-Disposition') || ''
      const filename =
        /filename="([^"]+)"/.exec(disposition)?.[1] ??
        `ledger_entries_${new Date().toISOString().slice(0, 10)}.csv`

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      return { total, filename }
    },
    onSuccess: ({ total }) => {
      toast.success(`Exported ${total} ledger ${total === 1 ? 'entry' : 'entries'} to CSV`)
    },
    onError: () => {
      toast.error('Failed to export CSV')
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

// useSyncOrderPayments was removed with the sync-payments route: it deleted and
// rebuilt every order_payment ledger row, destroying hand-entered entries. The
// route is gone; this must not come back.

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

// =============================================================================
// VENDOR CATEGORIES (Wave 4)
// =============================================================================
// The global accounting classification list. Admin-only end to end: every
// endpoint below is withAdmin, so a staff session gets 403 regardless of UI.

export function useVendorCategories(includeArchived = false) {
  return useQuery({
    queryKey: [...queryKeys.vendorCategories.all, includeArchived],
    queryFn: async () => {
      const qs = includeArchived ? '?include_archived=1' : ''
      const response = await fetch(`/api/vendor-categories${qs}`)
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
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body?.error || 'Failed to create category')
      return body as VendorCategory
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vendorCategories.all })
      toast.success('Category created')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdateVendorCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, name, archived }: { id: string; name?: string; archived?: boolean }) => {
      const response = await fetch(`/api/vendor-categories/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, archived }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body?.error || 'Failed to update category')
      return body as VendorCategory
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vendorCategories.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.vendors.all })
      // Deliberately does NOT invalidate the ledger: a rename never changes a
      // historical snapshot, so ledger rows are unaffected.
      toast.success('Category updated')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteVendorCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/vendor-categories/${id}`, { method: 'DELETE' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body?.error || 'Failed to delete category')
      return body
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vendorCategories.all })
      toast.success('Category deleted')
    },
    onError: (e: Error) => toast.error(e.message),
  })
}
