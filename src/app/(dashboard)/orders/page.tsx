"use client"

import { useState, useEffect } from "react"
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useOrders, useCreateOrder, useUpdateOrder, useDeleteOrder } from '@/hooks/use-api'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Eye, Pencil, Trash2, ArrowUpAZ, ArrowDownZA, Search } from 'lucide-react'

import { OrderDialog } from '@/components/dialogs/order-dialog'
import { OrderDetailsDialog } from '@/components/dialogs/order-details-dialog'
import { DeleteConfirmationDialog } from '@/components/dialogs/delete-confirmation-dialog'
import { CreateOrderInput } from '@/lib/validators'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { OrderWithCustomer } from '@/lib/supabase-client'

export default function OrdersPage() {
  const [statusFilter, setStatusFilter] = useState<string>('In Process')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 20
  
  // React Query hooks
  const { data: ordersData, isLoading: loading, refetch: fetchOrders } = useOrders({
    page: currentPage,
    pageSize: itemsPerPage,
    status: statusFilter,
    q: debouncedSearch,
    sortDir: sortDirection,
  })
  const createOrder = useCreateOrder()
  const updateOrder = useUpdateOrder()
  const deleteOrder = useDeleteOrder()
  
  const orders = ordersData?.data || []
  const totalOrders = ordersData?.pagination?.total || 0
  const totalPages = ordersData?.pagination?.pages || 1
  
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

  // Search on Enter key press — search across all statuses
  const handleSearchSubmit = () => {
    setDebouncedSearch(searchQuery)
    if (searchQuery.trim()) setStatusFilter('all')
    setCurrentPage(1)
  }

  // Listen for order creation events from header
  useEffect(() => {
    const handleOrderCreated = () => fetchOrders()
    window.addEventListener('orderCreated', handleOrderCreated)
    return () => window.removeEventListener('orderCreated', handleOrderCreated)
  }, [fetchOrders])

  // Handle create order
  const handleCreateOrder = async (data: CreateOrderInput) => {
    await createOrder.mutateAsync(data)
  }

  // Handle update order
  const handleUpdateOrder = async (data: CreateOrderInput) => {
    if (!orderDialog.order) return
    await updateOrder.mutateAsync({ id: orderDialog.order.id, data })
  }

  // Handle delete order
  const handleDeleteOrder = async () => {
    if (!deleteDialog.order) return
    await deleteOrder.mutateAsync(deleteDialog.order.id)
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

  // Server handles pagination, filtering, and sorting — just use orders directly
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = Math.min(startIndex + orders.length, startIndex + itemsPerPage)

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency: 'PKR',
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
      'In Process': 'default',
      'Delivered': 'secondary',
      'Cancelled': 'destructive',
    }
    return <Badge variant={variants[status] || 'default'}>{status}</Badge>
  }

  // Reset to first page when status or sort change (search is handled in debounce)
  useEffect(() => {
    setCurrentPage(1)
  }, [statusFilter, sortDirection])

  if (loading && orders.length === 0) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Orders</h2>
            <p className="text-sm sm:text-base text-muted-foreground">Manage all orders and measurements.</p>
          </div>
          <Button disabled size="sm" className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            New Order
          </Button>
        </div>
        <div className="bg-card rounded-lg border p-4 sm:p-6">
          <p className="text-sm sm:text-base text-muted-foreground">Loading orders...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Orders</h2>
          <p className="text-sm sm:text-base text-muted-foreground">Manage all orders and measurements.</p>
        </div>
        <Button onClick={() => setOrderDialog({ open: true, order: null })} size="sm" className="w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-2" />
          New Order
        </Button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by order number, customer name, or phone... (press Enter)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit()}
          className="pl-10"
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <CardTitle>All Orders ({totalOrders})</CardTitle>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 w-full sm:w-auto">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Label htmlFor="status-filter" className="text-sm font-normal whitespace-nowrap">Status:</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger id="status-filter" className="w-full sm:w-[180px]">
                    <SelectValue placeholder="All Orders" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Orders</SelectItem>
                    <SelectItem value="In Process">In Process</SelectItem>
                    <SelectItem value="Delivered">Delivered</SelectItem>
                    <SelectItem value="Cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="sort-direction" className="text-sm font-normal whitespace-nowrap">Sort:</Label>
                <Button
                  id="sort-direction"
                  variant="outline"
                  size="sm"
                  onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
                  className="gap-2"
                >
                  {sortDirection === 'asc' ? (
                    <>
                      <ArrowUpAZ className="h-4 w-4" />
                      Oldest First
                    </>
                  ) : (
                    <>
                      <ArrowDownZA className="h-4 w-4" />
                      Newest First
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Delivery Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total Amount</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow 
                  key={order.id} 
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleRowClick(order)}
                >
                  <TableCell className="font-medium">{order.order_number}</TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{order.customers.name}</div>
                      <div className="text-xs text-muted-foreground">{order.customers.phone}</div>
                    </div>
                  </TableCell>
                  <TableCell>{formatDate(order.delivery_date)}</TableCell>
                  <TableCell>{getStatusBadge(order.status)}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(order.total_amount || 0)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleView(order)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(order)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(order)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {orders.length === 0 && !loading && (
            <div className="text-center py-12 text-muted-foreground">
              No orders found
            </div>
          )}

          {/* Pagination */}
          {totalOrders > 0 && (
            <div className="flex items-center justify-between pt-4">
              <div className="text-sm text-muted-foreground">
                Showing {startIndex + 1} to {Math.min(endIndex, totalOrders)} of {totalOrders} orders
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(page => {
                      // Show first page, last page, current page, and pages around current
                      return page === 1 || 
                             page === totalPages || 
                             (page >= currentPage - 1 && page <= currentPage + 1)
                    })
                    .map((page, index, array) => (
                      <div key={page} className="flex items-center">
                        {index > 0 && array[index - 1] !== page - 1 && (
                          <span className="px-2 text-muted-foreground">...</span>
                        )}
                        <Button
                          variant={currentPage === page ? "default" : "outline"}
                          size="sm"
                          onClick={() => setCurrentPage(page)}
                        >
                          {page}
                        </Button>
                      </div>
                    ))
                  }
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
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
        onOpenChange={(open) => setDetailsDialog({ open, order: open ? detailsDialog.order : null })}
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
