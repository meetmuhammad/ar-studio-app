"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useDebouncedCallback } from 'use-debounce'

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
  const [customers, setCustomers] = useState<CustomerWithOrderCount[]>([])
  const [loading, setLoading] = useState(true)
  
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

  // Fetch customers from API
  const fetchCustomers = useCallback(async () => {
    try {
      const response = await fetch('/api/customers?pageSize=1000') // Get all customers
      if (!response.ok) {
        throw new Error('Failed to fetch customers')
      }
      
      const data = await response.json()
      setCustomers(data.data || [])
    } catch (error) {
      console.error('Error fetching customers:', error)
      toast.error('Failed to load customers')
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load
  useEffect(() => {
    fetchCustomers()
  }, [])

  // Handle create customer
  const handleCreateCustomer = async (data: CreateCustomerInput) => {
    try {
      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create customer')
      }

      toast.success('Customer created successfully')
      fetchCustomers()
    } catch (error) {
      console.error('Error creating customer:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to create customer')
      throw error
    }
  }

  // Handle update customer
  const handleUpdateCustomer = async (data: CreateCustomerInput) => {
    if (!customerDialog.customer) return

    try {
      const response = await fetch(`/api/customers/${customerDialog.customer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update customer')
      }

      toast.success('Customer updated successfully')
      fetchCustomers()
    } catch (error) {
      console.error('Error updating customer:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to update customer')
      throw error
    }
  }

  // Handle delete customer
  const handleDeleteCustomer = async () => {
    if (!deleteDialog.customer) return

    try {
      const response = await fetch(`/api/customers/${deleteDialog.customer.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete customer')
      }

      toast.success('Customer deleted successfully')
      fetchCustomers()
    } catch (error) {
      console.error('Error deleting customer:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to delete customer')
      throw error
    }
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

  if (loading) {
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

      <Card>
        <CardHeader>
          <CardTitle>All Customers</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={customers}
            searchPlaceholder="Search customers by name or phone..."
            onRowClick={handleRowClick}
          />
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
