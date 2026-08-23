"use client"

import { useEffect, useState } from 'react'
import { useDebounce } from 'use-debounce'
import { Plus, Users } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/data-table/data-table'
import { createCustomerColumns } from '@/components/data-table/columns/customer-columns'
import { CustomerDialog } from '@/components/dialogs/customer-dialog'
import { CustomerDetailDialog } from '@/components/dialogs/customer-detail-dialog'
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
import { CreateCustomerInput } from '@/lib/validators'
import type { Customer } from '@/lib/supabase-client'
import {
  useCreateCustomer,
  useCustomers,
  useDeleteCustomer,
  useUpdateCustomer,
} from '@/hooks/use-api'

const PAGE_SIZE = 20

interface CustomerWithOrderCount extends Customer {
  orders?: { count: number }
}

export default function CustomersPage() {
  const [currentPage, setCurrentPage] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch] = useDebounce(searchQuery, 300)

  const {
    data: customersData,
    isLoading: loading,
    isError,
    error,
    refetch,
  } = useCustomers({
    page: currentPage,
    pageSize: PAGE_SIZE,
    q: debouncedSearch,
  })

  const createCustomerMutation = useCreateCustomer()
  const updateCustomerMutation = useUpdateCustomer()
  const deleteCustomerMutation = useDeleteCustomer()

  const customers = (customersData?.data || []) as CustomerWithOrderCount[]
  const totalCustomers = customersData?.pagination?.total || 0
  const totalPages = customersData?.pagination?.pages || 1

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

  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearch])

  const handleCreateCustomer = async (data: CreateCustomerInput) => {
    await createCustomerMutation.mutateAsync(data)
  }

  const handleUpdateCustomer = async (data: CreateCustomerInput) => {
    if (!customerDialog.customer) return
    await updateCustomerMutation.mutateAsync({ id: customerDialog.customer.id, data })
  }

  const handleDeleteCustomer = async () => {
    if (!deleteDialog.customer) return
    await deleteCustomerMutation.mutateAsync(deleteDialog.customer.id)
  }

  const handleRowClick = (customer: CustomerWithOrderCount) => {
    setDetailDialog({ open: true, customer })
  }

  const columns = createCustomerColumns({
    onEdit: (customer) => setCustomerDialog({ open: true, customer }),
    onDelete: (customer) => setDeleteDialog({ open: true, customer }),
    onRowClick: handleRowClick,
  })

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <PageHeader
        title="Customers"
        description="Everyone the studio has measured, fitted, or billed"
        actions={
          <Button size="sm" onClick={() => setCustomerDialog({ open: true, customer: null })}>
            <Plus className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">New Customer</span>
            <span className="sm:hidden">New</span>
          </Button>
        }
      />

      <SearchInput
        value={searchQuery}
        onValueChange={setSearchQuery}
        label="Search customers"
        placeholder="Search by name or phone…"
      />

      {isError ? (
        <ErrorState
          title="Couldn't load customers"
          detail={error instanceof Error ? error.message : undefined}
          onRetry={() => refetch()}
        />
      ) : loading && customers.length === 0 ? (
        <TableSkeleton columns={5} />
      ) : (
        <SectionCard>
          <SectionCardHeader>
            <SectionCardTitle className="text-base">
              All Customers{' '}
              <span className="font-mono text-sm font-normal tabular-nums text-muted-foreground">
                ({totalCustomers})
              </span>
            </SectionCardTitle>
          </SectionCardHeader>

          <SectionCardContent>
            {customers.length === 0 ? (
              <EmptyState
                icon={Users}
                message={
                  debouncedSearch ? 'No customers match your search' : 'No customers yet'
                }
                action={
                  debouncedSearch ? (
                    <Button variant="outline" size="sm" onClick={() => setSearchQuery('')}>
                      Clear search
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCustomerDialog({ open: true, customer: null })}
                    >
                      <Plus className="size-4" aria-hidden="true" />
                      Add the first customer
                    </Button>
                  )
                }
              />
            ) : (
              <>
                {/* Toolbar and footer off: this route is server-paginated, so the
                    table's own search would filter one page while appearing to
                    search all of them, and its footer would contradict the pager
                    below it. */}
                <DataTable
                  columns={columns}
                  data={customers}
                  showToolbar={false}
                  showPagination={false}
                  onRowClick={handleRowClick}
                />

                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={totalCustomers}
                  pageItemCount={customers.length}
                  pageSize={PAGE_SIZE}
                  itemLabel="customers"
                  onPageChange={setCurrentPage}
                />
              </>
            )}
          </SectionCardContent>
        </SectionCard>
      )}

      <CustomerDialog
        open={customerDialog.open}
        onOpenChange={(open) => setCustomerDialog({ open, customer: null })}
        customer={customerDialog.customer}
        onSubmit={customerDialog.customer ? handleUpdateCustomer : handleCreateCustomer}
      />

      <CustomerDetailDialog
        open={detailDialog.open}
        onOpenChange={(open) => setDetailDialog({ open, customer: null })}
        customer={detailDialog.customer || null}
      />

      <DeleteConfirmationDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog({ open, customer: null })}
        title="Delete customer"
        description={`Delete ${deleteDialog.customer?.name ?? 'this customer'}? This cannot be undone.`}
        onConfirm={handleDeleteCustomer}
      />
    </div>
  )
}
