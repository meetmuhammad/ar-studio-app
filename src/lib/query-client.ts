import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache data for 5 minutes (adjust based on your needs)
      staleTime: 5 * 60 * 1000, // 5 minutes
      
      // Keep unused data in cache for 10 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
      
      // Refetch on window focus (when user comes back to tab)
      refetchOnWindowFocus: true,
      
      // Refetch on network reconnect
      refetchOnReconnect: true,
      
      // Don't refetch on mount if data is fresh
      refetchOnMount: false,
      
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
  customers: {
    all: ['customers'] as const,
    list: (pageSize?: number) => ['customers', 'list', { pageSize }] as const,
    detail: (id: string) => ['customers', 'detail', id] as const,
  },
  orders: {
    all: ['orders'] as const,
    list: (status?: string, pageSize?: number) => 
      ['orders', 'list', { status, pageSize }] as const,
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
    entries: ['ledger', 'entries'] as const,
    stats: ['ledger', 'stats'] as const,
  },
  vendors: {
    all: ['vendors'] as const,
    list: ['vendors', 'list'] as const,
    detail: (id: string) => ['vendors', 'detail', id] as const,
    ledger: (id: string) => ['vendors', 'ledger', id] as const,
  },
} as const
