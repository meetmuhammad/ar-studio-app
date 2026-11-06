import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache data for 2 minutes by default (orders, ledger change frequently)
      staleTime: 2 * 60 * 1000, // 2 minutes
      
      // Keep unused data in cache for 5 minutes
      gcTime: 5 * 60 * 1000, // 5 minutes (formerly cacheTime)
      
      // Refetch on window focus (when user comes back to tab)
      refetchOnWindowFocus: true,
      
      // Refetch on network reconnect
      refetchOnReconnect: true,
      
      // Always refetch when navigating to a page so data is fresh
      refetchOnMount: true,
      
      // Retry failed requests
      retry: 1,
      
      // Show stale data while refetching in background
      refetchInterval: false,
    },
    mutations: {
      // Retry mutations once on failure
      retry: 1,
    },
  },
})

// Query keys for type safety and consistency
export const queryKeys = {
  dashboard: {
    stats: ['dashboard', 'stats'] as const,
  },
  pnl: {
    all: ['pnl'] as const,
    // The business is not in the key: authFetch sends it as X-Business-Id and
    // the dashboard layout remounts the page on every switch.
    report: (params: { mode: string; start: string; end: string }) => ['pnl', 'report', params] as const,
  },
  customers: {
    all: ['customers'] as const,
    list: (params?: { page?: number; pageSize?: number; q?: string }) => 
      ['customers', 'list', params] as const,
    detail: (id: string) => ['customers', 'detail', id] as const,
  },
  orders: {
    all: ['orders'] as const,
    list: (params?: { page?: number; pageSize?: number; status?: string; q?: string; sortBy?: string; sortDir?: string }) => 
      ['orders', 'list', params] as const,
    detail: (id: string) => ['orders', 'detail', id] as const,
  },
  measurements: {
    all: ['measurements'] as const,
    byCustomer: (customerId: string) => 
      ['measurements', 'customer', customerId] as const,
    detail: (id: string) => ['measurements', 'detail', id] as const,
  },
  payments: {
    all: ['payments'] as const,
    byOrder: (orderId: string) => ['payments', 'order', orderId] as const,
  },
  ledger: {
    all: ['ledger'] as const,
    entries: (params?: { page?: number; pageSize?: number; search?: string; startDate?: string; endDate?: string; vendorCategoryId?: string }) => 
      ['ledger', 'entries', params] as const,
    stats: (range?: { startDate?: string; endDate?: string }) => ['ledger', 'stats', range ?? {}] as const,
  },
  vendors: {
    all: ['vendors'] as const,
    list: ['vendors', 'list'] as const,
    detail: (id: string) => ['vendors', 'detail', id] as const,
    ledger: (id: string) => ['vendors', 'ledger', id] as const,
  },
  vendorCategories: {
    all: ['vendor-categories'] as const,
    list: (includeArchived?: boolean) => ['vendor-categories', 'list', !!includeArchived] as const,
  },
} as const
