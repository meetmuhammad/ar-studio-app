"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useDebouncedCallback } from 'use-debounce'

import { DataTable } from '@/components/data-table/data-table'
import { createOrderColumns } from '@/components/data-table/columns/order-columns'
import { OrderDialog } from '@/components/dialogs/order-dialog'
import { OrderDetailsDialog } from '@/components/dialogs/order-details-dialog'
import { DeleteConfirmationDialog } from '@/components/dialogs/delete-confirmation-dialog'
import { CreateOrderInput } from '@/lib/validators'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { OrderWithCustomer } from '@/lib/supabase-client'

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderWithCustomer[]>([])
  const [loading, setLoading] = useState(true)
  
  // Dialog states
  const [orderDialog, setOrderDialog] = useState<{
    open: boolean
    order?: OrderWithCustomer | null
  }>({ open: false, order: null })
  
  const [detailsDialog, setDetailsDialog] = useState<{
    open: boolean
    order: OrderWithCustomer | null
  }>({ open: false, order: null })
  
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean
    order?: OrderWithCustomer | null
  }>({ open: false, order: null })

  // Fetch orders from API
  const fetchOrders = useCallback(async () => {
    try {
      const response = await fetch('/api/orders?pageSize=1000') // Get all orders
      if (!response.ok) {
        throw new Error('Failed to fetch orders')
      }
      
      const data = await response.json()
      setOrders(data.data || [])
    } catch (error) {
      console.error('Error fetching orders:', error)
      toast.error('Failed to load orders')
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load
  useEffect(() => {
    fetchOrders()

    // Listen for order creation events from header
    const handleOrderCreated = () => {
      fetchOrders()
    }

    window.addEventListener('orderCreated', handleOrderCreated)
    
    return () => {
      window.removeEventListener('orderCreated', handleOrderCreated)
    }
  }, [fetchOrders])

  // Handle create order
  const handleCreateOrder = async (data: CreateOrderInput) => {
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create order')
      }

      toast.success('Order created successfully')
      fetchOrders()
    } catch (error) {
      console.error('Error creating order:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to create order')
      throw error
    }
  }

  // Handle update order
  const handleUpdateOrder = async (data: CreateOrderInput) => {
    if (!orderDialog.order) return

    try {
      const response = await fetch(`/api/orders/${orderDialog.order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update order')
      }

      toast.success('Order updated successfully')
      fetchOrders()
    } catch (error) {
      console.error('Error updating order:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to update order')
      throw error
    }
  }

  // Handle delete order
  const handleDeleteOrder = async () => {
    if (!deleteDialog.order) return

    try {
      const response = await fetch(`/api/orders/${deleteDialog.order.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete order')
      }

      toast.success('Order deleted successfully')
      fetchOrders()
    } catch (error) {
      console.error('Error deleting order:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to delete order')
      throw error
    }
  }

  // Column actions
  const handleView = (order: OrderWithCustomer) => {
    setDetailsDialog({ open: true, order })
  }

  const handleEdit = (order: OrderWithCustomer) => {
    setOrderDialog({ open: true, order })
  }

  const handleDelete = (order: OrderWithCustomer) => {
    setDeleteDialog({ open: true, order })
  }

  const handleRowClick = (order: OrderWithCustomer) => {
    setDetailsDialog({ open: true, order })
  }

  const columns = createOrderColumns({
    onView: handleView,
    onEdit: handleEdit,
    onDelete: handleDelete,
    onRowClick: handleRowClick,
  })

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Orders</h2>
            <p className="text-muted-foreground">Manage all orders and measurements.</p>
          </div>
          <Button disabled>
            <Plus className="h-4 w-4 mr-2" />
            New Order
          </Button>
        </div>
        <div className="bg-card rounded-lg border p-6">
          <p className="text-muted-foreground">Loading orders...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Orders</h2>
          <p className="text-muted-foreground">Manage all orders and measurements.</p>
        </div>
        <Button onClick={() => setOrderDialog({ open: true, order: null })}>
          <Plus className="h-4 w-4 mr-2" />
          New Order
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Orders</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={orders}
            searchPlaceholder="Search by order number, customer name, or phone..."
            onRowClick={handleRowClick}
          />
        </CardContent>
      </Card>

      {/* Create/Edit Order Dialog */}
      <OrderDialog
        open={orderDialog.open}
        onOpenChange={(open) => setOrderDialog({ open, order: null })}
        order={orderDialog.order}
        onSubmit={orderDialog.order ? handleUpdateOrder : handleCreateOrder}
      />

      {/* Order Details Dialog */}
      <OrderDetailsDialog
        open={detailsDialog.open}
        onOpenChange={(open) => setDetailsDialog({ open, order: null })}
        order={detailsDialog.order}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog({ open, order: null })}
        title="Delete Order"
        description={`Are you sure you want to delete order ${deleteDialog.order?.order_number}? This action cannot be undone.`}
        onConfirm={handleDeleteOrder}
      />
    </div>
  )
}
