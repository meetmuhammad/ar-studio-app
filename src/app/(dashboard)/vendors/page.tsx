'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, Eye, Edit, Trash2, Search, Tags } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { RoleGuard } from '@/components/auth/role-guard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { VendorWithCategory } from '@/lib/supabase-client'
import { toast } from 'sonner'
import { VendorDialog } from '@/components/dialogs/vendor-dialog'
import { VendorCategoriesDialog } from '@/components/dialogs/vendor-categories-dialog'
import { DeleteConfirmationDialog } from '@/components/dialogs/delete-confirmation-dialog'
import { authFetch } from '@/lib/auth-fetch'
import { ALL_VENDOR_CATEGORIES, filterVendors } from '@/lib/vendor-filter'
import { useVendorCategories } from '@/hooks/use-api'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export default function VendorsPage() {
  const router = useRouter()
  const [vendors, setVendors] = useState<VendorWithCategory[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState(ALL_VENDOR_CATEGORIES)
  const { data: categories = [] } = useVendorCategories()
  // Search matches every category name, archived and empty ones included, so
  // typing a category's name always gives the same vendors as choosing it.
  const { data: allCategories = [] } = useVendorCategories(true)
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingVendor, setEditingVendor] = useState<VendorWithCategory | null>(null)
  const [categoriesDialogOpen, setCategoriesDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<VendorWithCategory | null>(null)

  useEffect(() => {
    fetchVendors()
  }, [])

  const filteredVendors = useMemo(
    () => filterVendors(vendors, { categoryId: categoryFilter, search: searchQuery, categories: allCategories }),
    [vendors, categoryFilter, searchQuery, allCategories]
  )

  const fetchVendors = async () => {
    try {
      const response = await authFetch('/api/vendors')
      if (!response.ok) throw new Error('Failed to fetch vendors')
      const data = await response.json()
      setVendors(data)
    } catch (error) {
      console.error('Error fetching vendors:', error)
      toast.error('Failed to load vendors')
    } finally {
      setIsLoading(false)
    }
  }

  const handleEdit = (vendor: VendorWithCategory) => {
    setEditingVendor(vendor)
    setDialogOpen(true)
  }

  // Asks first (in-app dialog, not the browser's confirm()); confirmDelete does the delete.
  const handleDelete = (vendor: VendorWithCategory) => setDeleteTarget(vendor)

  const confirmDelete = async () => {
    const vendor = deleteTarget
    if (!vendor) return

    try {
      const response = await authFetch(`/api/vendors/${vendor.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) throw new Error('Failed to delete vendor')

      toast.success('Vendor deleted successfully')
      fetchVendors()
    } catch (error) {
      console.error('Error deleting vendor:', error)
      toast.error('Failed to delete vendor')
    }
  }

  const handleCloseDialog = () => {
    setDialogOpen(false)
    setEditingVendor(null)
  }

  if (isLoading) {
    return (
      <RoleGuard allowedRoles={['admin']}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold sm:text-3xl">Vendors</h1>
        </div>
        <div className="text-center py-12">Loading vendors...</div>
      </div>
      </RoleGuard>
    )
  }

  return (
    <RoleGuard allowedRoles={['admin']}>
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold sm:text-3xl">Vendors</h1>
          <p className="text-muted-foreground mt-1">
            Manage your vendors and supplier relationships
          </p>
        </div>
        <div className="flex gap-2 [&>button]:flex-1 sm:[&>button]:flex-none">
          <Button variant="outline" onClick={() => setCategoriesDialogOpen(true)}>
            <Tags className="h-4 w-4 mr-2" />
            Manage Categories
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Vendor
          </Button>
        </div>
      </div>

      {/* Search + Category filter */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-[1fr_auto]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search vendors by name, category, notes, contact, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
          <Label htmlFor="vendor-category-filter" className="text-sm text-muted-foreground whitespace-nowrap">Category</Label>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger id="vendor-category-filter" className="w-full sm:w-[200px]">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VENDOR_CATEGORIES}>All</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Vendors ({filteredVendors.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table stack>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredVendors.map((vendor) => (
                <TableRow key={vendor.id}>
                  <TableCell data-label="Name" className="font-medium">{vendor.name}</TableCell>
                  <TableCell data-label="Category">
                    {vendor.vendor_categories ? (
                      <Badge variant="secondary">{vendor.vendor_categories.name}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell data-label="Description" className="max-w-md">{vendor.notes || '-'}</TableCell>
                  <TableCell data-label="Actions" className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/vendors/${vendor.id}`)}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View Ledger
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(vendor)}
                        aria-label={`Edit ${vendor.name}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(vendor)}
                        aria-label={`Delete ${vendor.name}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filteredVendors.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                {searchQuery ? 'No vendors match your search' : 'No vendors found'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <VendorDialog
        open={dialogOpen}
        onOpenChange={handleCloseDialog}
        vendor={editingVendor}
        onSuccess={() => {
          toast.success(editingVendor ? 'Vendor updated successfully' : 'Vendor created successfully')
          handleCloseDialog()
          fetchVendors()
        }}
      />

      <VendorCategoriesDialog
        open={categoriesDialogOpen}
        onOpenChange={setCategoriesDialogOpen}
      />

      <DeleteConfirmationDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        title="Delete Vendor"
        description={`Are you sure you want to delete ${deleteTarget?.name ?? 'this vendor'}?`}
        onConfirm={confirmDelete}
      />
    </div>
    </RoleGuard>
  )
}
