import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-client'
import type { 
  Customer, 
  OrderWithCustomer, 
  GeneralLedgerWithRelations,
  Vendor,
  VendorWithLedger 
} from '@/lib/supabase-client'
import { toast } from 'sonner'

// =============================================================================
// CUSTOMERS
// =============================================================================

export function useCustomers(pageSize = 1000) {
  return useQuery({
    queryKey: queryKeys.customers.list(pageSize),
    queryFn: async () => {
      const response = await fetch(`/api/customers?pageSize=${pageSize}`)
      if (!response.ok) throw new Error('Failed to fetch customers')
      const data = await response.json()
      return data.data as Customer[]
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

export function useOrders(status?: string, pageSize = 1000) {
  return useQuery({
    queryKey: queryKeys.orders.list(status, pageSize),
    queryFn: async () => {
      const statusParam = status && status !== 'all' ? `&status=${encodeURIComponent(status)}` : ''
      const response = await fetch(`/api/orders?pageSize=${pageSize}${statusParam}`)
      if (!response.ok) throw new Error('Failed to fetch orders')
      const data = await response.json()
      
      // Sort orders: upcoming delivery dates first
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      
      const orders = data.data || []
      return orders.sort((a: OrderWithCustomer, b: OrderWithCustomer) => {
        const dateA = new Date(a.delivery_date)
        const dateB = new Date(b.delivery_date)
        dateA.setHours(0, 0, 0, 0)
        dateB.setHours(0, 0, 0, 0)
        
        const isAUpcoming = dateA >= today
        const isBUpcoming = dateB >= today
        
        if (isAUpcoming === isBUpcoming) {
          return dateA.getTime() - dateB.getTime()
        }
        
        return isAUpcoming ? -1 : 1
      }) as OrderWithCustomer[]
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

export function useLedgerEntries() {
  return useQuery({
    queryKey: queryKeys.ledger.entries,
    queryFn: async () => {
      const response = await fetch('/api/general-ledger')
      if (!response.ok) throw new Error('Failed to fetch ledger entries')
      return response.json() as Promise<GeneralLedgerWithRelations[]>
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
