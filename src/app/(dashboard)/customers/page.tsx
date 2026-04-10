"use client"

import { useState, useRef } from "react"
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useCustomers, useCreateCustomer, useUpdateCustomer, useDeleteCustomer } from '@/hooks/use-api'

import { DataTable } from '@/components/data-table/data-table'
import { createCustomerColumns } from '@/components/data-table/columns/customer-columns'
import { CustomerDialog } from '@/components/dialogs/customer-dialog'
import { CustomerDetailDialog } from '@/components/dialogs/customer-detail-dialog'
import { DeleteConfirmationDialog } from '@/components/dialogs/delete-confirmation-dialog'
import { CreateCustomerInput } from '@/lib/validators'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Customer } from '@/lib/supabase-client'

interface CustomerWithOrderCount extends Customer {
  orders?: { count: number }
}

export default function CustomersPage() {
  const [currentPage, setCurrentPage] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debounceTimer = useRef<NodeJS.Timeout | null>(null)
  const pageSize = 20
  
  // React Query hooks
  const { data: customersData, isLoading: loading } = useCustomers({
    page: currentPage,
    pageSize,
    q: debouncedSearch,
  })
  const createCustomerMutation = useCreateCustomer()
  const updateCustomerMutation = useUpdateCustomer()
  const deleteCustomerMutation = useDeleteCustomer()
  
  const customers = (customersData?.data || []) as CustomerWithOrderCount[]
  const totalCustomers = customersData?.pagination?.total || 0
  const totalPages = customersData?.pagination?.pages || 1
  
  // Dialog states
  const [customerDialog, setCustomerDialog] = useState<{
    open: boolean
    customer?: CustomerWithOrderCount | null
  }>({ open: false, customer: null })
  
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean
    customer?: CustomerWithOrderCount | null
  }>({ open: false, customer: null })
  
  const [detailDialog, setDetailDialog] = useState<{
    open: boolean
    customer?: CustomerWithOrderCount | null
  }>({ open: false, customer: null })

  // Debounce search input
  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(value)
      setCurrentPage(1)
    }, 300)
  }

  // Handle create customer
  const handleCreateCustomer = async (data: CreateCustomerInput) => {
    await createCustomerMutation.mutateAsync(data)
  }

  // Handle update customer
  const handleUpdateCustomer = async (data: CreateCustomerInput) => {
    if (!customerDialog.customer) return
    await updateCustomerMutation.mutateAsync({ id: customerDialog.customer.id, data })
  }

  // Handle delete customer
  const handleDeleteCustomer = async () => {
    if (!deleteDialog.customer) return
    await deleteCustomerMutation.mutateAsync(deleteDialog.customer.id)
  }

  // Column actions
  const handleEdit = (customer: CustomerWithOrderCount) => {
    setCustomerDialog({ open: true, customer })
  }

  const handleDelete = (customer: CustomerWithOrderCount) => {
    setDeleteDialog({ open: true, customer })
  }

  const handleRowClick = (customer: CustomerWithOrderCount) => {
    setDetailDialog({ open: true, customer })
  }

  const columns = createCustomerColumns({
    onEdit: handleEdit,
    onDelete: handleDelete,
    onRowClick: handleRowClick,
  })

  if (loading && customers.length === 0) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Customers</h2>
            <p className="text-sm sm:text-base text-muted-foreground">Manage all customers and their information.</p>
          </div>
          <Button disabled size="sm" className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            New Customer
          </Button>
        </div>
        <div className="bg-card rounded-lg border p-4 sm:p-6">
          <p className="text-sm sm:text-base text-muted-foreground">Loading customers...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Customers</h2>
          <p className="text-sm sm:text-base text-muted-foreground">Manage all customers and their information.</p>
        </div>
        <Button onClick={() => setCustomerDialog({ open: true, customer: null })} size="sm" className="w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-2" />
          New Customer
        </Button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <input
          type="text"
          placeholder="Search customers by name or phone..."
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 pl-10 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Customers ({totalCustomers})</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={customers}
            searchPlaceholder=""
            onRowClick={handleRowClick}
          />

          {/* Server-side Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <div className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages} ({totalCustomers} total)
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

      {/* Create/Edit Customer Dialog */}
      <CustomerDialog
        open={customerDialog.open}
        onOpenChange={(open) => setCustomerDialog({ open, customer: null })}
        customer={customerDialog.customer}
        onSubmit={customerDialog.customer ? handleUpdateCustomer : handleCreateCustomer}
      />

      {/* Customer Detail Dialog */}
      <CustomerDetailDialog
        open={detailDialog.open}
        onOpenChange={(open) => setDetailDialog({ open, customer: null })}
        customer={detailDialog.customer || null}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog({ open, customer: null })}
        title="Delete Customer"
        description={`Are you sure you want to delete ${deleteDialog.customer?.name}? This action cannot be undone.`}
        onConfirm={handleDeleteCustomer}
      />
    </div>
  )
}
