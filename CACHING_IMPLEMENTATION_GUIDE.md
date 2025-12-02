# API Caching Implementation Guide

## Overview

This guide implements **TanStack Query (React Query)** to optimize API calls by caching data and only refetching when necessary.

### Current Problem
- Every page visit triggers fresh API calls
- No caching = slow experience + unnecessary server load
- Duplicate API calls when navigating between pages

### Solution Benefits
- ✅ **5-minute cache** - Data cached for 5 minutes before considered stale
- ✅ **Smart refetching** - Only refetches on window focus, reconnect, or manual invalidation
- ✅ **Automatic updates** - Mutations auto-invalidate related queries
- ✅ **Optimistic UI** - Can implement instant UI updates before server response
- ✅ **Zero config** - Works with existing API routes
- ✅ **Type-safe** - Full TypeScript support

---

## Installation

```bash
npm install @tanstack/react-query
npm install @tanstack/react-query-devtools  # Optional: for debugging
```

---

## Implementation Steps

### Step 1: Setup Query Provider

Update your root layout to wrap the app with QueryClientProvider:

**File**: `src/app/layout.tsx`

```typescript
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { queryClient } from '@/lib/query-client'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <QueryClientProvider client={queryClient}>
          {children}
          {/* Optional: React Query DevTools for debugging */}
          <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
      </body>
    </html>
  )
}
```

---

### Step 2: Update Pages to Use Custom Hooks

#### Example: Customers Page (BEFORE vs AFTER)

**BEFORE** (Current implementation):
```typescript
// src/app/(dashboard)/customers/page.tsx
const [customers, setCustomers] = useState<Customer[]>([])
const [loading, setLoading] = useState(true)

const fetchCustomers = useCallback(async () => {
  try {
    const response = await fetch('/api/customers?pageSize=1000')
    if (!response.ok) throw new Error('Failed to fetch customers')
    const data = await response.json()
    setCustomers(data.data || [])
  } catch (error) {
    toast.error('Failed to load customers')
  } finally {
    setLoading(false)
  }
}, [])

useEffect(() => {
  fetchCustomers()
}, [])

const handleCreateCustomer = async (data: CreateCustomerInput) => {
  // ... mutation logic
  fetchCustomers() // Refetch after mutation
}
```

**AFTER** (With caching):
```typescript
// src/app/(dashboard)/customers/page.tsx
import { useCustomers, useCreateCustomer, useUpdateCustomer, useDeleteCustomer } from '@/hooks/use-api'

export default function CustomersPage() {
  // Cached data fetch
  const { data: customers = [], isLoading } = useCustomers(1000)
  
  // Mutations with auto-invalidation
  const createMutation = useCreateCustomer()
  const updateMutation = useUpdateCustomer()
  const deleteMutation = useDeleteCustomer()
  
  const handleCreateCustomer = async (data: CreateCustomerInput) => {
    // No try-catch needed - handled in hook
    // No manual refetch needed - auto-invalidates
    await createMutation.mutateAsync(data)
  }
  
  const handleUpdateCustomer = async (data: CreateCustomerInput) => {
    if (!customerDialog.customer) return
    await updateMutation.mutateAsync({ 
      id: customerDialog.customer.id, 
      data 
    })
  }
  
  const handleDeleteCustomer = async () => {
    if (!deleteDialog.customer) return
    await deleteMutation.mutateAsync(deleteDialog.customer.id)
  }
  
  // Rest of component unchanged
  if (isLoading) {
    return <div>Loading customers...</div>
  }
  
  return (
    // ... JSX unchanged
  )
}
```

---

#### Example: Orders Page

**Update**: `src/app/(dashboard)/orders/page.tsx`

```typescript
import { useOrders, useCreateOrder, useUpdateOrder, useDeleteOrder } from '@/hooks/use-api'

export default function OrdersPage() {
  const [statusFilter, setStatusFilter] = useState<string>('all')
  
  // Cached orders - auto-updates when statusFilter changes
  const { data: orders = [], isLoading } = useOrders(statusFilter, 1000)
  
  // Mutations
  const createMutation = useCreateOrder()
  const updateMutation = useUpdateOrder()
  const deleteMutation = useDeleteOrder()
  
  const handleCreateOrder = async (data: CreateOrderInput) => {
    await createMutation.mutateAsync(data)
    // Orders list auto-refreshes!
  }
  
  const handleUpdateOrder = async (data: CreateOrderInput) => {
    if (!orderDialog.order) return
    await updateMutation.mutateAsync({
      id: orderDialog.order.id,
      data
    })
  }
  
  const handleDeleteOrder = async () => {
    if (!deleteDialog.order) return
    await deleteMutation.mutateAsync(deleteDialog.order.id)
  }
  
  // Remove fetchOrders() and useEffect - not needed!
  
  if (isLoading) {
    return <div>Loading orders...</div>
  }
  
  return (
    // ... JSX unchanged
  )
}
```

---

#### Example: Ledger Page

**Update**: `src/app/(dashboard)/ledger/page.tsx`

```typescript
import { 
  useLedgerEntries, 
  useLedgerStats, 
  useCreateLedgerEntry,
  useUpdateLedgerEntry,
  useDeleteLedgerEntry,
  useSyncOrderPayments
} from '@/hooks/use-api'

export default function LedgerPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  
  // Cached data
  const { data: entries = [], isLoading: entriesLoading } = useLedgerEntries()
  const { data: stats, isLoading: statsLoading } = useLedgerStats()
  
  // Mutations
  const createMutation = useCreateLedgerEntry()
  const updateMutation = useUpdateLedgerEntry()
  const deleteMutation = useDeleteLedgerEntry()
  const syncMutation = useSyncOrderPayments()
  
  // Local filtering (still client-side)
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return entries
    const query = searchQuery.toLowerCase()
    return entries.filter(entry => 
      entry.particulars.toLowerCase().includes(query) ||
      entry.entry_type.toLowerCase().includes(query) ||
      entry.vendors?.name.toLowerCase().includes(query) ||
      entry.orders?.order_number.toLowerCase().includes(query) ||
      (entry.notes && entry.notes.toLowerCase().includes(query))
    )
  }, [searchQuery, entries])
  
  const syncOrderPayments = async () => {
    await syncMutation.mutateAsync()
    // Ledger auto-refreshes!
  }
  
  // Remove fetchData() function and useEffect!
  
  if (entriesLoading || statsLoading) {
    return <div>Loading ledger...</div>
  }
  
  return (
    // ... JSX unchanged
  )
}
```

---

### Step 3: Update Vendors Page

**Update**: `src/app/(dashboard)/vendors/page.tsx`

```typescript
import { useVendors, useCreateVendor, useUpdateVendor, useDeleteVendor } from '@/hooks/use-api'

export default function VendorsPage() {
  const { data: vendors = [], isLoading } = useVendors()
  
  const createMutation = useCreateVendor()
  const updateMutation = useUpdateVendor()
  const deleteMutation = useDeleteVendor()
  
  // Mutations automatically handle success/error toasts
  // and invalidate the vendors cache
  
  if (isLoading) {
    return <div>Loading vendors...</div>
  }
  
  return (
    // ... JSX unchanged
  )
}
```

---

## Configuration Options

### Adjusting Cache Duration

Edit `src/lib/query-client.ts`:

```typescript
staleTime: 5 * 60 * 1000, // 5 minutes (current)

// Options:
staleTime: 1 * 60 * 1000,   // 1 minute - for frequently changing data
staleTime: 10 * 60 * 1000,  // 10 minutes - for stable data
staleTime: 30 * 60 * 1000,  // 30 minutes - for rarely changing data
staleTime: Infinity,        // Never consider stale (manual invalidation only)
```

### Per-Query Overrides

You can override defaults for specific queries:

```typescript
export function useOrders(status?: string) {
  return useQuery({
    queryKey: queryKeys.orders.list(status),
    queryFn: async () => {
      // ... fetch logic
    },
    // Override: Orders change frequently, cache for 2 minutes
    staleTime: 2 * 60 * 1000,
  })
}
```

---

## How It Works

### 1. **First Visit to /customers**
```
User visits /customers
  → useCustomers() hook called
  → No cached data → Fetch from API
  → Store in cache (key: ['customers', 'list', {pageSize: 1000}])
  → Data marked as "fresh" for 5 minutes
```

### 2. **Navigate to /orders, then back to /customers (within 5 min)**
```
User returns to /customers
  → useCustomers() hook called
  → Cached data found AND fresh → Return cached data instantly
  → No API call! ✅
```

### 3. **Return to /customers (after 5 min)**
```
User returns to /customers
  → useCustomers() hook called
  → Cached data found BUT stale → Return cached data immediately
  → Refetch in background → Update UI when new data arrives
  → Smooth experience! ✅
```

### 4. **Create New Customer**
```
User creates customer
  → useCreateCustomer().mutateAsync(data)
  → POST request to /api/customers
  → On success: 
    → queryClient.invalidateQueries(['customers'])
    → All customer queries refetch automatically
  → UI updates with new customer ✅
```

---

## Advanced Features

### Manual Refetch

If you need to manually refetch:

```typescript
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-client'

function MyComponent() {
  const queryClient = useQueryClient()
  
  const forceRefresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
  }
  
  return <Button onClick={forceRefresh}>Force Refresh</Button>
}
```

### Optimistic Updates

For instant UI updates before server confirms:

```typescript
export function useCreateCustomer() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (data: any) => {
      // ... POST request
    },
    onMutate: async (newCustomer) => {
      // Cancel ongoing queries
      await queryClient.cancelQueries({ queryKey: queryKeys.customers.all })
      
      // Get current data
      const previousCustomers = queryClient.getQueryData(queryKeys.customers.list(1000))
      
      // Optimistically update
      queryClient.setQueryData(queryKeys.customers.list(1000), (old: Customer[]) => {
        return [...old, { ...newCustomer, id: 'temp-' + Date.now() }]
      })
      
      // Return context for rollback
      return { previousCustomers }
    },
    onError: (err, newCustomer, context) => {
      // Rollback on error
      queryClient.setQueryData(
        queryKeys.customers.list(1000),
        context?.previousCustomers
      )
    },
    onSettled: () => {
      // Refetch after mutation completes
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all })
    },
  })
}
```

### Prefetching

Preload data before user navigates:

```typescript
const queryClient = useQueryClient()

const prefetchOrders = async () => {
  await queryClient.prefetchQuery({
    queryKey: queryKeys.orders.list(),
    queryFn: async () => {
      const response = await fetch('/api/orders?pageSize=1000')
      return response.json()
    },
  })
}

// Prefetch on hover
<Link 
  href="/orders" 
  onMouseEnter={prefetchOrders}
>
  Go to Orders
</Link>
```

---

## Debugging

### React Query DevTools

The DevTools show:
- All active queries
- Query status (fetching, stale, fresh)
- Cache contents
- Query timings

```typescript
// Already added in layout.tsx
<ReactQueryDevtools initialIsOpen={false} />
```

Click the React Query icon in bottom-right corner to open.

### Console Logging

```typescript
export const queryClient = new QueryClient({
  logger: {
    log: console.log,
    warn: console.warn,
    error: console.error,
  },
  // ... options
})
```

---

## Migration Checklist

- [ ] Install `@tanstack/react-query`
- [ ] Create `src/lib/query-client.ts`
- [ ] Create `src/hooks/use-api.ts`
- [ ] Update `src/app/layout.tsx` with QueryClientProvider
- [ ] Update `src/app/(dashboard)/customers/page.tsx`
- [ ] Update `src/app/(dashboard)/orders/page.tsx`
- [ ] Update `src/app/(dashboard)/ledger/page.tsx`
- [ ] Update `src/app/(dashboard)/vendors/page.tsx`
- [ ] Update `src/app/(dashboard)/vendors/[id]/page.tsx`
- [ ] Test each page thoroughly
- [ ] Remove old `fetchData` functions and `useEffect` hooks
- [ ] Test create/update/delete operations
- [ ] Verify cache invalidation works
- [ ] Deploy to production

---

## Performance Gains

### Before (No Caching)
- Navigate to /customers: **500ms** API call
- Navigate away and back: **500ms** API call again
- Total: **1000ms** for 2 visits

### After (With Caching)
- Navigate to /customers: **500ms** API call
- Navigate away and back: **0ms** (cached)
- Total: **500ms** for 2 visits
- **50% faster!**

### Additional Benefits
- Reduced server load
- Better user experience (instant page loads)
- Automatic background refresh keeps data fresh
- Smart invalidation ensures consistency
- No stale data bugs

---

## Common Patterns

### Loading States
```typescript
const { data, isLoading, isError, error } = useCustomers()

if (isLoading) return <Spinner />
if (isError) return <Error message={error.message} />
return <CustomerList customers={data} />
```

### Dependent Queries
```typescript
// Only fetch vendor ledger if vendorId exists
const { data: ledger } = useVendorLedger(vendorId)
// enabled: !!vendorId is already in the hook
```

### Polling (Auto-refresh)
```typescript
export function useLedgerEntries() {
  return useQuery({
    queryKey: queryKeys.ledger.entries,
    queryFn: async () => { /* ... */ },
    refetchInterval: 30 * 1000, // Refresh every 30 seconds
  })
}
```

---

## Troubleshooting

### Query Not Refetching After Mutation

**Problem**: Created order but orders list didn't update.

**Solution**: Ensure mutation invalidates correct query key:
```typescript
queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
```

### Data Feels "Stale"

**Problem**: Data doesn't update even after 5 minutes.

**Solution**: Check if window has focus. React Query only refetches on window focus by default. Or reduce `staleTime`:
```typescript
staleTime: 1 * 60 * 1000, // 1 minute
```

### Too Many Network Requests

**Problem**: Seeing lots of refetch requests.

**Solution**: Increase `staleTime` or disable `refetchOnWindowFocus`:
```typescript
refetchOnWindowFocus: false,
staleTime: 10 * 60 * 1000, // 10 minutes
```

---

## Conclusion

TanStack Query provides:
- ✅ Automatic caching
- ✅ Smart refetching
- ✅ Optimistic updates
- ✅ Request deduplication
- ✅ Type-safe API
- ✅ DevTools for debugging

**Result**: Faster app, better UX, less server load!
