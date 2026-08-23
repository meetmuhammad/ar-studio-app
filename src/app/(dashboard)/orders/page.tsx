"use client"

import { useEffect, useState } from 'react'
import { useDebounce } from 'use-debounce'
import { ArrowDownZA, ArrowUpAZ, Eye, Pencil, Plus, ShoppingCart, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { OrderDialog } from '@/components/dialogs/order-dialog'
import { OrderDetailsDialog } from '@/components/dialogs/order-details-dialog'
import { DeleteConfirmationDialog } from '@/components/dialogs/delete-confirmation-dialog'
import { PageHeader } from '@/components/dashboard/page-header'
import { SearchInput } from '@/components/dashboard/search-input'
import { Pagination } from '@/components/dashboard/pagination'
import { TableSkeleton } from '@/components/dashboard/table-skeleton'
import { EmptyState } from '@/components/dashboard/empty-state'
import { ErrorState } from '@/components/dashboard/error-state'
import {
  SectionCard,
  SectionCardContent,
  SectionCardHeader,
  SectionCardTitle,
} from '@/components/dashboard/section-card'
import { CreateOrderInput } from '@/lib/validators'
import type { OrderWithCustomer } from '@/lib/supabase-client'
import { formatDate, formatPKR } from '@/lib/format'
import { useCreateOrder, useDeleteOrder, useOrders, useUpdateOrder } from '@/hooks/use-api'

const ITEMS_PER_PAGE = 20

/**
 * Status is the one place colour carries meaning on this table, so each value
 * gets a distinct, honest tone: work in hand reads as information, a completed
 * order as success, and a cancelled one as neither — it is a closed state, not
 * a failure, so it stays neutral rather than red.
 */
const STATUS_VARIANT: Record<string, 'info' | 'success' | 'outline' | 'secondary'> = {
  'In Process': 'info',
  Delivered: 'success',
  Cancelled: 'outline',
}

export default function OrdersPage() {
  const [statusFilter, setStatusFilter] = useState<string>('In Process')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch] = useDebounce(searchQuery, 300)
  const [currentPage, setCurrentPage] = useState(1)

  const {
    data: ordersData,
    isLoading: loading,
    isError,
    error,
    refetch: fetchOrders,
  } = useOrders({
    page: currentPage,
    pageSize: ITEMS_PER_PAGE,
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

  // A search should find an order whatever state it is in, so committing a
  // query widens the status filter. Previously this only happened on Enter,
  // which left the field looking unresponsive while you typed.
  useEffect(() => {
    if (debouncedSearch.trim()) setStatusFilter('all')
  }, [debouncedSearch])

  useEffect(() => {
    const handleOrderCreated = () => fetchOrders()
    window.addEventListener('orderCreated', handleOrderCreated)
    return () => window.removeEventListener('orderCreated', handleOrderCreated)
  }, [fetchOrders])

  useEffect(() => {
    setCurrentPage(1)
  }, [statusFilter, sortDirection, debouncedSearch])

  const handleCreateOrder = async (data: CreateOrderInput) => {
    await createOrder.mutateAsync(data)
  }

  const handleUpdateOrder = async (data: CreateOrderInput) => {
    if (!orderDialog.order) return
    await updateOrder.mutateAsync({ id: orderDialog.order.id, data })
  }

  const handleDeleteOrder = async () => {
    if (!deleteDialog.order) return
    await deleteOrder.mutateAsync(deleteDialog.order.id)
  }

  const isFiltered = Boolean(debouncedSearch) || statusFilter !== 'all'

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <PageHeader
        title="Orders"
        description="Every order in the studio, with its delivery date and balance"
        actions={
          <Button size="sm" onClick={() => setOrderDialog({ open: true, order: null })}>
            <Plus className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">New Order</span>
            <span className="sm:hidden">New</span>
          </Button>
        }
      />

      <SearchInput
        value={searchQuery}
        onValueChange={setSearchQuery}
        label="Search orders"
        placeholder="Search by order number, customer name, or phone…"
      />

      {isError ? (
        <ErrorState
          title="Couldn't load orders"
          detail={error instanceof Error ? error.message : undefined}
          onRetry={() => fetchOrders()}
        />
      ) : loading && orders.length === 0 ? (
        <TableSkeleton columns={6} />
      ) : (
        <SectionCard>
          <SectionCardHeader className="gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <SectionCardTitle className="text-base">
                All Orders{' '}
                <span className="font-mono text-sm font-normal tabular-nums text-muted-foreground">
                  ({totalOrders})
                </span>
              </SectionCardTitle>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2">
                  <Label
                    htmlFor="status-filter"
                    className="shrink-0 text-xs font-normal text-muted-foreground"
                  >
                    Status
                  </Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger id="status-filter" className="w-full sm:w-[160px]">
                      <SelectValue placeholder="All orders" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All orders</SelectItem>
                      <SelectItem value="In Process">In Process</SelectItem>
                      <SelectItem value="Delivered">Delivered</SelectItem>
                      <SelectItem value="Cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* The button states the order it will produce when pressed, so
                    the label is the destination, not the current state. */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
                  aria-label={`Sorted ${
                    sortDirection === 'asc' ? 'oldest first' : 'newest first'
                  }. Change to ${sortDirection === 'asc' ? 'newest first' : 'oldest first'}.`}
                >
                  {sortDirection === 'asc' ? (
                    <ArrowUpAZ className="size-4" aria-hidden="true" />
                  ) : (
                    <ArrowDownZA className="size-4" aria-hidden="true" />
                  )}
                  {sortDirection === 'asc' ? 'Oldest first' : 'Newest first'}
                </Button>
              </div>
            </div>
          </SectionCardHeader>

          <SectionCardContent>
            {orders.length === 0 ? (
              <EmptyState
                icon={ShoppingCart}
                message={
                  isFiltered ? 'No orders match these filters' : 'No orders yet'
                }
                action={
                  isFiltered ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSearchQuery('')
                        setStatusFilter('all')
                      }}
                    >
                      Clear filters
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setOrderDialog({ open: true, order: null })}
                    >
                      <Plus className="size-4" aria-hidden="true" />
                      Create the first order
                    </Button>
                  )
                }
              />
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order #</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Delivery</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => (
                      <TableRow
                        key={order.id}
                        className="cursor-pointer"
                        onClick={() => setDetailsDialog({ open: true, order })}
                      >
                        <TableCell className="whitespace-nowrap font-mono font-medium">
                          {order.order_number}
                        </TableCell>
                        <TableCell className="min-w-[10rem]">
                          <div className="font-medium">{order.customers.name}</div>
                          <div className="font-mono text-xs tabular-nums text-muted-foreground">
                            {order.customers.phone}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs tabular-nums">
                          {formatDate(order.delivery_date)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={STATUS_VARIANT[order.status] ?? 'secondary'}
                            className="whitespace-nowrap"
                          >
                            {order.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right font-mono font-medium tabular-nums">
                          {formatPKR(order.total_amount || 0)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div
                            className="flex justify-end gap-1"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`View order ${order.order_number}`}
                              onClick={() => setDetailsDialog({ open: true, order })}
                            >
                              <Eye className="size-4" aria-hidden="true" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Edit order ${order.order_number}`}
                              onClick={() => setOrderDialog({ open: true, order })}
                            >
                              <Pencil className="size-4" aria-hidden="true" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Delete order ${order.order_number}`}
                              onClick={() => setDeleteDialog({ open: true, order })}
                              className="text-muted-foreground hover:text-destructive-text"
                            >
                              <Trash2 className="size-4" aria-hidden="true" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={totalOrders}
                  pageItemCount={orders.length}
                  pageSize={ITEMS_PER_PAGE}
                  itemLabel="orders"
                  onPageChange={setCurrentPage}
                />
              </>
            )}
          </SectionCardContent>
        </SectionCard>
      )}

      <OrderDialog
        open={orderDialog.open}
        onOpenChange={(open) => setOrderDialog({ open, order: null })}
        order={orderDialog.order}
        onSubmit={orderDialog.order ? handleUpdateOrder : handleCreateOrder}
      />

      <OrderDetailsDialog
        open={detailsDialog.open}
        onOpenChange={(open) =>
          setDetailsDialog({ open, order: open ? detailsDialog.order : null })
        }
        order={detailsDialog.order}
      />

      <DeleteConfirmationDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog({ open, order: null })}
        title="Delete order"
        description={`Delete order ${deleteDialog.order?.order_number ?? ''}? This cannot be undone.`}
        onConfirm={handleDeleteOrder}
      />
    </div>
  )
}
