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
  customers: {
    all: ['customers'] as const,
    list: (params?: { page?: number; pageSize?: number; q?: string }) => 
      ['customers', 'list', params] as const,
    detail: (id: string) => ['customers', 'detail', id] as const,
  },
  orders: {
    all: ['orders'] as const,
    list: (params?: { page?: number; pageSize?: number; status?: string; q?: string; sortDir?: string }) => 
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
    entries: (params?: { page?: number; pageSize?: number; search?: string; startDate?: string; endDate?: string; entryType?: string; vendorId?: string }) =>
      ['ledger', 'entries', params] as const,
    stats: ['ledger', 'stats'] as const,
  },
  vendors: {
    all: ['vendors'] as const,
    list: ['vendors', 'list'] as const,
    detail: (id: string) => ['vendors', 'detail', id] as const,
    ledger: (id: string) => ['vendors', 'ledger', id] as const,
  },
} as const
