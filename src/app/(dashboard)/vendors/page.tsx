'use client'

import { useEffect, useState } from 'react'
import { Plus, Eye, Edit, Trash2, Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { RoleGuard } from '@/components/auth/role-guard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Vendor } from '@/lib/supabase-client'
import { toast } from 'sonner'
import { VendorDialog } from '@/components/dialogs/vendor-dialog'

export default function VendorsPage() {
  const router = useRouter()
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [filteredVendors, setFilteredVendors] = useState<Vendor[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null)

  useEffect(() => {
    fetchVendors()
  }, [])

  useEffect(() => {
    // Filter vendors based on search query
    if (!searchQuery.trim()) {
      setFilteredVendors(vendors)
    } else {
      const query = searchQuery.toLowerCase()
      const filtered = vendors.filter(vendor => 
        vendor.name.toLowerCase().includes(query) ||
        (vendor.notes && vendor.notes.toLowerCase().includes(query)) ||
        (vendor.contact_person && vendor.contact_person.toLowerCase().includes(query)) ||
        (vendor.phone && vendor.phone.toLowerCase().includes(query))
      )
      setFilteredVendors(filtered)
    }
  }, [searchQuery, vendors])

  const fetchVendors = async () => {
    try {
      const response = await fetch('/api/vendors')
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

  const handleEdit = (vendor: Vendor) => {
    setEditingVendor(vendor)
    setDialogOpen(true)
  }

  const handleDelete = async (vendor: Vendor) => {
    if (!confirm(`Are you sure you want to delete ${vendor.name}?`)) return

    try {
      const response = await fetch(`/api/vendors/${vendor.id}`, {
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
          <h1 className="text-3xl font-bold">Vendors</h1>
        </div>
        <div className="text-center py-12">Loading vendors...</div>
      </div>
      </RoleGuard>
    )
  }

  return (
    <RoleGuard allowedRoles={['admin']}>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Vendors</h1>
          <p className="text-muted-foreground mt-1">
            Manage your vendors and supplier relationships
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Vendor
        </Button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search vendors by name, notes, contact, or phone..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Vendors ({filteredVendors.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredVendors.map((vendor) => (
                <TableRow key={vendor.id}>
                  <TableCell className="font-medium">{vendor.name}</TableCell>
                  <TableCell className="max-w-md">{vendor.notes || '-'}</TableCell>
                  <TableCell className="text-right">
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
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(vendor)}
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
    </div>
    </RoleGuard>
  )
}
