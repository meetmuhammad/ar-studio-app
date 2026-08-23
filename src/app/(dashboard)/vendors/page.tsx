'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Edit, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { RoleGuard } from '@/components/auth/role-guard'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { VendorDialog } from '@/components/dialogs/vendor-dialog'
import { DeleteConfirmationDialog } from '@/components/dialogs/delete-confirmation-dialog'
import { PageHeader } from '@/components/dashboard/page-header'
import { SearchInput } from '@/components/dashboard/search-input'
import { TableSkeleton } from '@/components/dashboard/table-skeleton'
import { EmptyState } from '@/components/dashboard/empty-state'
import { ErrorState } from '@/components/dashboard/error-state'
import {
  SectionCard,
  SectionCardContent,
  SectionCardHeader,
  SectionCardTitle,
} from '@/components/dashboard/section-card'
import type { Vendor } from '@/lib/supabase-client'

export default function VendorsPage() {
  const router = useRouter()
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null)
  const [deletingVendor, setDeletingVendor] = useState<Vendor | null>(null)

  useEffect(() => {
    fetchVendors()
  }, [])

  // Derived, not mirrored into state: the previous copy in a second useState
  // rendered one frame behind the query on every keystroke.
  const filteredVendors = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return vendors

    return vendors.filter((vendor) =>
      [vendor.name, vendor.notes, vendor.contact_person, vendor.phone].some((field) =>
        field?.toLowerCase().includes(query)
      )
    )
  }, [searchQuery, vendors])

  const fetchVendors = async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const response = await fetch('/api/vendors')
      if (!response.ok) throw new Error('Failed to fetch vendors')
      setVendors(await response.json())
    } catch (error) {
      console.error('Error fetching vendors:', error)
      // Held in state as well as toasted: a toast is gone in seconds and the
      // page behind it used to look like a studio with no vendors.
      setLoadError(error instanceof Error ? error.message : 'Failed to load vendors')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingVendor) return

    const response = await fetch(`/api/vendors/${deletingVendor.id}`, { method: 'DELETE' })
    if (!response.ok) {
      toast.error('Failed to delete vendor')
      throw new Error('Failed to delete vendor')
    }

    toast.success(`Deleted ${deletingVendor.name}`)
    setDeletingVendor(null)
    fetchVendors()
  }

  const handleCloseDialog = () => {
    setDialogOpen(false)
    setEditingVendor(null)
  }

  return (
    <RoleGuard allowedRoles={['admin']}>
      <div className="mx-auto max-w-[1600px] space-y-6">
        <PageHeader
          title="Vendors"
          description="Suppliers you buy from and the ledger you keep with each"
          actions={
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Add Vendor</span>
              <span className="sm:hidden">Add</span>
            </Button>
          }
        />

        <SearchInput
          value={searchQuery}
          onValueChange={setSearchQuery}
          label="Search vendors"
          placeholder="Search by name, contact, phone, or notes…"
        />

        {loadError ? (
          <ErrorState
            title="Couldn't load vendors"
            detail={loadError}
            onRetry={fetchVendors}
          />
        ) : isLoading ? (
          <TableSkeleton columns={3} rows={6} />
        ) : (
          <SectionCard>
            <SectionCardHeader>
              <SectionCardTitle className="text-base">
                All Vendors{' '}
                <span className="font-mono text-sm font-normal tabular-nums text-muted-foreground">
                  ({filteredVendors.length})
                </span>
              </SectionCardTitle>
            </SectionCardHeader>

            <SectionCardContent>
              {filteredVendors.length === 0 ? (
                <EmptyState
                  icon={Building2}
                  message={
                    searchQuery ? 'No vendors match your search' : 'No vendors yet'
                  }
                  action={
                    searchQuery ? (
                      <Button variant="outline" size="sm" onClick={() => setSearchQuery('')}>
                        Clear search
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
                        <Plus className="size-4" aria-hidden="true" />
                        Add the first vendor
                      </Button>
                    )
                  }
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="text-right">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredVendors.map((vendor) => (
                      <TableRow
                        key={vendor.id}
                        className="cursor-pointer"
                        onClick={() => router.push(`/vendors/${vendor.id}`)}
                      >
                        <TableCell className="font-medium">{vendor.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {vendor.contact_person ? (
                            <div className="text-sm">{vendor.contact_person}</div>
                          ) : null}
                          {vendor.phone ? (
                            <div className="font-mono text-xs tabular-nums">{vendor.phone}</div>
                          ) : null}
                          {!vendor.contact_person && !vendor.phone ? '—' : null}
                        </TableCell>
                        <TableCell className="max-w-md text-muted-foreground">
                          {vendor.notes || '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div
                            className="flex justify-end gap-1"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => router.push(`/vendors/${vendor.id}`)}
                            >
                              <span className="hidden sm:inline">View ledger</span>
                              <span className="sm:hidden">Ledger</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Edit ${vendor.name}`}
                              onClick={() => {
                                setEditingVendor(vendor)
                                setDialogOpen(true)
                              }}
                            >
                              <Edit className="size-4" aria-hidden="true" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Delete ${vendor.name}`}
                              onClick={() => setDeletingVendor(vendor)}
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
              )}
            </SectionCardContent>
          </SectionCard>
        )}

        <VendorDialog
          open={dialogOpen}
          onOpenChange={handleCloseDialog}
          vendor={editingVendor}
          onSuccess={() => {
            toast.success(editingVendor ? 'Vendor updated' : 'Vendor created')
            handleCloseDialog()
            fetchVendors()
          }}
        />

        <DeleteConfirmationDialog
          open={Boolean(deletingVendor)}
          onOpenChange={(open) => {
            if (!open) setDeletingVendor(null)
          }}
          title="Delete vendor"
          description={`Delete ${deletingVendor?.name ?? 'this vendor'}? Their ledger history goes with them. This cannot be undone.`}
          onConfirm={handleDelete}
        />
      </div>
    </RoleGuard>
  )
}
